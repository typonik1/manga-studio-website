import { describe, expect, it } from 'vitest';
import {
  createPastedImageLayer,
  planPastedImagePlacement,
} from '@/utils/pastedImageLayers';

describe('pasted image placement', () => {
  it('keeps a smaller image at pixel size and centers it', () => {
    expect(planPastedImagePlacement(1000, 800, 400, 300)).toEqual({
      x: 0.3,
      y: 0.3125,
      width: 0.4,
      height: 0.375,
    });
  });

  it('fits oversized images to 95 percent without changing aspect ratio', () => {
    const crop = planPastedImagePlacement(1000, 1000, 2000, 1000);
    expect(crop.width).toBeCloseTo(0.95);
    expect(crop.height).toBeCloseTo(0.475);
    expect(crop.x).toBeCloseTo(0.025);
  });

  it('cascades multiple images while keeping them inside the page', () => {
    const first = planPastedImagePlacement(1000, 800, 400, 300, 0);
    const second = planPastedImagePlacement(1000, 800, 400, 300, 1);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
    expect(second.x + second.width).toBeLessThanOrEqual(1);
    expect(second.y + second.height).toBeLessThanOrEqual(1);
  });

  it('creates an unlocked drawing layer with a visible crop', () => {
    const layer = createPastedImageLayer({
      id: 'doc',
      width: 1000,
      height: 800,
      aiLayers: [],
    }, {
      src: 'data:image/png;base64,x',
      width: 400,
      height: 300,
      name: 'panel.png',
    });
    expect(layer).toMatchObject({
      operation: 'drawing',
      locked: false,
      visible: true,
      opacity: 1,
      name: 'panel.png',
      crop: { x: 0.3, y: 0.3125, width: 0.4, height: 0.375 },
    });
  });
});
