import type { ImageDocument, StrokeData } from '@/types';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось загрузить изображение.'));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось создать PNG.')), 'image/png');
  });
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, width: number, height: number) {
  if (stroke.points.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = stroke.mode === 'erase' ? 'black' : 'white';
  ctx.lineWidth = Math.max(1, stroke.size * height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';
  for (let index = 0; index < stroke.points.length; index += 2) {
    const x = stroke.points[index] * width;
    const y = stroke.points[index + 1] * height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export async function buildCleanupSource(doc: ImageDocument): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен.');
  const source = await loadImage(doc.cleanup.committed ?? doc.originalSrc);
  ctx.clearRect(0, 0, doc.width, doc.height);
  ctx.drawImage(source, 0, 0, doc.width, doc.height);
  return canvasToBlob(canvas);
}

export async function buildCleanupMask(doc: ImageDocument): Promise<{ blob: Blob; isEmpty: boolean }> {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas недоступен.');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, doc.width, doc.height);
  const strokes = doc.cleanup.strokes.filter(stroke => stroke.purpose === 'mask');
  for (const stroke of strokes) drawStroke(ctx, stroke, doc.width, doc.height);
  const pixels = ctx.getImageData(0, 0, doc.width, doc.height).data;
  let isEmpty = true;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] > 127) { isEmpty = false; break; }
  }
  return { blob: await canvasToBlob(canvas), isEmpty };
}
