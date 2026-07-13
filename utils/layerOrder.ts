import type { ImageDocument, LayerReference } from '@/types';

export function layerRefKey(ref: LayerReference): string {
  return `${ref.type}:${ref.id}`;
}

export function baseLayerId(doc: ImageDocument): string {
  return doc.baseLayer?.id ?? `base-${doc.id}`;
}

/**
 * Resolves the document's unified z-order (bottom → top).
 * - Drops references to layers/objects that no longer exist.
 * - Appends new layers/objects on top (base goes to the bottom if missing).
 * The result is safe to use for canvas rendering, panels, and export.
 */
export function resolveLayerOrder(doc: ImageDocument): LayerReference[] {
  const baseId = baseLayerId(doc);
  const aiIds = new Set((doc.aiLayers ?? []).map(layer => layer.id));
  const textIds = new Set(doc.texts.map(item => item.id));
  const wmIds = new Set(doc.watermarks.map(item => item.id));
  const shapeIds = new Set((doc.shapes ?? []).map(item => item.id));

  const exists = (ref: LayerReference): boolean => {
    switch (ref.type) {
      case 'base': return ref.id === baseId;
      case 'ai': return aiIds.has(ref.id);
      case 'text': return textIds.has(ref.id);
      case 'watermark': return wmIds.has(ref.id);
      case 'shape': return shapeIds.has(ref.id);
    }
  };

  const order: LayerReference[] = (doc.layerOrder ?? []).filter(exists);
  const seen = new Set(order.map(layerRefKey));

  // Base goes to the bottom when it was never ordered explicitly.
  if (!seen.has(`base:${baseId}`)) {
    order.unshift({ type: 'base', id: baseId });
    seen.add(`base:${baseId}`);
  }

  const append = (ref: LayerReference) => {
    const key = layerRefKey(ref);
    if (!seen.has(key)) { order.push(ref); seen.add(key); }
  };

  for (const layer of doc.aiLayers ?? []) append({ type: 'ai', id: layer.id });
  for (const wm of doc.watermarks) append({ type: 'watermark', id: wm.id });
  for (const txt of doc.texts) append({ type: 'text', id: txt.id });
  for (const shape of doc.shapes ?? []) append({ type: 'shape', id: shape.id });

  return order;
}

/** Index right above the top-most raster (base/ai) ref — where brush strokes are drawn. */
export function strokesInsertionIndex(order: LayerReference[]): number {
  let index = 0;
  for (let i = 0; i < order.length; i++) {
    if (order[i].type === 'base' || order[i].type === 'ai') index = i + 1;
  }
  return index;
}
