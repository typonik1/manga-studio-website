import type { GradientPreset, PaintStyle } from '@/types';
import { clonePaintStyle, normalizePaintStyle } from '@/utils/objectPaint';

export interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'manga-studio:paint-presets:v1';

const style = (stops: Array<[string, string]>, angle = 90): PaintStyle => ({
  type: 'linear',
  angle,
  stops: stops.map(([color, offset], index) => ({
    id: `built-in-${index}`,
    color,
    offset: Number(offset),
  })),
});

export const BUILT_IN_GRADIENTS: GradientPreset[] = [
  { id: 'builtin-manga', name: 'Манга', builtIn: true, style: { type: 'solid', color: '#ffffff' } },
  { id: 'builtin-sunset', name: 'Закат', builtIn: true, style: style([['#ff7eb3', '0'], ['#ff758c', '0.5'], ['#ffb199', '1']]) },
  { id: 'builtin-ocean', name: 'Океан', builtIn: true, style: style([['#00c6ff', '0'], ['#0072ff', '1'],], 0) },
  { id: 'builtin-candy', name: 'Конфета', builtIn: true, style: style([['#fbc2eb', '0'], ['#a6c1ee', '1'],], 45) },
  { id: 'builtin-fire', name: 'Огонь', builtIn: true, style: style([['#ff512f', '0'], ['#f09819', '1'],], 90) },
  { id: 'builtin-cyber', name: 'Киберпанк', builtIn: true, style: style([['#12c2e9', '0'], ['#c471ed', '0.5'], ['#f64f59', '1']], 0) },
  { id: 'builtin-gold', name: 'Золото', builtIn: true, style: style([['#f6d365', '0'], ['#fda085', '1']], 45) },
];

function clonePreset(preset: GradientPreset): GradientPreset {
  return { ...preset, style: clonePaintStyle(preset.style) };
}

function customPresets(presets: GradientPreset[]) {
  return presets.filter(preset => !preset.builtIn);
}

function persist(storage: PresetStorage, presets: GradientPreset[]) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(customPresets(presets).map(clonePreset)));
  } catch {
    // Private browsing and quota errors should not disable the editor.
  }
}

export function loadGradientPresets(storage: PresetStorage | undefined): GradientPreset[] {
  const result = BUILT_IN_GRADIENTS.map(clonePreset);
  if (!storage) return result;
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return result;
    const custom = parsed.flatMap(item => {
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') return [];
      return [{
        id: typeof item.id === 'string' ? item.id : `preset-${Date.now()}`,
        name: item.name,
        style: normalizePaintStyle(item.style, '#ffffff'),
        builtIn: false,
      } satisfies GradientPreset];
    });
    return [...result, ...custom];
  } catch {
    return result;
  }
}

export function saveGradientPreset(
  storage: PresetStorage | undefined,
  presets: GradientPreset[],
  name: string,
  paint: PaintStyle,
): GradientPreset[] {
  const cleanName = name.trim() || 'Мой градиент';
  const names = new Set(presets.map(preset => preset.name));
  let candidate = cleanName;
  let suffix = 2;
  while (names.has(candidate)) candidate = `${cleanName} (${suffix++})`;
  const next = [...presets, {
    id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: candidate,
    style: clonePaintStyle(paint),
    builtIn: false,
  }];
  if (storage) persist(storage, next);
  return next;
}

export function renameGradientPreset(
  storage: PresetStorage | undefined,
  presets: GradientPreset[],
  id: string,
  name: string,
): GradientPreset[] {
  const cleanName = name.trim();
  if (!cleanName) return presets;
  const next = presets.map(preset => preset.id === id && !preset.builtIn
    ? { ...preset, name: cleanName }
    : preset);
  if (storage) persist(storage, next);
  return next;
}

export function deleteGradientPreset(
  storage: PresetStorage | undefined,
  presets: GradientPreset[],
  id: string,
): GradientPreset[] {
  const next = presets.filter(preset => preset.builtIn || preset.id !== id);
  if (storage) persist(storage, next);
  return next;
}

export function getBrowserPresetStorage(): PresetStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}
