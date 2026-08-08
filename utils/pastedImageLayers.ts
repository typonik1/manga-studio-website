import type { AiRasterLayer, CropRect } from '@/types';
import { useStore } from '@/store/useStore';

export interface PastedImageInfo {
  src: string;
  width: number;
  height: number;
  name?: string;
}

export interface PastedLayerDocument {
  id: string;
  width: number;
  height: number;
  aiLayers: AiRasterLayer[];
}

export function planPastedImagePlacement(
  docWidth: number,
  docHeight: number,
  imageWidth: number,
  imageHeight: number,
  index = 0,
): CropRect {
  const safeDocWidth = Math.max(1, docWidth);
  const safeDocHeight = Math.max(1, docHeight);
  const safeImageWidth = Math.max(1, imageWidth);
  const safeImageHeight = Math.max(1, imageHeight);
  const fit = Math.min(
    1,
    (safeDocWidth * 0.95) / safeImageWidth,
    (safeDocHeight * 0.95) / safeImageHeight,
  );
  const drawWidth = safeImageWidth * fit;
  const drawHeight = safeImageHeight * fit;
  const cascade = Math.min(Math.max(0, index) * 16, Math.min(safeDocWidth, safeDocHeight) * 0.1);
  const x = Math.min(
    Math.max(0, (safeDocWidth - drawWidth) / 2 + cascade),
    safeDocWidth - drawWidth,
  );
  const y = Math.min(
    Math.max(0, (safeDocHeight - drawHeight) / 2 + cascade),
    safeDocHeight - drawHeight,
  );
  return {
    x: x / safeDocWidth,
    y: y / safeDocHeight,
    width: drawWidth / safeDocWidth,
    height: drawHeight / safeDocHeight,
  };
}

export function createPastedImageLayer(
  doc: PastedLayerDocument,
  image: PastedImageInfo,
  index = 0,
): AiRasterLayer {
  const existing = doc.aiLayers.filter(layer => layer.name.startsWith('Вставлено')).length;
  return {
    id: `ai-paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: image.name?.trim() || `Вставлено ${existing + index + 1}`,
    src: image.src,
    visible: true,
    opacity: 1,
    operation: 'drawing',
    locked: false,
    eraseElements: [],
    crop: planPastedImagePlacement(doc.width, doc.height, image.width, image.height, index),
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };
}

export function shouldKeepNativePaste(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName.toUpperCase();
  return tag === 'INPUT'
    || tag === 'TEXTAREA'
    || tag === 'SELECT'
    || (target as HTMLElement).isContentEditable
    || (target as HTMLElement).contentEditable === 'true'
    || target.getAttribute('contenteditable') === 'true';
}

export function extractClipboardImageFiles(data: DataTransfer): File[] {
  // Chromium may expose the same clipboard payload through both collections.
  // Prefer `files`; `items.getAsFile()` can manufacture a new File with a new
  // lastModified timestamp, which made screenshots appear twice.
  const directFiles = Array.from(data.files ?? []).filter(file => file.type.startsWith('image/'));
  if (directFiles.length > 0) return directFiles;

  const files: File[] = [];
  const seen = new Set<string>();
  const add = (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const key = `${file.name}:${file.type}:${file.size}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) add(item.getAsFile());
  }
  return files;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Не удалось прочитать ${file.name || 'изображение'}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось декодировать вставленное изображение.'));
    image.src = src;
  });
}

export async function decodePastedImage(file: File): Promise<PastedImageInfo> {
  const src = await fileToDataUrl(file);
  const image = await loadImage(src);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('Вставленное изображение имеет нулевой размер.');
  return { src, width, height, name: file.name || undefined };
}

export async function pasteExternalImagesAsLayers(
  files: File[],
  documentId: string,
): Promise<string[]> {
  const store = useStore.getState();
  const doc = store.documents.find(item => item.id === documentId);
  if (!doc) throw new Error('Активная страница не найдена.');
  const ids: string[] = [];

  for (let index = 0; index < files.length; index++) {
    const decoded = await decodePastedImage(files[index]);
    const image = await loadImage(decoded.src);
    const crop = planPastedImagePlacement(doc.width, doc.height, decoded.width, decoded.height, index);
    const canvas = document.createElement('canvas');
    canvas.width = doc.width;
    canvas.height = doc.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas недоступен для вставки изображения.');
    ctx.drawImage(
      image,
      crop.x * doc.width,
      crop.y * doc.height,
      crop.width * doc.width,
      crop.height * doc.height,
    );
    const layer = createPastedImageLayer(doc, {
      ...decoded,
      src: canvas.toDataURL('image/png'),
    }, index);
    store.addAiLayer(doc.id, layer);
    ids.push(layer.id);
  }
  return ids;
}
