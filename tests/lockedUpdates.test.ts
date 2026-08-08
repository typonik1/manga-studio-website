import { describe, expect, it } from 'vitest';
import { filterLockedGeometryUpdates } from '@/utils/lockedUpdates';

describe('locked geometry update filtering', () => {
  it('drops geometry changes while keeping appearance and unlock changes', () => {
    expect(filterLockedGeometryUpdates(true, {
      x: 0.9,
      y: 0.8,
      width: 0.7,
      height: 0.6,
      scaleX: 2,
      scaleY: 3,
      rotation: 45,
      crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
      perspective: { topLeft: { x: 0, y: 0 } },
      opacity: 0.4,
      visible: false,
      fill: '#ff0000',
      locked: false,
    })).toEqual({
      opacity: 0.4,
      visible: false,
      fill: '#ff0000',
      locked: false,
    });
  });

  it('keeps all updates for an unlocked object', () => {
    const updates = { x: 0.9, rotation: 45, opacity: 0.4 };
    expect(filterLockedGeometryUpdates(false, updates)).toEqual(updates);
  });
});
