import { createBaseLayerState, DEFAULT_BASE_ADJUSTMENTS } from '@/types';
import type { ImageDocument, ShapeObject, StrokeData, TextObject, WatermarkObject } from '@/types';

export interface CoordinateSpace {
  viewport: { x: number; y: number; scale: number };
  imageWidth: number;
  imageHeight: number;
}

const finite = (value: number) => Number.isFinite(value);
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function screenToImage(point: { x: number; y: number }, space: CoordinateSpace) {
  const { viewport, imageWidth, imageHeight } = space;
  if (viewport.scale <= 0 || imageWidth <= 0 || imageHeight <= 0) return null;
  const x = (point.x - viewport.x) / viewport.scale / imageWidth;
  const y = (point.y - viewport.y) / viewport.scale / imageHeight;
  return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}

export function imageToScreen(point: { x: number; y: number }, space: CoordinateSpace) {
  return {
    x: space.viewport.x + point.x * space.imageWidth * space.viewport.scale,
    y: space.viewport.y + point.y * space.imageHeight * space.viewport.scale,
  };
}

function validPosition(value: number) {
  return finite(value) && Math.abs(value) <= 2;
}

export function sanitizeText(text: TextObject): TextObject | null {
  if (![text.x, text.y, text.width, text.fontSize].every(validPosition)) return null;
  const x = clamp01(text.x);
  const y = clamp01(text.y);
  return { ...text, x, y, width: Math.max(0.01, Math.min(1 - x, Math.abs(text.width))), fontSize: Math.max(0.003, Math.min(0.5, Math.abs(text.fontSize))) };
}

export function sanitizeWatermark(wm: WatermarkObject): WatermarkObject | null {
  if (![wm.x, wm.y, wm.scaleX, wm.scaleY].every(validPosition)) return null;
  return { ...wm, x: clamp01(wm.x), y: clamp01(wm.y), scaleX: Math.max(0.01, Math.min(2, Math.abs(wm.scaleX))), scaleY: Math.max(0.01, Math.min(2, Math.abs(wm.scaleY))) };
}

export function sanitizeShape(shape: ShapeObject): ShapeObject | null {
  if (![shape.x, shape.y, shape.width, shape.height].every(validPosition)) return null;
  return { ...shape, x: clamp01(shape.x), y: clamp01(shape.y), width: Math.max(0.005, Math.min(1, Math.abs(shape.width))), height: Math.max(0.005, Math.min(1, Math.abs(shape.height))) };
}

export function sanitizeStroke(stroke: StrokeData): StrokeData | null {
  if (stroke.points.length < 2 || stroke.points.some(value => !finite(value) || Math.abs(value) > 2)) return null;
  const points = stroke.points.map(clamp01);
  return { ...stroke, points, size: Math.max(0.001, Math.min(0.5, Math.abs(stroke.size))) };
}

export function sanitizeImageDocument(document: ImageDocument): ImageDocument {
  return {
    ...document,
    texts: document.texts.map(sanitizeText).filter((item): item is TextObject => Boolean(item)),
    watermarks: document.watermarks.map(sanitizeWatermark).filter((item): item is WatermarkObject => Boolean(item)),
    shapes: (document.shapes ?? []).map(sanitizeShape).filter((item): item is ShapeObject => Boolean(item)),
    cleanup: { ...document.cleanup, strokes: document.cleanup.strokes.map(sanitizeStroke).filter((item): item is StrokeData => Boolean(item)) },
    masks: (document.masks ?? []).map(mask => ({
      ...mask,
      visible: mask.visible !== false,
      opacity: clamp01(Number.isFinite(mask.opacity) ? mask.opacity : 0.55),
      strokes: (mask.strokes ?? []).map(sanitizeStroke).filter((item): item is StrokeData => Boolean(item)),
      elements: (mask.elements ?? (mask.strokes ?? []).map(stroke => ({ type: 'brush' as const, stroke }))).map(element => {
        if (element.type === 'brush') { const stroke = sanitizeStroke(element.stroke); return stroke ? { type: 'brush' as const, stroke } : null; }
        if (element.type === 'polygon') return element.points.length >= 6 ? { ...element, points: element.points.map(clamp01) } : null;
        return element.src ? element : null;
      }).filter((element): element is NonNullable<typeof element> => Boolean(element)),
    })),
    aiLayers: (document.aiLayers ?? []).map(layer => ({
      ...layer,
      visible: layer.visible !== false,
      opacity: clamp01(Number.isFinite(layer.opacity) ? layer.opacity : 1),
      eraseElements: layer.eraseElements ?? [],
    })),
    baseLayer: document.baseLayer
      ? {
          ...document.baseLayer,
          opacity: clamp01(Number.isFinite(document.baseLayer.opacity) ? document.baseLayer.opacity : 1),
          eraseElements: document.baseLayer.eraseElements ?? [],
          adjustments: { ...DEFAULT_BASE_ADJUSTMENTS, ...document.baseLayer.adjustments },
        }
      : createBaseLayerState(document.id),
    activeMaskId: document.activeMaskId ?? null,
    selectedLayer: document.selectedLayer ?? null,
  };
}

export function clampOcrBox(box: { x: number; y: number; width: number; height: number }) {
  if (![box.x, box.y, box.width, box.height].every(finite) || box.width <= 0 || box.height <= 0) return null;
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const width = Math.max(0.005, Math.min(1 - x, box.width));
  const height = Math.max(0.005, Math.min(1 - y, box.height));
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
