import type { AiRasterLayer, CropRect } from '@/types';

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
