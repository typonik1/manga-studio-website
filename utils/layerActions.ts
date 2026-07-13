import { useStore } from '@/store/useStore';
import {
  buildCleanupMask,
  buildCleanupSource,
  buildCleanupSourceCanvas,
  createCleanupPatch,
  createColorPatch,
} from './cleanupRaster';
import { simpleInpaint } from './imageUtils';
import { cleanupWithClipdrop, removeBackgroundWithClipdrop } from '@/lib/clipdrop/client';
import type { ImageDocument, MaskElement } from '@/types';

function newLayerId() {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getActiveDoc(): ImageDocument | null {
  const { documents, activeDocIndex } = useStore.getState();
  return activeDocIndex >= 0 ? documents[activeDocIndex] : null;
}

function refreshDoc(id: string): ImageDocument | null {
  return useStore.getState().documents.find(doc => doc.id === id) ?? null;
}

export function hasActiveSelection(doc: ImageDocument | null): boolean {
  if (!doc) return false;
  const mask = doc.masks.find(item => item.id === doc.activeMaskId);
  if (!mask) return false;
  return (mask.elements?.length ?? 0) > 0 || mask.strokes.some(stroke => stroke.mode !== 'erase');
}

async function requireSelectionMask(doc: ImageDocument) {
  const mask = await buildCleanupMask(doc);
  if (mask.isEmpty) throw new Error('Сначала создайте выделение: кистью маски, лассо, прямоугольником или волшебной палочкой.');
  return mask;
}

function finishSelection(clearedByDefault = true) {
  const { cleanupSettings, clearActiveMask } = useStore.getState();
  if (clearedByDefault && !cleanupSettings.keepSelectionAfterAction) clearActiveMask();
}

/**
 * «Удалить пиксели» — makes the selected area transparent, fully locally.
 * Applies a non-destructive erase mask to the explicitly passed target layer.
 * When no target is given, falls back to the currently selected layer
 * (or the base layer when nothing else is selected).
 */
export async function deleteMaskedPixels(target?: { id?: string; type: 'base' | 'ai' }): Promise<void> {
  const doc = getActiveDoc();
  if (!doc) throw new Error('Нет активного изображения.');
  const mask = await requireSelectionMask(doc);
  const element: MaskElement = { type: 'bitmap', src: mask.canvas.toDataURL('image/png') };

  const state = useStore.getState();
  // The explicit target always wins — never depend on selectedLayer when it's given.
  const resolved = target ?? (doc.selectedLayer?.type === 'ai' ? { id: doc.selectedLayer.id, type: 'ai' as const } : { type: 'base' as const });

  if (resolved.type === 'ai' && resolved.id) {
    if (!doc.aiLayers.some(layer => layer.id === resolved.id)) throw new Error('Слой не найден.');
    state.addEraseElement({ id: resolved.id, type: 'ai' }, element);
    finishSelection();
    return;
  }

  // Target is the base layer.
  if (doc.baseLayer?.locked !== false) {
    const makeCopy = window.confirm('Исходник заблокирован. Создать редактируемую копию и удалить пиксели на ней?');
    if (!makeCopy) return;
    const copyId = state.duplicateBaseLayer();
    if (!copyId) throw new Error('Не удалось создать копию исходника.');
    useStore.getState().addEraseElement({ id: copyId, type: 'ai' }, element);
    // Hide the base so the erased area actually turns transparent.
    useStore.getState().updateBaseLayer({ visible: false });
    finishSelection();
    return;
  }

  state.addEraseElement({ type: 'base' }, element);
  finishSelection();
}

/** «Залить цветом» — fills the selection with a flat color as a new raster patch layer. */
export async function fillMaskedArea(color: string): Promise<void> {
  const doc = getActiveDoc();
  if (!doc) throw new Error('Нет активного изображения.');
  const mask = await requireSelectionMask(doc);
  const patch = await createColorPatch(mask.canvas, doc.width, doc.height, color);
  const activeMaskId = doc.activeMaskId ?? undefined;
  useStore.getState().addAiLayer(doc.id, {
    id: newLayerId(),
    name: `Заливка ${doc.aiLayers.length + 1}`,
    src: patch,
    visible: true,
    opacity: 1,
    operation: 'cleanup',
    maskId: activeMaskId,
    eraseElements: [],
  });
  finishSelection();
}

/** «Локально восстановить» — browser-only inpainting of the selection (simpleInpaint). */
export async function inpaintMaskedArea(): Promise<void> {
  const doc = getActiveDoc();
  if (!doc) throw new Error('Нет активного изображения.');
  const { setInpaintRunning, cleanupSettings } = useStore.getState();
  setInpaintRunning(true, 10);
  try {
    const canvas = await buildCleanupSourceCanvas(doc);
    const ctx = canvas.getContext('2d')!;
    setInpaintRunning(true, 35);
    const mask = await requireSelectionMask(doc);
    setInpaintRunning(true, 55);
    const maskCtx = mask.canvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const maskData = maskCtx.getImageData(0, 0, mask.canvas.width, mask.canvas.height);
    const result = simpleInpaint(imageData, maskData, cleanupSettings.inpaintRadius * 3);
    setInpaintRunning(true, 85);
    ctx.putImageData(result, 0, 0);
    const patch = await createCleanupPatch(canvas.toDataURL('image/png'), mask.canvas, doc.width, doc.height);
    useStore.getState().addAiLayer(doc.id, {
      id: newLayerId(),
      name: `Локальное замывание ${doc.aiLayers.filter(layer => layer.operation === 'cleanup').length + 1}`,
      src: patch,
      visible: true,
      opacity: 1,
      operation: 'cleanup',
      maskId: doc.activeMaskId ?? undefined,
      eraseElements: [],
    });
    finishSelection();
    setInpaintRunning(false, 100);
  } catch (error) {
    setInpaintRunning(false, 0);
    throw error;
  }
}

/** «AI-восстановление» — Clipdrop Cleanup on the current selection; result becomes a new layer. */
export async function aiCleanupMaskedArea(signal?: AbortSignal): Promise<void> {
  const doc = getActiveDoc();
  if (!doc) throw new Error('Нет активного изображения.');
  const mask = await requireSelectionMask(doc);
  const image = await buildCleanupSource(doc);
  const fullResult = await cleanupWithClipdrop(image, mask.blob, signal);
  const patch = await createCleanupPatch(fullResult, mask.canvas, doc.width, doc.height);
  const current = refreshDoc(doc.id) ?? doc;
  useStore.getState().addAiLayer(doc.id, {
    id: newLayerId(),
    name: `Удаление объекта ${current.aiLayers.filter(layer => layer.operation === 'cleanup').length + 1}`,
    src: patch,
    visible: true,
    opacity: 1,
    operation: 'cleanup',
    maskId: doc.activeMaskId ?? undefined,
    eraseElements: [],
  });
  finishSelection();
}

/**
 * Shared Clipdrop Remove Background operation, used by the left panel
 * and the layer context menu. Creates a new raster layer, keeps the source.
 */
export async function removeBackgroundFromLayer(layer: { id: string; type: 'base' | 'ai' }, signal?: AbortSignal): Promise<void> {
  const doc = getActiveDoc();
  if (!doc) throw new Error('Нет активного изображения.');

  let image: Blob;
  if (layer.type === 'ai') {
    const source = doc.aiLayers.find(item => item.id === layer.id);
    if (!source) throw new Error('Слой не найден.');
    const response = await fetch(source.src);
    image = await response.blob();
  } else {
    image = await buildCleanupSource(doc);
  }

  const result = await removeBackgroundWithClipdrop(image, signal);
  const current = refreshDoc(doc.id) ?? doc;
  useStore.getState().addAiLayer(doc.id, {
    id: newLayerId(),
    name: `Фон удалён ${current.aiLayers.filter(layer => layer.operation === 'remove-background').length + 1}`,
    src: result,
    visible: true,
    opacity: 1,
    operation: 'remove-background',
    replacesBase: layer.type === 'base',
    eraseElements: [],
  });
}
