import { describe, expect, it } from 'vitest';
import { getLinearGradientPoints, paintToCss } from '@/utils/objectPaint';

describe('gradient coordinates', () => {
  it('runs a zero-degree gradient left to right through the object center', () => {
    expect(getLinearGradientPoints(0, { x: -50, y: -25, width: 100, height: 50 }))
      .toEqual({
        start: { x: -50, y: 0 },
        end: { x: 50, y: 0 },
      });
  });

  it('runs a ninety-degree gradient top to bottom through the object center', () => {
    const points = getLinearGradientPoints(90, { x: 10, y: 20, width: 100, height: 50 });
    expect(points.start.x).toBeCloseTo(60);
    expect(points.start.y).toBeCloseTo(20, 1);
    expect(points.end.x).toBeCloseTo(60);
    expect(points.end.y).toBeCloseTo(70, 1);
  });

  it('creates a CSS preview for saved styles', () => {
    expect(paintToCss({
      type: 'linear',
      angle: 45,
      stops: [
        { id: 'a', offset: 0, color: '#000' },
        { id: 'b', offset: 1, color: '#fff' },
      ],
    }, { x: 0, y: 0, width: 100, height: 100 })).toContain('linear-gradient(45deg');
  });
});
