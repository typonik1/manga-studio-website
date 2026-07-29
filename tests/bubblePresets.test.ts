import { describe, expect, it } from 'vitest';
import { BUBBLE_PRESETS, createDefaultBubble } from '@/components/editor/panels/BubblePanel';
import type { BubbleKind } from '@/types';

describe('bubble presets', () => {
  it('exposes ten unique classic and decorative bubble kinds', () => {
    const kinds = BUBBLE_PRESETS.map(preset => preset.kind);
    expect(kinds).toHaveLength(10);
    expect(new Set(kinds).size).toBe(10);
    expect(kinds).toEqual(expect.arrayContaining([
      'speech', 'thought', 'scream', 'narration', 'whisper',
      'soft', 'cloud', 'comic', 'electric', 'caption',
    ] satisfies BubbleKind[]));
  });

  it('creates new bubbles with independent style objects', () => {
    const first = createDefaultBubble('soft');
    const second = createDefaultBubble('soft');
    expect(first.fillStyle).toEqual(second.fillStyle);
    expect(first.fillStyle).not.toBe(second.fillStyle);
    expect(first.glow?.enabled).toBe(false);
  });
});
