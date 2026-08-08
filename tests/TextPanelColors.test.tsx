import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TextPanel } from '@/components/editor/panels/TextPanel';
import { createBaseLayerState } from '@/types';
import type { ImageDocument, TextObject } from '@/types';
import { useStore } from '@/store/useStore';

const text: TextObject = {
  id: 'text', text: 'hello', fontFamily: 'Arial', fontSize: 0.05,
  fill: '#000000', stroke: '', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0,
  lineHeight: 1.2, align: 'center', width: 0.3, x: 0.2, y: 0.2,
  scaleX: 1, scaleY: 1, rotation: 0, visible: true,
};

function makeDocument(): ImageDocument {
  return {
    id: 'doc', file: new File(['x'], 'page.png', { type: 'image/png' }), originalSrc: 'blob:page',
    thumbnail: '', width: 1000, height: 800, name: 'page.png', cleanup: { committed: null, strokes: [] },
    baseLayer: createBaseLayerState('doc'), masks: [], aiLayers: [], activeMaskId: null, selectedLayer: null,
    watermarks: [], texts: [text], shapes: [], bubbles: [], past: [], future: [], hasChanges: false,
  };
}

describe('TextPanel color commit', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({
      documents: [makeDocument()], activeDocIndex: 0,
      selectedObject: { id: 'text', type: 'text' },
      recentColors: [],
      textSettings: { ...useStore.getState().textSettings, fill: '#000000' },
    });
  });

  it('keeps picker movement local and commits selected/default color once', async () => {
    render(<TextPanel />);
    const input = screen.getByLabelText('Цвет текста');

    fireEvent.input(input, { target: { value: '#ff0000' } });
    expect(useStore.getState().documents[0].texts[0].fill).toBe('#000000');

    fireEvent.change(input, { target: { value: '#ff0000' } });
    await waitFor(() => expect(useStore.getState().documents[0].texts[0].fill).toBe('#ff0000'));
    expect(useStore.getState().textSettings.fill).toBe('#ff0000');
    expect(useStore.getState().recentColors[0]).toBe('#ff0000');
    expect(useStore.getState().documents[0].past).toHaveLength(1);
  });
});
