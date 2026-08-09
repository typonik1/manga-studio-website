import type { BlurSettings, StrokeData } from '@/types';
import { buildBaseCanvas, buildCleanupMask, buildRasterLayerCanvas } from './cleanupRaster';
import { drawBrushStroke } from './brushRaster';
import { useStore } from '@/store/useStore';

function createEffectCanvas(source: HTMLCanvasElement, settings: BlurSettings) {
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d')!;
  if (settings.mode === 'blur') {
    context.filter = `blur(${Math.max(1, Math.round(settings.intensity * 36))}px)`;
    context.drawImage(source, 0, 0);
  } else if (settings.mode === 'pixelate') {
    const block = Math.max(2, Math.round(3 + settings.intensity * 42));
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.ceil(source.width / block));
    small.height = Math.max(1, Math.ceil(source.height / block));
    const smallContext = small.getContext('2d')!;
    smallContext.imageSmoothingEnabled = false;
    smallContext.drawImage(source, 0, 0, small.width, small.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(small, 0, 0, small.width, small.height, 0, 0, source.width, source.height);
  } else {
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, source.width, source.height);
    const strength = Math.round(settings.intensity * 72);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const noise = (Math.random() - 0.5) * strength;
      pixels.data[index] += noise;
      pixels.data[index + 1] += noise;
      pixels.data[index + 2] += noise;
    }
    context.putImageData(pixels, 0, 0);
  }
  return output;
}

function createBrushMask(width: number, height: number, points: number[], settings: BlurSettings) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const stroke: StrokeData = {
    id: 'effect-preview',
    points,
    size: settings.brushSize,
    color: '#ffffff',
    opacity: 1,
    hardness: settings.hardness,
    mode: 'paint',
  };
  drawBrushStroke(context, stroke, width, height, { color: '#ffffff' });
  return canvas;
}

/** Apply an effect as a cancellable preview. The caller owns commit/cancel. */
export async function applyRasterEffectPreview(points?: number[]) {
  const state = useStore.getState();
  const doc = state.documents[state.activeDocIndex];
  if (!doc) throw new Error('Нет активной страницы.');
  const selected = doc.selectedLayer;
  const aiLayer = selected?.type === 'ai' ? doc.aiLayers.find(layer => layer.id === selected.id) : null;
  if (aiLayer?.locked) throw new Error('Слой заблокирован. Снимите блокировку перед применением эффекта.');
  const source = aiLayer
    ? await buildRasterLayerCanvas(aiLayer, doc.width, doc.height)
    : await buildBaseCanvas(doc);
  const effected = createEffectCanvas(source, state.blurSettings);
  let mask: HTMLCanvasElement;
  if (state.blurSettings.applyTo === 'selection') {
    const selection = await buildCleanupMask(doc);
    if (selection.isEmpty) throw new Error('Сначала создайте выделение.');
    mask = selection.canvas;
  } else if (points?.length) {
    mask = createBrushMask(doc.width, doc.height, points, state.blurSettings);
  } else {
    mask = window.document.createElement('canvas');
    mask.width = doc.width;
    mask.height = doc.height;
    const maskContext = mask.getContext('2d')!;
    maskContext.fillStyle = '#fff';
    maskContext.fillRect(0, 0, mask.width, mask.height);
  }
  const output = window.document.createElement('canvas');
  output.width = doc.width;
  output.height = doc.height;
  const context = output.getContext('2d')!;
  context.drawImage(source, 0, 0);
  const effectPatch = window.document.createElement('canvas');
  effectPatch.width = doc.width;
  effectPatch.height = doc.height;
  const patchContext = effectPatch.getContext('2d')!;
  patchContext.drawImage(effected, 0, 0);
  patchContext.globalCompositeOperation = 'destination-in';
  patchContext.drawImage(mask, 0, 0);
  context.drawImage(effectPatch, 0, 0);
  const src = output.toDataURL('image/png');
  if (aiLayer) {
    state.pushHistory();
    state.updateAiLayer(aiLayer.id, { src, adjustments: { brightness: 1, contrast: 1, saturation: 1 } }, { history: false });
    return aiLayer.id;
  }
  const id = `ai-effect-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  state.addAiLayer(doc.id, {
    id,
    name: state.blurSettings.mode === 'pixelate' ? 'Пикселизация' : state.blurSettings.mode === 'noise' ? 'Шум' : 'Размытие',
    src,
    visible: true,
    opacity: 1,
    operation: 'effect',
    locked: false,
    eraseElements: [],
    crop: null,
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  });
  return id;
}
