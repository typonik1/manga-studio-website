import { describe, expect, it } from 'vitest';
import { bubbleSupportsTail, getBubblePath } from '@/utils/bubbleGeometry';
import type { BubbleKind } from '@/types';

const params = {
  x: 0,
  y: 0,
  width: 220,
  height: 120,
  rotation: 0,
  tail: {
    enabled: true,
    side: 'bottom' as const,
    anchor: 0.35,
    length: 0.4,
    width: 0.12,
    curve: 0.3,
  },
};

describe('decorative bubble geometry', () => {
  it('returns a valid closed path for every new bubble kind', () => {
    const kinds: BubbleKind[] = ['soft', 'cloud', 'comic', 'electric', 'caption'];
    const speech = getBubblePath('speech', params);
    for (const kind of kinds) {
      const path = getBubblePath(kind, params);
      expect(path.length, kind).toBeGreaterThan(20);
      expect(path, kind).not.toMatch(/NaN|Infinity/);
      expect(path.trim().endsWith('Z'), kind).toBe(true);
      expect(path, kind).not.toBe(speech);
    }
  });

  it('keeps geometry valid at minimum and very wide sizes', () => {
    for (const kind of ['soft', 'cloud', 'comic', 'electric', 'caption'] as const) {
      for (const size of [{ width: 2, height: 2 }, { width: 1200, height: 24 }]) {
        const path = getBubblePath(kind, { ...params, ...size, tail: null });
        expect(path, `${kind}:${size.width}x${size.height}`).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it('supports a visible scream tail but keeps caption and narration tail-free', () => {
    expect(bubbleSupportsTail('scream')).toBe(true);
    expect(bubbleSupportsTail('caption')).toBe(false);
    expect(bubbleSupportsTail('narration')).toBe(false);
    expect(getBubblePath('scream', params)).not.toBe(getBubblePath('scream', { ...params, tail: null }));
    expect(getBubblePath('caption', params)).toBe(getBubblePath('caption', { ...params, tail: null }));
  });
});
