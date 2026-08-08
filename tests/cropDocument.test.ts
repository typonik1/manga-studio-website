import { describe, expect, it } from 'vitest';
import type { ImageDocument } from '@/types';
import { remapDocumentContentForCrop } from '@/utils/imageUtils';

function makeDocument(): ImageDocument {
  return {
    id: 'doc',
    file: new File(['x'], 'page.png', { type: 'image/png' }),
    originalSrc: 'blob:page',
    thumbnail: '',
    width: 1000,
    height: 800,
    name: 'page.png',
    cleanup: { committed: null, strokes: [] },
    baseLayer: {
      id: 'base-doc', visible: true, locked: true, opacity: 1,
      eraseElements: [], adjustments: { brightness: 1, contrast: 1, saturation: 1 },
      x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    },
    masks: [{
      id: 'mask-1', name: 'Маска 1', visible: true, opacity: 0.55, strokes: [],
      elements: [
        { type: 'polygon', points: [0.25, 0.2, 0.75, 0.7] },
        { type: 'brush', stroke: { id: 'stroke', points: [0.5, 0.45], size: 0.1, color: '#fff', opacity: 1 } },
      ],
    }],
    aiLayers: [], activeMaskId: 'mask-1', selectedLayer: null,
    watermarks: [], texts: [], shapes: [],
    bubbles: [{
      id: 'bubble-1', kind: 'speech', visible: true,
      x: 0.5, y: 0.45, width: 0.2, height: 0.1, rotation: 0,
      autoSize: false,
      tail: { enabled: true, side: 'bottom', anchor: 0.5, length: 0.3, width: 0.1, curve: 0, tipX: 0.6, tipY: 0.65 },
      fill: '#fff', stroke: '#000', strokeWidth: 4,
      text: { content: 'Hi', fontFamily: 'Arial', fontSize: 24, fill: '#000', align: 'center', lineHeight: 1.2 },
    }],
    past: [], future: [], hasChanges: false,
  };
}

describe('crop document coordinate remapping', () => {
  it('remaps bubbles and vector mask elements into the crop coordinate space', () => {
    const remapped = remapDocumentContentForCrop(makeDocument(), {
      x: 0.25, y: 0.2, width: 0.5, height: 0.5,
    });

    expect(remapped.bubbles[0]).toMatchObject({
      x: 0.5, y: 0.5, width: 0.4, height: 0.2, strokeWidth: 4,
      tail: { tipX: 0.7, tipY: 0.9 },
    });
    expect(remapped.masks[0].elements[0].type).toBe('polygon');
    if (remapped.masks[0].elements[0].type === 'polygon') {
      expect(remapped.masks[0].elements[0].points[0]).toBeCloseTo(0);
      expect(remapped.masks[0].elements[0].points[1]).toBeCloseTo(0);
      expect(remapped.masks[0].elements[0].points[2]).toBeCloseTo(1);
      expect(remapped.masks[0].elements[0].points[3]).toBeCloseTo(1);
    }
    expect(remapped.masks[0].elements[1]).toMatchObject({
      type: 'brush',
      stroke: { points: [0.5, 0.5], size: 0.2 },
    });
  });

  it('tolerates legacy documents with optional arrays missing', () => {
    const legacy = {
      ...makeDocument(),
      watermarks: undefined,
      texts: undefined,
      shapes: undefined,
      bubbles: undefined,
      masks: undefined,
      aiLayers: undefined,
    } as unknown as ImageDocument;

    expect(remapDocumentContentForCrop(legacy, { x: 0, y: 0, width: 1, height: 1 })).toMatchObject({
      watermarks: [], texts: [], shapes: [], bubbles: [], masks: [], aiLayers: [],
    });
  });
});
