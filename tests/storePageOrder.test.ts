import { beforeEach, describe, expect, it } from 'vitest';
import { createBaseLayerState } from '@/types';
import type { ImageDocument } from '@/types';
import { useStore } from '@/store/useStore';

function doc(id: string): ImageDocument {
  return {
    id, file: new File(['x'], `${id}.png`, { type: 'image/png' }), originalSrc: `blob:${id}`,
    thumbnail: '', width: 100, height: 100, name: id,
    cleanup: { committed: null, strokes: [] }, baseLayer: createBaseLayerState(id),
    masks: [], aiLayers: [], activeMaskId: null, selectedLayer: null,
    watermarks: [], texts: [], shapes: [], bubbles: [], past: [], future: [], hasChanges: false,
  };
}

describe('page ordering', () => {
  beforeEach(() => useStore.setState({
    documents: [doc('one'), doc('two'), doc('three')], activeDocIndex: 1, selectedObject: null,
  }));

  it('moves only the requested page and keeps the active page selected by id', () => {
    useStore.getState().reorderDocuments(0, 2);
    const state = useStore.getState();
    expect(state.documents.map(item => item.id)).toEqual(['two', 'three', 'one']);
    expect(state.documents[state.activeDocIndex].id).toBe('two');
  });

  it('ignores invalid and no-op moves', () => {
    useStore.getState().reorderDocuments(-1, 1);
    useStore.getState().reorderDocuments(1, 1);
    expect(useStore.getState().documents.map(item => item.id)).toEqual(['one', 'two', 'three']);
  });

  it('keeps the active page when deleting a different page before it', () => {
    useStore.getState().removeDocument('one');
    const state = useStore.getState();
    expect(state.documents.map(item => item.id)).toEqual(['two', 'three']);
    expect(state.documents[state.activeDocIndex].id).toBe('two');
  });
});
