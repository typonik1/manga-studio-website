import { describe, expect, it } from 'vitest';
import { toKonvaAdjustmentValues } from '@/utils/konvaAdjustments';

describe('Konva adjustment mapping', () => {
  it('keeps neutral settings filter-free', () => {
    expect(toKonvaAdjustmentValues({ brightness: 1, contrast: 1, saturation: 1 })).toEqual({
      enabled: false, brightness: 1, contrast: 0, saturation: 0,
    });
  });

  it('maps editor multipliers to Konva filter inputs', () => {
    const values = toKonvaAdjustmentValues({ brightness: 1.5, contrast: 1.44, saturation: 2 });
    expect(values.enabled).toBe(true);
    expect(values.brightness).toBeCloseTo(1.5);
    expect(values.contrast).toBeCloseTo(20);
    expect(values.saturation).toBeCloseTo(1);
  });
});
