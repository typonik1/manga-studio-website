import { describe, expect, it } from 'vitest';
import { getShapeGeometry } from '@/utils/shapeGeometry';
import type { ShapeKind } from '@/types';

describe('pointer geometry', () => {
  it('returns required paths for every pointer kind', () => {
    const kinds: ShapeKind[] = [
      'arrow',
      'double-arrow',
      'curved-arrow',
      'elbow-arrow',
      'block-arrow',
      'chevron',
      'pointer',
    ];
    for (const kind of kinds) {
      const geometry = getShapeGeometry(kind, 180, 90, 0.35);
      expect(geometry.strokePath || geometry.fillPath, kind).toBeTruthy();
      expect(JSON.stringify(geometry), kind).not.toMatch(/NaN|Infinity/);
    }
  });

  it('changes the curved arrow path when the curve handle moves', () => {
    const low = getShapeGeometry('curved-arrow', 180, 90, 0.1);
    const high = getShapeGeometry('curved-arrow', 180, 90, 0.8);
    expect(low.strokePath).not.toBe(high.strokePath);
  });

  it('changes straight and double arrow heads after vertical resize', () => {
    for (const kind of ['arrow', 'double-arrow'] as const) {
      const short = getShapeGeometry(kind, 180, 24);
      const tall = getShapeGeometry(kind, 180, 96);
      expect(short.fillPath, kind).not.toBe(tall.fillPath);
    }
  });
});
