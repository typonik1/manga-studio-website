import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageDocument, TextObject, TranslationMaskObject } from '@/types';
import { createBaseLayerState } from '@/types';
import { affineBoundsToPerspective } from '@/utils/perspective';
import { resolveLayerOrder } from '@/utils/layerOrder';
import { useEditorUiStore } from '@/store/useEditorUiStore';
import { useStore } from '@/store/useStore';

function makeDocument(): ImageDocument {
  const id = 'doc-new-features';
  return {
    id,
    file: new File(['x'], 'page.png', { type: 'image/png' }),
    originalSrc: 'data:image/png;base64,eA==',
    thumbnail: '',
    width: 1000,
    height: 1500,
    name: 'page.png',
    cleanup: { committed: null, strokes: [] },
    baseLayer: createBaseLayerState(id),
    masks: [],
    aiLayers: [],
    activeMaskId: null,
    selectedLayer: null,
    watermarks: [],
    texts: [],
    translationMasks: [],
    shapes: [],
    bubbles: [],
    layerOrder: [],
    past: [],
    future: [],
    hasChanges: false,
  };
}

describe('central editor operations', () => {
  beforeEach(() => useEditorUiStore.setState({ activeOperation: null, toolOptions: null, floatingDismiss: null }));

  it('commits and cancels through one active operation slot', () => {
    const commit = vi.fn();
    const cancel = vi.fn();
    useEditorUiStore.getState().beginOperation({ id: 'crop-1', kind: 'crop', label: 'Crop', commit, cancel });
    expect(useEditorUiStore.getState().commitActiveOperation()).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
    expect(useEditorUiStore.getState().activeOperation).toBeNull();

    useEditorUiStore.getState().beginOperation({ id: 'blur-1', kind: 'blur', label: 'Blur', commit, cancel });
    expect(useEditorUiStore.getState().cancelActiveOperation()).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('actual-bounds perspective', () => {
  it('starts the quad at the alpha bounds instead of the full source image', () => {
    const quad = affineBoundsToPerspective(1000, 500, { x: 100, y: 50, width: 300, height: 200 }, {});
    expect(quad.topLeft).toEqual({ x: 0.1, y: 0.1 });
    expect(quad.topRight).toEqual({ x: 0.4, y: 0.1 });
    expect(quad.bottomRight).toEqual({ x: 0.4, y: 0.5 });
    expect(quad.bottomLeft).toEqual({ x: 0.1, y: 0.5 });
  });
});

describe('editable auto-translation groups', () => {
  it('adds mask below text to one history snapshot and undo restores the page', () => {
    const document = makeDocument();
    useStore.setState({ documents: [document], activeDocIndex: 0, selectedObject: null });
    const mask: TranslationMaskObject = {
      id: 'mask-1', name: 'Mask', x: .1, y: .2, width: .3, height: .1,
      rotation: 0, scaleX: 1, scaleY: 1, shape: 'rounded-rect', fill: '#fff',
      opacity: 1, feather: 2, padding: .02, visible: true, groupId: 'group-1', textId: 'text-1',
      sourceBounds: { x: .12, y: .22, width: .26, height: .06 },
    };
    const text: TextObject = {
      id: 'text-1', text: 'Перевод', fontFamily: 'Arial', fontSize: .04, fill: '#000',
      stroke: '', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0,
      lineHeight: 1.2, align: 'center', width: .25, x: .12, y: .22,
      scaleX: 1, scaleY: 1, rotation: 0, visible: true, groupId: 'group-1',
    };

    useStore.getState().addTranslationGroup(mask, text);
    const added = useStore.getState().documents[0];
    expect(added.translationMasks).toHaveLength(1);
    expect(added.texts).toHaveLength(1);
    expect(resolveLayerOrder(added).slice(-2)).toEqual([
      { type: 'translationMask', id: 'mask-1' },
      { type: 'text', id: 'text-1' },
    ]);
    expect(added.past).toHaveLength(1);

    useStore.getState().undo();
    expect(useStore.getState().documents[0].translationMasks ?? []).toHaveLength(0);
    expect(useStore.getState().documents[0].texts).toHaveLength(0);
  });
});
