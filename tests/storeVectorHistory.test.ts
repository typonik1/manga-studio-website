import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store/useStore';
import { createBaseLayerState } from '@/types';
import type { ImageDocument } from '@/types';
import { createDefaultBubble } from '@/components/editor/panels/BubblePanel';
import { createShapeFromSettings } from '@/utils/shapePresets';

function makeDocument(): ImageDocument {
  const shape = createShapeFromSettings('rect', useStore.getState().shapeSettings);
  const bubble = createDefaultBubble('speech');
  return {
    id: 'doc-history',
    file: new File(['x'], 'page.png', { type: 'image/png' }),
    originalSrc: 'blob:page',
    thumbnail: '',
    width: 1000,
    height: 800,
    name: 'page.png',
    cleanup: { committed: null, strokes: [] },
    baseLayer: createBaseLayerState('doc-history'),
    masks: [],
    aiLayers: [],
    activeMaskId: null,
    selectedLayer: null,
    watermarks: [],
    texts: [],
    shapes: [shape],
    bubbles: [bubble],
    layerOrder: [
      { type: 'base', id: 'base-doc-history' },
      { type: 'shape', id: shape.id },
      { type: 'bubble', id: bubble.id },
    ],
    past: [],
    future: [],
    hasChanges: false,
  };
}

describe('vector history gesture options', () => {
  beforeEach(() => {
    useStore.setState({
      documents: [makeDocument()],
      activeDocIndex: 0,
      selectedObject: null,
    });
  });

  it('can update a bubble live without adding another history entry', () => {
    const store = useStore.getState();
    const bubble = store.documents[0].bubbles[0];
    store.pushHistory();
    useStore.getState().updateBubble(bubble.id, { strokeWidth: 7 }, { history: false });
    expect(useStore.getState().documents[0].past).toHaveLength(1);
  });

  it('can request one history entry for a panel shape change', () => {
    const store = useStore.getState();
    const shape = store.documents[0].shapes[0];
    store.updateShape(shape.id, { strokeWidth: 9 }, { history: true });
    expect(useStore.getState().documents[0].past).toHaveLength(1);
  });
});
