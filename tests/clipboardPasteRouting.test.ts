import { describe, expect, it } from 'vitest';
import {
  extractClipboardImageFiles,
  shouldKeepNativePaste,
} from '@/utils/pastedImageLayers';

describe('clipboard paste routing', () => {
  it('keeps native paste in text-editable elements', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(shouldKeepNativePaste(document.createElement(tag))).toBe(true);
    }
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(shouldKeepNativePaste(editable)).toBe(true);
    expect(shouldKeepNativePaste(document.createElement('canvas'))).toBe(false);
  });

  it('extracts only images and deduplicates files exposed twice', () => {
    const image = new File(['png'], 'panel.png', { type: 'image/png', lastModified: 1 });
    const text = new File(['txt'], 'note.txt', { type: 'text/plain', lastModified: 2 });
    const data = {
      files: [image, text],
      items: [
        { kind: 'file', type: 'image/png', getAsFile: () => image },
        { kind: 'file', type: 'text/plain', getAsFile: () => text },
      ],
    };
    expect(extractClipboardImageFiles(data as unknown as DataTransfer)).toEqual([image]);
  });
});
