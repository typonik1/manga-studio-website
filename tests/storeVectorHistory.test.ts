import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store/useStore';
import { createBaseLayerState } from '@/types';
import type { ImageDocument } from '@/types';
import { createDefaultBubble } from '@/components/editor/panels/BubblePanel';
import { createShapeFromSettings } from '@/utils/shapePresets';
import { createPastedImageLayer } from '@/utils/pastedImageLayers';
import { resolveLayerOrder } from '@/utils/layerOrder';

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
    for (const strokeWidth of [5, 6, 7]) {
      useStore.getState().updateBubble(bubble.id, { strokeWidth }, { history: false });
    }
    expect(useStore.getState().documents[0].past).toHaveLength(1);
    expect(useStore.getState().documents[0].bubbles[0].strokeWidth).toBe(7);
  });

  it('can request one history entry for a panel shape change', () => {
    const store = useStore.getState();
    const shape = store.documents[0].shapes[0];
    store.updateShape(shape.id, { strokeWidth: 9 }, { history: true });
    expect(useStore.getState().documents[0].past).toHaveLength(1);
  });

  it('selects a pasted raster layer without leaving a vector transformer active', () => {
    const state = useStore.getState();
    const doc = state.documents[0];
    useStore.setState({ selectedObject: { id: doc.shapes[0].id, type: 'shape' } });
    const layer = createPastedImageLayer(doc, {
      src: 'data:image/png;base64,x',
      width: 400,
      height: 300,
      name: 'paste.png',
    });
    useStore.getState().addAiLayer(doc.id, layer);

    const next = useStore.getState();
    expect(next.selectedObject).toBeNull();
    expect(next.documents[0].selectedLayer).toEqual({ id: layer.id, type: 'ai' });
  });

  it('puts a new and duplicated bubble on top in a legacy document without layer order', () => {
    const legacy = { ...makeDocument(), layerOrder: undefined };
    useStore.setState({ documents: [legacy], activeDocIndex: 0, selectedObject: null });
    const bubble = createDefaultBubble('comic');
    useStore.getState().addBubble(bubble);
    expect(resolveLayerOrder(useStore.getState().documents[0]).at(-1))
      .toEqual({ type: 'bubble', id: bubble.id });

    useStore.getState().duplicateBubble(bubble.id);
    const top = resolveLayerOrder(useStore.getState().documents[0]).at(-1);
    expect(top?.type).toBe('bubble');
    expect(top?.id).not.toBe(bubble.id);
  });
});
