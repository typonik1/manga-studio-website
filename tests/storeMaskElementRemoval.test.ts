import { beforeEach, describe, expect, it } from 'vitest';
import { createBaseLayerState } from '@/types';
import type { ImageDocument } from '@/types';
import { useStore } from '@/store/useStore';

function makeDocument(): ImageDocument {
  return {
    id: 'doc', file: new File(['x'], 'page.png', { type: 'image/png' }), originalSrc: 'blob:page',
    thumbnail: '', width: 100, height: 100, name: 'page.png',
    cleanup: { committed: null, strokes: [] }, baseLayer: createBaseLayerState('doc'),
    masks: [{
      id: 'mask', name: 'Mask', strokes: [], visible: true, opacity: 0.55,
      elements: [
        { id: 'older', type: 'polygon', points: [0, 0, 1, 0, 1, 1] },
        { id: 'wand', type: 'bitmap', src: 'data:image/png;base64,x' },
      ],
    }],
    aiLayers: [], activeMaskId: 'mask', selectedLayer: { id: 'mask', type: 'mask' },
    watermarks: [], texts: [], shapes: [], bubbles: [], past: [], future: [], hasChanges: false,
  };
}

describe('specific mask element removal', () => {
  beforeEach(() => useStore.setState({ documents: [makeDocument()], activeDocIndex: 0 }));

  it('removes only the rejected wand element without undoing later work', () => {
    useStore.getState().removeMaskElement('doc', 'mask', 'wand');
    expect(useStore.getState().documents[0].masks[0].elements).toEqual([
      { id: 'older', type: 'polygon', points: [0, 0, 1, 0, 1, 1] },
    ]);
  });

  it('rolls back that exact element if the mask was locked while the prompt was open', () => {
    const current = useStore.getState().documents[0];
    useStore.setState({ documents: [{
      ...current,
      masks: current.masks.map(mask => ({ ...mask, locked: true })),
    }] });

    useStore.getState().removeMaskElement('doc', 'mask', 'wand');

    expect(useStore.getState().documents[0].masks[0].elements.map(element => element.id)).toEqual(['older']);
  });

  it('removes from the origin document after the user switches pages', () => {
    const origin = makeDocument();
    const second = { ...makeDocument(), id: 'doc-2', originalSrc: 'blob:page-2', masks: [] };
    useStore.setState({ documents: [origin, second], activeDocIndex: 1 });

    useStore.getState().removeMaskElement('doc', 'mask', 'wand');

    expect(useStore.getState().documents[0].masks[0].elements.map(element => element.id)).toEqual(['older']);
    expect(useStore.getState().activeDocIndex).toBe(1);
  });

  it('adds an asynchronous wand result to its origin document after a page switch', () => {
    const origin = makeDocument();
    origin.masks[0].elements = [];
    const second = { ...makeDocument(), id: 'doc-2', originalSrc: 'blob:page-2', masks: [] };
    useStore.setState({ documents: [origin, second], activeDocIndex: 1 });

    useStore.getState().addMaskElement(
      { id: 'late-wand', type: 'bitmap', src: 'data:image/png;base64,x' },
      { documentId: 'doc' },
    );

    expect(useStore.getState().documents[0].masks[0].elements.map(element => element.id)).toEqual(['late-wand']);
    expect(useStore.getState().documents[1].masks).toHaveLength(0);
    expect(useStore.getState().activeDocIndex).toBe(1);
  });

  it('adds a delayed wand result to the mask that was active when it started', () => {
    const origin = makeDocument();
    origin.masks[0].elements = [];
    origin.masks.push({ id: 'new-mask', name: 'New mask', strokes: [], elements: [], visible: true, opacity: 0.55 });
    origin.activeMaskId = 'new-mask';
    useStore.setState({ documents: [origin], activeDocIndex: 0 });

    useStore.getState().addMaskElement(
      { id: 'late-wand', type: 'bitmap', src: 'data:image/png;base64,x' },
      { documentId: 'doc', maskId: 'mask' },
    );

    expect(useStore.getState().documents[0].masks.find(mask => mask.id === 'mask')?.elements.map(element => element.id)).toEqual(['late-wand']);
    expect(useStore.getState().documents[0].masks.find(mask => mask.id === 'new-mask')?.elements).toEqual([]);
  });

  it('does not steal a newer layer selection when the delayed wand finishes', () => {
    const origin = makeDocument();
    origin.masks[0].elements = [];
    origin.selectedLayer = { id: 'ai', type: 'ai' };
    useStore.setState({ documents: [origin], activeDocIndex: 0 });

    useStore.getState().addMaskElement(
      { id: 'late-wand', type: 'bitmap', src: 'data:image/png;base64,x' },
      { documentId: 'doc', maskId: 'mask', preserveSelection: true },
    );

    expect(useStore.getState().documents[0].selectedLayer).toEqual({ id: 'ai', type: 'ai' });
    expect(useStore.getState().documents[0].activeMaskId).toBe('mask');
  });
});
