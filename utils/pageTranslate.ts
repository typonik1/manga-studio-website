import { translatePageBlocks, type PageTranslationBlock } from '@/lib/routerai/client';

export interface PageTranslationPlacement extends PageTranslationBlock {
  /** Цвет фона под блоком — им замываем оригинал вместо белого. */
  background: string;
}

const MAX_PAGE_DIMENSION = 2000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const element = new window.Image();
    element.crossOrigin = 'anonymous';
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Не удалось загрузить изображение.'));
    element.src = src;
  });
}

function toCanvas(image: HTMLImageElement, maxDimension?: number): HTMLCanvasElement {
  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = maxDimension && longest > maxDimension ? maxDimension / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas недоступен.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось закодировать страницу.'))),
      'image/jpeg',
      0.92,
    );
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 255;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/** Медианный цвет кольца вокруг блока — это фон бабла, а не буквы. */
function sampleBackground(canvas: HTMLCanvasElement, block: PageTranslationBlock): string {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '#ffffff';
  const W = canvas.width;
  const H = canvas.height;
  const pad = Math.max(2, Math.round(Math.min(block.width * W, block.height * H) * 0.12));
  const x0 = Math.max(0, Math.round(block.x * W) - pad);
  const y0 = Math.max(0, Math.round(block.y * H) - pad);
  const x1 = Math.min(W - 1, Math.round((block.x + block.width) * W) + pad);
  const y1 = Math.min(H - 1, Math.round((block.y + block.height) * H) + pad);
  if (x1 <= x0 || y1 <= y0) return '#ffffff';

  const data = context.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const band = Math.max(1, Math.round(pad * 0.8));
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onBorder = x < band || y < band || x >= width - band || y >= height - band;
      if (!onBorder) continue;
      const index = (y * width + x) * 4;
      red.push(data[index]);
      green.push(data[index + 1]);
      blue.push(data[index + 2]);
    }
  }
  return `rgb(${median(red)}, ${median(green)}, ${median(blue)})`;
}

export async function translatePageWithAi(
  src: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
  glossary?: string,
): Promise<PageTranslationPlacement[]> {
  const image = await loadImage(src);
  const full = toCanvas(image);
  const downscaled = toCanvas(image, MAX_PAGE_DIMENSION);
  const blob = await canvasToBlob(downscaled);
  const blocks = await translatePageBlocks(blob, sourceLang, targetLang, signal, glossary);
  return blocks.map((block) => ({ ...block, background: sampleBackground(full, block) }));
}
