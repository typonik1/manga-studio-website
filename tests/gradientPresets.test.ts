import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_GRADIENTS,
  deleteGradientPreset,
  loadGradientPresets,
  renameGradientPreset,
  saveGradientPreset,
  type PresetStorage,
} from '@/utils/gradientPresets';
import type { PaintStyle } from '@/types';

class MemoryStorage implements PresetStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const style: PaintStyle = {
  type: 'linear',
  angle: 0,
  stops: [
    { id: 'a', offset: 0, color: '#000000' },
    { id: 'b', offset: 1, color: '#ffffff' },
  ],
};

describe('gradient presets', () => {
  it('always includes built-ins and ignores corrupt storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('manga-studio:paint-presets:v1', '{broken');
    const presets = loadGradientPresets(storage);
    expect(presets.length).toBe(BUILT_IN_GRADIENTS.length);
    expect(presets.every(preset => preset.builtIn)).toBe(true);
  });

  it('adds a suffix instead of silently replacing a duplicate name', () => {
    const storage = new MemoryStorage();
    const first = saveGradientPreset(storage, [], 'Неон', style);
    const second = saveGradientPreset(storage, first, 'Неон', style);
    expect(second.at(-1)?.name).toBe('Неон (2)');
  });

  it('renames and deletes only custom presets', () => {
    const storage = new MemoryStorage();
    const custom = saveGradientPreset(storage, [], 'Мой стиль', style)[0];
    const renamed = renameGradientPreset(storage, [...BUILT_IN_GRADIENTS, custom], custom.id, 'Новый стиль');
    expect(renamed.find(preset => preset.id === custom.id)?.name).toBe('Новый стиль');
    expect(deleteGradientPreset(storage, renamed, BUILT_IN_GRADIENTS[0].id))
      .toHaveLength(renamed.length);
    expect(deleteGradientPreset(storage, renamed, custom.id))
      .toHaveLength(renamed.length - 1);
  });
});
