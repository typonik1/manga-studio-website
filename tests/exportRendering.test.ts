import { describe, expect, it, vi } from 'vitest';
import { initializeExportCanvas } from '@/utils/textRenderer';

describe('export canvas background', () => {
  it('fills JPEG exports white before drawing layers', () => {
    const fillRect = vi.fn();
    const context = { fillStyle: '', fillRect } as unknown as CanvasRenderingContext2D;

    initializeExportCanvas(context, 640, 480, 'jpg');

    expect(context.fillStyle).toBe('#ffffff');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 640, 480);
  });

  it('keeps PNG exports transparent', () => {
    const fillRect = vi.fn();
    const context = { fillStyle: '', fillRect } as unknown as CanvasRenderingContext2D;

    initializeExportCanvas(context, 640, 480, 'png');

    expect(fillRect).not.toHaveBeenCalled();
  });
});
