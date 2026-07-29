import { describe, expect, it } from 'vitest';
import type { ImageDocument } from '@/types';
import { resolveVisualLayerOrder } from '@/utils/layerOrder';

function makeDocument(layerOrder: ImageDocument['layerOrder']): ImageDocument {
  return {
    id: 'doc',
    file: new File([], 'page.png', { type: 'image/png' }),
    name: 'page.png',
    originalSrc: 'data:image/png;base64,',
    thumbnail: 'data:image/png;base64,',
    width: 100,
    height: 100,
    layerOrder,
    baseLayer: {
      id: 'base-doc',
      visible: true,
      locked: false,
      opacity: 1,
      eraseElements: [],
      adjustments: { brightness: 1, contrast: 1, saturation: 1 },
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      crop: null,
    },
    aiLayers: [{
      id: 'ai-1',
      name: 'Pasted image',
      src: 'data:image/png;base64,',
      visible: true,
      opacity: 1,
      operation: 'duplicate',
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    }],
    texts: [],
    watermarks: [],
    shapes: [],
    bubbles: [{
      id: 'bubble-1',
      kind: 'speech',
      x: 0.5,
      y: 0.5,
      width: 0.3,
      height: 0.2,
      rotation: 0,
      autoSize: true,
      visible: true,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 2,
      tail: null,
      text: {
        content: '',
        fontFamily: 'Arial',
        fontSize: 16,
        fill: '#000',
        align: 'center',
        lineHeight: 1.2,
      },
    }],
    cleanup: { committed: null, strokes: [] },
    masks: [],
    activeMaskId: null,
    selectedLayer: null,
    past: [],
    future: [],
    hasChanges: false,
  };
}

describe('resolveVisualLayerOrder', () => {
  it('keeps a raster layer above a vector object when requested', () => {
    const doc = makeDocument([
      { type: 'base', id: 'base-doc' },
      { type: 'bubble', id: 'bubble-1' },
      { type: 'ai', id: 'ai-1' },
    ]);

    expect(resolveVisualLayerOrder(doc).map(ref => ref.type)).toEqual([
      'base',
      'bubble',
      'ai',
      'strokes',
    ]);
  });

  it('keeps vector objects above rasters and brush strokes', () => {
    const doc = makeDocument([
      { type: 'base', id: 'base-doc' },
      { type: 'ai', id: 'ai-1' },
      { type: 'bubble', id: 'bubble-1' },
    ]);

    expect(resolveVisualLayerOrder(doc).map(ref => ref.type)).toEqual([
      'base',
      'ai',
      'strokes',
      'bubble',
    ]);
  });
});
