import { useStore } from '@/store/useStore';
import type { ImageDocument, TextObject } from '@/types';
import { uid } from './imageUtils';
import {
  buildCleanupSourceCanvas,
  encodeCanvasToBudget,
  loadCleanupImage,
} from './cleanupRaster';
import { aiCleanupMaskedArea, finishSelection, inpaintMaskedArea, requireSelectionMask } from './layerActions';
import { ocrTranslate, redrawRegion } from '@/lib/routerai/client';

const TRANSLATE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

export type BubbleCleanupMethod = 'local' | 'clipdrop';

export interface TranslateBubbleResult {
  original: string;
  translation: string;
  draft: TextObject;
}

interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BubbleCrop {
  image: Blob;
  crop: SelectionBounds;
  selection: SelectionBounds;
}

function activeDocument(): ImageDocument {
  const { documents, activeDocIndex } = useStore.getState();
  const doc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;
  if (!doc) throw new Error('Нет активного изображения.');
  return doc;
}

function getSelectionBounds(maskCanvas: HTMLCanvasElement): SelectionBounds {
  const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas недоступен.');
  const pixels = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  let minX = maskCanvas.width;
  let minY = maskCanvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < maskCanvas.height; y++) {
    for (let x = 0; x < maskCanvas.width; x++) {
      if (pixels[(y * maskCanvas.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) throw new Error('Выделение пустое.');
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function buildBubbleCrop(doc: ImageDocument): Promise<BubbleCrop> {
  const mask = await requireSelectionMask(doc);
  const selection = getSelectionBounds(mask.canvas);
  const pad = Math.max(8, Math.round(Math.max(selection.width, selection.height) * 0.15));
  const cropX = Math.max(0, selection.x - pad);
  const cropY = Math.max(0, selection.y - pad);
  const cropRight = Math.min(doc.width, selection.x + selection.width + pad);
  const cropBottom = Math.min(doc.height, selection.y + selection.height + pad);
  const crop = {
    x: cropX,
    y: cropY,
    width: Math.max(1, cropRight - cropX),
    height: Math.max(1, cropBottom - cropY),
  };

  const source = await buildCleanupSourceCanvas(doc);
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен.');
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const encoded = await encodeCanvasToBudget(canvas, TRANSLATE_IMAGE_MAX_BYTES);
  return { image: encoded.blob, crop, selection };
}

function createBubbleTextDraft(doc: ImageDocument, selection: SelectionBounds, translation: string): TextObject {
  const { textSettings } = useStore.getState();
  return {
    id: uid(),
    text: translation.trim(),
    fontFamily: textSettings.fontFamily,
    fontSize: textSettings.fontSize,
    fill: textSettings.fill,
    stroke: textSettings.stroke,
    strokeWidth: textSettings.strokeWidth,
    shadowColor: textSettings.shadowColor,
    shadowBlur: textSettings.shadowBlur,
    lineHeight: textSettings.lineHeight,
    align: 'center',
    width: Math.max(0.04, Math.min(1, selection.width / doc.width)),
    x: Math.max(0, Math.min(0.96, selection.x / doc.width)),
    y: Math.max(0, Math.min(0.96, selection.y / doc.height)),
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    visible: true,
  };
}

export async function translateBubble(
  targetLang = 'ru',
  cleanupMethod: BubbleCleanupMethod = 'local',
  signal?: AbortSignal,
): Promise<TranslateBubbleResult> {
  const doc = activeDocument();
  const crop = await buildBubbleCrop(doc);
  const result = await ocrTranslate(crop.image, targetLang, signal);
  const translation = result.translation.trim();
  if (!translation) throw new Error('Модель не нашла текст для перевода.');

  if (cleanupMethod === 'clipdrop') {
    await aiCleanupMaskedArea(signal);
  } else {
    await inpaintMaskedArea();
  }

  return {
    original: result.original.trim(),
    translation,
    draft: createBubbleTextDraft(doc, crop.selection, translation),
  };
}

export async function redrawSfx(signal?: AbortSignal): Promise<void> {
  const doc = activeDocument();
  const crop = await buildBubbleCrop(doc);
  const resultDataUrl = await redrawRegion(
    crop.image,
    'Удали нарисованный текст и звуки и восстанови рисунок под ними. Сохрани стиль, линии, освещение и фактуру исходной манги.',
    signal,
  );
  const result = await loadCleanupImage(resultDataUrl);
  const patch = document.createElement('canvas');
  patch.width = doc.width;
  patch.height = doc.height;
  const ctx = patch.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен.');
  ctx.drawImage(result, crop.crop.x, crop.crop.y, crop.crop.width, crop.crop.height);

  const current = useStore.getState().documents.find(item => item.id === doc.id) ?? doc;
  useStore.getState().addAiLayer(doc.id, {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `Перерисовка участка ${current.aiLayers.filter(layer => layer.operation === 'cleanup').length + 1}`,
    src: patch.toDataURL('image/png'),
    visible: true,
    opacity: 1,
    operation: 'cleanup',
    maskId: current.activeMaskId ?? undefined,
    eraseElements: [],
  });
  finishSelection();
}
