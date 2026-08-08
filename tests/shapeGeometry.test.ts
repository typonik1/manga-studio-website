import { describe, expect, it } from 'vitest';
import { getShapeGeometry } from '@/utils/shapeGeometry';
import * as shapeGeometry from '@/utils/shapeGeometry';
import type { ShapeKind } from '@/types';

type CurvedArrowHandleHelpers = {
  getCurvedArrowHandlePosition?: (
    centerX: number,
    centerY: number,
    height: number,
    curve: number,
    rotation: number,
  ) => { x: number; y: number };
  getCurvedArrowCurveFromHandle?: (
    centerX: number,
    centerY: number,
    height: number,
    rotation: number,
    handleX: number,
    handleY: number,
  ) => number;
};

const curvedArrowHelpers = shapeGeometry as CurvedArrowHandleHelpers;

describe('pointer geometry', () => {
  it('provides shared paths for every basic shape', () => {
    expect(getShapeGeometry('rect', 100, 60, 0, 12).fillPath).toContain('Q');
    expect(getShapeGeometry('ellipse', 100, 60).fillPath).toContain('A 50 30');
    expect(getShapeGeometry('line', 100, 60).strokePath).toContain('L 50 0');
    expect(getShapeGeometry('star', 100, 60).fillPath).toMatch(/Z$/);
  });

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

  it('places the curve handle on the same side as the visible bend', () => {
    expect(curvedArrowHelpers.getCurvedArrowHandlePosition).toBeTypeOf('function');
    const handle = curvedArrowHelpers.getCurvedArrowHandlePosition!(
      100,
      200,
      100,
      0.5,
      0,
    );
    expect(handle).toEqual({ x: 100, y: 240 });
    expect(getShapeGeometry('curved-arrow', 180, 100, 0.5).strokePath)
      .toContain('Q 0 40');
  });

  it('maps a rotated handle drag back to the same curve value', () => {
    expect(curvedArrowHelpers.getCurvedArrowHandlePosition).toBeTypeOf('function');
    expect(curvedArrowHelpers.getCurvedArrowCurveFromHandle).toBeTypeOf('function');
    const handle = curvedArrowHelpers.getCurvedArrowHandlePosition!(
      100,
      200,
      100,
      0.5,
      90,
    );
    expect(handle.x).toBeCloseTo(60);
    expect(handle.y).toBeCloseTo(200);
    expect(curvedArrowHelpers.getCurvedArrowCurveFromHandle!(
      100,
      200,
      100,
      90,
      handle.x,
      handle.y,
    )).toBeCloseTo(0.5);
  });

  it('changes straight and double arrow heads after vertical resize', () => {
    for (const kind of ['arrow', 'double-arrow'] as const) {
      const short = getShapeGeometry(kind, 180, 24);
      const tall = getShapeGeometry(kind, 180, 96);
      expect(short.fillPath, kind).not.toBe(tall.fillPath);
    }
  });
});
