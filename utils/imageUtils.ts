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

/**
 * Diffusion inpaint: fills the masked region by propagating colors inward
 * from the mask boundary (BFS waves), then smooths the fill with several
 * relaxation passes, and finally composites with a feathered mask edge
 * so there are no hard seams.
 *
 * Mask convention: black background, white strokes (checked via red channel).
 */
export function simpleInpaint(
  imageData: ImageData,
  maskData: ImageData,
  radius = 8
): ImageData {
  const { width, height } = imageData;
  const img = imageData.data;
  const mask = maskData.data;
  const N = width * height;

  const r = new Float32Array(N);
  const g = new Float32Array(N);
  const b = new Float32Array(N);
  const unknown = new Uint8Array(N); // 1 = masked (to be filled)
  const filled = new Uint8Array(N);  // 1 = has a valid color

  const maskedIdx: number[] = [];
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    r[p] = img[i]; g[p] = img[i + 1]; b[p] = img[i + 2];
    if (mask[i] >= 128) {
      unknown[p] = 1;
      maskedIdx.push(p);
    } else {
      filled[p] = 1;
    }
  }
  if (maskedIdx.length === 0) return new ImageData(new Uint8ClampedArray(img), width, height);

  // --- 1. BFS wave fill: every masked pixel gets a color propagated from the boundary ---
  const queued = new Uint8Array(N);
  let frontier: number[] = [];
  for (const p of maskedIdx) {
    const x = p % width, y = (p / width) | 0;
    if (
      (x > 0 && filled[p - 1]) || (x < width - 1 && filled[p + 1]) ||
      (y > 0 && filled[p - width]) || (y < height - 1 && filled[p + width])
    ) {
      frontier.push(p);
      queued[p] = 1;
    }
  }

  while (frontier.length > 0) {
    // Fill the whole wave from already-filled neighbors (8-neighborhood)
    for (const p of frontier) {
      const x = p % width, y = (p / width) | 0;
      let rs = 0, gs = 0, bs = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const np = ny * width + nx;
          if (!filled[np]) continue;
          rs += r[np]; gs += g[np]; bs += b[np]; c++;
        }
      }
      if (c > 0) { r[p] = rs / c; g[p] = gs / c; b[p] = bs / c; }
    }
    for (const p of frontier) filled[p] = 1;

    // Collect next wave
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % width, y = (p / width) | 0;
      if (x > 0 && !filled[p - 1] && !queued[p - 1]) { next.push(p - 1); queued[p - 1] = 1; }
      if (x < width - 1 && !filled[p + 1] && !queued[p + 1]) { next.push(p + 1); queued[p + 1] = 1; }
      if (y > 0 && !filled[p - width] && !queued[p - width]) { next.push(p - width); queued[p - width] = 1; }
      if (y < height - 1 && !filled[p + width] && !queued[p + width]) { next.push(p + width); queued[p + width] = 1; }
    }
    frontier = next;
  }

  // --- 2. Smoothing (relaxation) passes inside the mask only ---
  const iterations = Math.max(6, Math.min(40, Math.round(radius * 1.5)));
  for (let it = 0; it < iterations; it++) {
    for (const p of maskedIdx) {
      const x = p % width, y = (p / width) | 0;
      let rs = r[p], gs = g[p], bs = b[p], c = 1;
      if (x > 0) { rs += r[p - 1]; gs += g[p - 1]; bs += b[p - 1]; c++; }
      if (x < width - 1) { rs += r[p + 1]; gs += g[p + 1]; bs += b[p + 1]; c++; }
      if (y > 0) { rs += r[p - width]; gs += g[p - width]; bs += b[p - width]; c++; }
      if (y < height - 1) { rs += r[p + width]; gs += g[p + width]; bs += b[p + width]; c++; }
      r[p] = rs / c; g[p] = gs / c; b[p] = bs / c;
    }
  }

  // --- 3. Feathered composite: soft weight near the mask boundary, no hard seams ---
  const weight = new Float32Array(N);
  for (const p of maskedIdx) weight[p] = 1;
  // Two small box-blur passes on the weight map (separable, radius 2)
  const fr = 2;
  const tmp = new Float32Array(N);
  for (let pass = 0; pass < 2; pass++) {
    // horizontal
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let s = 0, c = 0;
        for (let dx = -fr; dx <= fr; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          s += weight[row + nx]; c++;
        }
        tmp[row + x] = s / c;
      }
    }
    // vertical
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let s = 0, c = 0;
        for (let dy = -fr; dy <= fr; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          s += tmp[ny * width + x]; c++;
        }
        weight[y * width + x] = s / c;
      }
    }
  }

  const out = new Uint8ClampedArray(img);
  for (let p = 0; p < N; p++) {
    const w = weight[p];
    if (w <= 0.001) continue;
    const i = p * 4;
    out[i] = Math.round(img[i] * (1 - w) + r[p] * w);
    out[i + 1] = Math.round(img[i + 1] * (1 - w) + g[p] * w);
    out[i + 2] = Math.round(img[i + 2] * (1 - w) + b[p] * w);
    out[i + 3] = 255;
  }

  return new ImageData(out, width, height);
}
