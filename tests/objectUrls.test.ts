import { describe, expect, it, vi } from 'vitest';
import { createBaseLayerState } from '@/types';
import type { ImageDocument } from '@/types';
import { collectDocumentObjectUrls, documentObjectUrlReferencesChanged, revokeUnusedDocumentObjectUrls } from '@/utils/objectUrls';

function doc(originalSrc: string): ImageDocument {
  return {
    id: originalSrc, file: new File(['x'], 'x.png'), originalSrc, thumbnail: '', width: 10, height: 10, name: 'x',
    cleanup: { committed: null, strokes: [] }, baseLayer: createBaseLayerState(originalSrc),
    masks: [], aiLayers: [], activeMaskId: null, selectedLayer: null,
    watermarks: [], texts: [], shapes: [], bubbles: [], past: [], future: [], hasChanges: false,
  };
}

describe('persistent object URL lifecycle', () => {
  it('collects only blob URLs and revokes removed documents', () => {
    const first = doc('blob:first');
    first.aiLayers.push({ id: 'ai', name: 'ai', src: 'data:image/png,x', visible: true, opacity: 1, operation: 'drawing' });
    expect([...collectDocumentObjectUrls([first])]).toEqual(['blob:first']);
    const revoke = vi.fn();
    expect(revokeUnusedDocumentObjectUrls([first], [], revoke)).toEqual(['blob:first']);
    expect(revoke).toHaveBeenCalledWith('blob:first');
  });

  it('keeps shared and undo-referenced URLs alive', () => {
    const first = doc('blob:shared');
    const second = doc('blob:shared');
    const revoke = vi.fn();
    revokeUnusedDocumentObjectUrls([first, second], [second], revoke);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('skips full history accounting for appearance-only document updates', () => {
    const before = doc('blob:first');
    const after = {
      ...before,
      baseLayer: { ...before.baseLayer, opacity: 0.4 },
    };

    expect(documentObjectUrlReferencesChanged([before], [after])).toBe(false);
    expect(documentObjectUrlReferencesChanged([before], [{ ...after, originalSrc: 'blob:replacement' }])).toBe(true);
    expect(documentObjectUrlReferencesChanged([before], [{ ...after, past: [...after.past] }])).toBe(true);
  });
});
