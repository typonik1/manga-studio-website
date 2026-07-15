import type { StrokeData } from '@/types';

const stampCache = new Map<string, HTMLCanvasElement>();

function getBrushStamp(diameter: number, hardness: number, color: string) {
  const size = Math.max(1, Math.ceil(diameter));
  const normalizedHardness = Math.max(0, Math.min(1, hardness));
  const key = `${size}:${normalizedHardness.toFixed(3)}:${color}`;
  const cached = stampCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size + 4;
  canvas.height = size + 4;
  const ctx = canvas.getContext('2d')!;
  const center = canvas.width / 2;
  const radius = size / 2;
  if (normalizedHardness >= 0.995) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
    stampCache.set(key, canvas);
    return canvas;
  }
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  const solidStop = Math.max(0, Math.min(0.98, normalizedHardness));
  gradient.addColorStop(0, color);
  gradient.addColorStop(solidStop, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  stampCache.set(key, canvas);
  if (stampCache.size > 80) stampCache.delete(stampCache.keys().next().value!);
  return canvas;
}

export function drawBrushStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeData,
  width: number,
  height: number,
  options: { color?: string; compositeOperation?: GlobalCompositeOperation } = {},
) {
  if (stroke.points.length < 2) return;
  const diameter = Math.max(1, stroke.size * height);
  const hardness = stroke.hardness ?? 1;
  const color = options.color ?? stroke.color;
  const stamp = getBrushStamp(diameter, hardness, color);
  const spacing = Math.max(0.75, diameter * Math.max(0.06, 0.18 - hardness * 0.08));
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < stroke.points.length; index += 2) {
    points.push({ x: stroke.points[index] * width, y: stroke.points[index + 1] * height });
  }
  ctx.save();
  ctx.globalAlpha *= stroke.opacity;
  ctx.globalCompositeOperation = options.compositeOperation ?? (stroke.mode === 'erase' ? 'destination-out' : 'source-over');
  const radiusX = stamp.width / 2;
  const radiusY = stamp.height / 2;
  const stampAt = (x: number, y: number) => ctx.drawImage(stamp, x - radiusX, y - radiusY);
  stampAt(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 1; step <= steps; step++) {
      const ratio = step / steps;
      stampAt(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio);
    }
  }
  ctx.restore();
}
