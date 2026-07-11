import type { ImageDocument } from '../types';

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) {
    const ext = file.name.split('.').pop()?.toUpperCase() ?? 'неизвестный';
    return `Формат ${ext} не поддерживается. Принимаются JPG, PNG, WebP.`;
  }
  if (file.size > 60 * 1024 * 1024) {
    return `Файл «${file.name}» слишком большой (макс. 60 МБ).`;
  }
  return null;
}

export function createThumbnail(img: HTMLImageElement, maxSide = 160): string {
  const scale = Math.min(maxSide / img.width, maxSide / img.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

export function loadImageFromFile(file: File): Promise<ImageDocument> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({
        id: uid(),
        file,
        originalSrc: objectUrl,
        thumbnail: createThumbnail(img, 160),
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: file.name,
        cleanup: { committed: null, strokes: [] },
        watermarks: [],
        texts: [],
        past: [],
        future: [],
        hasChanges: false,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Не удалось загрузить файл «${file.name}». Возможно, файл повреждён.`));
    };
    img.src = objectUrl;
  });
}

export async function loadImagesFromFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<{ docs: ImageDocument[]; errors: string[] }> {
  const docs: ImageDocument[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const validationError = validateFile(file);
    if (validationError) {
      errors.push(validationError);
      continue;
    }
    try {
      const doc = await loadImageFromFile(file);
      docs.push(doc);
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message : `Ошибка загрузки «${file.name}»`);
    }
    onProgress?.(i + 1, files.length);
  }
  return { docs, errors };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Simple flood-fill at ImageData level (for magic bubble / cleanup) */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillR: number,
  fillG: number,
  fillB: number,
  threshold = 30
): void {
  const idx = (x: number, y: number) => (y * width + x) * 4;
  const startIdx = idx(startX, startY);
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];

  if (
    Math.abs(fillR - targetR) < 3 &&
    Math.abs(fillG - targetG) < 3 &&
    Math.abs(fillB - targetB) < 3
  ) return;

  const stack: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  const matches = (x: number, y: number): boolean => {
    const i = idx(x, y);
    return (
      Math.abs(data[i] - targetR) <= threshold &&
      Math.abs(data[i + 1] - targetG) <= threshold &&
      Math.abs(data[i + 2] - targetB) <= threshold
    );
  };

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    if (!matches(x, y)) continue;
    visited[vi] = 1;
    const i = idx(x, y);
    data[i] = fillR;
    data[i + 1] = fillG;
    data[i + 2] = fillB;
    stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
}

/** Simple inpaint: fill masked region with neighbouring average color */
export function simpleInpaint(
  imageData: ImageData,
  maskData: ImageData,
  radius = 8
): ImageData {
  const { data: img, width, height } = imageData;
  const mask = maskData.data;
  const result = new Uint8ClampedArray(img);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (mask[i + 3] < 128) continue; // not masked

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = (ny * width + nx) * 4;
          if (mask[ni + 3] >= 128) continue; // skip other masked pixels
          rSum += img[ni]; gSum += img[ni + 1]; bSum += img[ni + 2];
          count++;
        }
      }
      if (count > 0) {
        result[i] = Math.round(rSum / count);
        result[i + 1] = Math.round(gSum / count);
        result[i + 2] = Math.round(bSum / count);
        result[i + 3] = 255;
      }
    }
  }

  return new ImageData(result, width, height);
}
