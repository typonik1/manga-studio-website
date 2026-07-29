import { describe, expect, it } from 'vitest';
import {
  clonePaintStyle,
  normalizeGlowStyle,
  normalizePaintStyle,
  normalizeStrokePaintStyle,
} from '@/utils/objectPaint';

describe('normalizePaintStyle', () => {
  it('falls back to a legacy solid color', () => {
    expect(normalizePaintStyle(undefined, '#123456')).toEqual({
      type: 'solid',
      color: '#123456',
    });
  });

  it('sorts and clamps gradient stops', () => {
    const result = normalizePaintStyle({
      type: 'linear',
      angle: 450,
      stops: [
        { id: 'b', offset: 2, color: '#ffffff' },
        { id: 'a', offset: -1, color: '#000000' },
      ],
    }, '#f00');

    expect(result.type).toBe('linear');
    if (result.type !== 'linear') throw new Error('expected linear');
    expect(result.angle).toBe(90);
    expect(result.stops.map(stop => stop.offset)).toEqual([0, 1]);
  });

  it('deep clones stops', () => {
    const source = {
      type: 'linear' as const,
      angle: 0,
      stops: [
        { id: 'a', offset: 0, color: '#000' },
        { id: 'b', offset: 1, color: '#fff' },
      ],
    };
    const clone = clonePaintStyle(source);
    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    if (clone.type === 'linear') expect(clone.stops).not.toBe(source.stops);
  });
});

describe('normalizeStrokePaintStyle', () => {
  it('converts radial strokes to a matching linear gradient', () => {
    const result = normalizeStrokePaintStyle({
      type: 'radial',
      centerX: 0.5,
      centerY: 0.5,
      radius: 1,
      stops: [
        { id: 'a', offset: 0, color: '#000000' },
        { id: 'b', offset: 1, color: '#ffffff' },
      ],
    }, '#ff0000');
    expect(result).toEqual({
      type: 'linear',
      angle: 0,
      stops: [
        { id: 'a', offset: 0, color: '#000000' },
        { id: 'b', offset: 1, color: '#ffffff' },
      ],
    });
  });
});

describe('normalizeGlowStyle', () => {
  it('bounds expensive glow values', () => {
    expect(normalizeGlowStyle({
      enabled: true,
      color: '#0ff',
      blur: 999,
      opacity: 2,
      intensity: 9,
    })).toEqual({
      enabled: true,
      color: '#0ff',
      blur: 120,
      opacity: 1,
      intensity: 3,
    });
  });
});
