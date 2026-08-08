import { beforeEach, describe, expect, it } from 'vitest';
import { addRecentColor, loadStoredRecentColors, storeRecentColors } from '@/utils/recentColors';

describe('recent text colors', () => {
  beforeEach(() => localStorage.clear());

  it('keeps unique colors newest-first and limits the palette to ten', () => {
    let colors: string[] = [];
    for (let index = 0; index < 12; index++) colors = addRecentColor(colors, `#0000${index.toString(16).padStart(2, '0')}`);
    colors = addRecentColor(colors, '#000005');

    expect(colors).toHaveLength(10);
    expect(colors[0]).toBe('#000005');
    expect(colors.filter(color => color === '#000005')).toHaveLength(1);
  });

  it('persists only valid string colors', () => {
    storeRecentColors(['#112233', '#abcdef']);
    expect(loadStoredRecentColors()).toEqual(['#112233', '#abcdef']);
    localStorage.setItem('manga-studio-recent-text-colors', JSON.stringify(['#ffffff', 42, null]));
    expect(loadStoredRecentColors()).toEqual(['#ffffff']);
  });
});
