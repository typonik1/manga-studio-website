import type { AiRasterLayer, ImageDocument, MaskElement, StrokeData } from '@/types';

export function loadCleanupImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось загрузить изображение.'));
    image.src = src;
  });
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось создать PNG.')), 'image/png');
  });
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, width: number, height: number) {
  if (stroke.points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = Math.max(1, stroke.size * height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
  for (let index = 0; index < stroke.points.length; index += 2) {
    const x = stroke.points[index] * width;
    const y = stroke.points[index + 1] * height;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

async function drawElement(ctx: CanvasRenderingContext2D, element: MaskElement, width: number, height: number) {
  if (element.type === 'brush') return drawStroke(ctx, element.stroke, width, height);
  if (element.type === 'polygon') {
    if (element.points.length < 6) return;
    ctx.save();
    ctx.globalCompositeOperation = element.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.fillStyle = 'white';
    ctx.beginPath();
    for (let index = 0; index < element.points.length; index += 2) {
      const x = element.points[index] * width;
      const y = element.points[index + 1] * height;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  const bitmap = await loadCleanupImage(element.src);
  ctx.save();
  ctx.globalCompositeOperation = element.mode === 'erase' ? 'destination-out' : 'source-over';
  ctx.drawImage(bitmap, 0, 0, width, height);
  ctx.restore();
}

/** Rasterizes mask elements into a standalone alpha mask canvas. */
export async function buildElementsMaskCanvas(elements: MaskElement[], width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен.');
  for (const element of elements) await drawElement(ctx, element, width, height);
  return canvas;
}

/** Punches erase-mask elements out of the target canvas (destination-out). */
export async function applyEraseElements(target: HTMLCanvasElement, elements: MaskElement[] | undefined) {
  if (!elements?.length) return;
  const mask = await buildElementsMaskCanvas(elements, target.width, target.height);
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
}

function adjustmentsFilter(adjustments?: { brightness: number; contrast: number; saturation: number }): string {
  if (!adjustments) return 'none';
  const { brightness, contrast, saturation } = adjustments;
  if (brightness === 1 && contrast === 1 && saturation === 1) return 'none';
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
}

/** Renders the base (original + committed cleanup) with adjustments and erase mask, without opacity. */
export async function buildBaseCanvas(doc: ImageDocument): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен.');
  const source = await loadCleanupImage(doc.cleanup.committed ?? doc.originalSrc);
  ctx.save();
  ctx.filter = adjustmentsFilter(doc.baseLayer?.adjustments);
  ctx.drawImage(source, 0, 0, doc.width, doc.height);
  ctx.restore();
  await applyEraseElements(canvas, doc.baseLayer?.eraseElements);
  return canvas;
}

/** Renders one raster/AI layer with its own erase mask applied. */
export async function buildRasterLayerCanvas(layer: AiRasterLayer, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен.');
  const image = await loadCleanupImage(layer.src);
  ctx.drawImage(image, 0, 0, width, height);
  await applyEraseElements(canvas, layer.eraseElements);
  return canvas;
}

export async function buildCleanupSourceCanvas(doc: ImageDocument): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен.');
  const replacing = [...(doc.aiLayers ?? [])].reverse().find(layer => layer.visible && layer.replacesBase);
  const baseVisible = doc.baseLayer?.visible !== false;
  if (!replacing && baseVisible) {
    const base = await buildBaseCanvas(doc);
    ctx.save();
    ctx.globalAlpha = doc.baseLayer?.opacity ?? 1;
    ctx.drawImage(base, 0, 0, doc.width, doc.height);
    ctx.restore();
  }
  for (const layer of doc.aiLayers ?? []) {
    if (!layer.visible) continue;
    try {
      const image = await buildRasterLayerCanvas(layer, doc.width, doc.height);
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(image, 0, 0, doc.width, doc.height);
      ctx.restore();
    } catch { /* ignore broken optional layers */ }
  }
  return canvas;
}

export async function buildCleanupSource(doc: ImageDocument): Promise<Blob> {
  return canvasToPngBlob(await buildCleanupSourceCanvas(doc));
}

export async function buildCleanupMaskCanvas(doc: ImageDocument): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas недоступен.');
  const activeMask = (doc.masks ?? []).find(mask => mask.id === doc.activeMaskId);
  const elements = activeMask?.elements?.length
    ? activeMask.elements
    : (activeMask?.strokes ?? []).map(stroke => ({ type: 'brush', stroke }) as MaskElement);
  for (const element of elements) await drawElement(ctx, element, doc.width, doc.height);
  return canvas;
}

export async function buildCleanupMask(doc: ImageDocument): Promise<{ blob: Blob; isEmpty: boolean; canvas: HTMLCanvasElement }> {
  const canvas = await buildCleanupMaskCanvas(doc);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas недоступен.');
  const pixels = ctx.getImageData(0, 0, doc.width, doc.height).data;
  let isEmpty = true;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 8) { isEmpty = false; break; }
  }
  const output = document.createElement('canvas');
  output.width = doc.width; output.height = doc.height;
  const outputCtx = output.getContext('2d')!;
  outputCtx.fillStyle = 'black'; outputCtx.fillRect(0, 0, doc.width, doc.height);
  outputCtx.drawImage(canvas, 0, 0);
  return { blob: await canvasToPngBlob(output), isEmpty, canvas };
}

export async function createColorPatch(maskCanvas: HTMLCanvasElement, width: number, height: number, color: string): Promise<string> {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(maskCanvas, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

export async function createCleanupPatch(resultSrc: string, maskCanvas: HTMLCanvasElement, width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const result = await loadCleanupImage(resultSrc);
  ctx.drawImage(result, 0, 0, width, height);
  const feather = document.createElement('canvas'); feather.width = width; feather.height = height;
  const featherCtx = feather.getContext('2d')!;
  featherCtx.filter = 'blur(3px)'; featherCtx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(feather, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function createFloodMask(doc: ImageDocument, normalizedX: number, normalizedY: number, threshold: number, contiguous = true) {
  const source = await buildCleanupSourceCanvas(doc);
  const ctx = source.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  const sx = Math.min(width - 1, Math.max(0, Math.floor(normalizedX * width)));
  const sy = Math.min(height - 1, Math.max(0, Math.floor(normalizedY * height)));
  const seed = (sy * width + sx) * 4;
  const selected = new Uint8Array(width * height);
  let count = 0;
  const limit = Math.max(4, threshold * 2.55);
  const matches = (offset: number) =>
    Math.max(Math.abs(data[offset] - data[seed]), Math.abs(data[offset + 1] - data[seed + 1]), Math.abs(data[offset + 2] - data[seed + 2]), Math.abs(data[offset + 3] - data[seed + 3])) <= limit;
  if (contiguous) {
    const queued = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0, tail = 0;
    const seedPixel = sy * width + sx;
    queue[tail++] = seedPixel;
    queued[seedPixel] = 1;
    while (head < tail) {
      const pixel = queue[head++];
      if (!matches(pixel * 4)) continue;
      selected[pixel] = 1; count++;
      const x = pixel % width, y = Math.floor(pixel / width);
      const enqueue = (next: number) => { if (!queued[next]) { queued[next] = 1; queue[tail++] = next; } };
      if (x > 0) enqueue(pixel - 1);
      if (x + 1 < width) enqueue(pixel + 1);
      if (y > 0) enqueue(pixel - width);
      if (y + 1 < height) enqueue(pixel + width);
    }
  } else {
    for (let pixel = 0; pixel < selected.length; pixel++) {
      if (matches(pixel * 4)) { selected[pixel] = 1; count++; }
    }
  }
  const mask = document.createElement('canvas'); mask.width = width; mask.height = height;
  const maskCtx = mask.getContext('2d')!; const image = maskCtx.createImageData(width, height);
  for (let pixel = 0; pixel < selected.length; pixel++) if (selected[pixel]) { const offset = pixel * 4; image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = image.data[offset + 3] = 255; }
  maskCtx.putImageData(image, 0, 0);
  return { src: mask.toDataURL('image/png'), coverage: count / (width * height) };
}
