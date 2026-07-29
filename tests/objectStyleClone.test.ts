import { describe, expect, it } from 'vitest';
import { cloneGlowStyle, clonePaintStyle } from '@/utils/objectPaint';

describe('vector style history clones', () => {
  it('does not share gradient stops with a previous snapshot', () => {
    const previous = {
      type: 'linear' as const,
      angle: 15,
      stops: [
        { id: 'a', offset: 0, color: '#f00' },
        { id: 'b', offset: 1, color: '#00f' },
      ],
    };
    const current = clonePaintStyle(previous);
    if (current.type !== 'linear') throw new Error('expected linear');
    current.stops[0].color = '#0f0';
    expect(previous.stops[0].color).toBe('#f00');
  });

  it('copies glow values independently', () => {
    const previous = { enabled: true, color: '#0ff', blur: 12, opacity: 0.8, intensity: 2 };
    const current = cloneGlowStyle(previous);
    current.color = '#f0f';
    expect(previous.color).toBe('#0ff');
  });
});
