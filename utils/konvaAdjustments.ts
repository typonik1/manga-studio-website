import type { BaseLayerAdjustments } from '@/types';

export interface KonvaAdjustmentValues {
  enabled: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
}

/**
 * Convert the editor's CSS-filter-style multipliers to the equivalent Konva
 * filter attributes. Keeping this separate lets preview filters stay live
 * while full-resolution rasterization remains reserved for export/commit.
 */
export function toKonvaAdjustmentValues(adjustments?: BaseLayerAdjustments): KonvaAdjustmentValues {
  const brightnessMultiplier = adjustments?.brightness ?? 1;
  const contrastMultiplier = adjustments?.contrast ?? 1;
  const saturationMultiplier = adjustments?.saturation ?? 1;
  return {
    enabled: brightnessMultiplier !== 1 || contrastMultiplier !== 1 || saturationMultiplier !== 1,
    brightness: brightnessMultiplier,
    // Konva's contrast filter squares (contrast + 100) / 100.
    contrast: 100 * (Math.sqrt(Math.max(0, contrastMultiplier)) - 1),
    // Konva HSL internally computes saturation as 2 ** value.
    saturation: Math.log2(Math.max(0.0001, saturationMultiplier)),
  };
}
