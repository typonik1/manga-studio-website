const STORAGE_KEY = 'manga-studio-recent-text-colors';
const MAX_RECENT_COLORS = 10;

function normalizeColor(color: string): string | null {
  const value = color.trim().toLowerCase();
  return value ? value : null;
}

export function addRecentColor(colors: string[], color: string): string[] {
  const normalized = normalizeColor(color);
  if (!normalized) return colors.slice(0, MAX_RECENT_COLORS);
  return [normalized, ...colors.filter(item => normalizeColor(item) !== normalized)]
    .slice(0, MAX_RECENT_COLORS);
}

export function loadStoredRecentColors(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .reduce<string[]>((colors, color) => addRecentColor(colors, color), [])
      .reverse()
      .slice(0, MAX_RECENT_COLORS);
  } catch {
    return [];
  }
}

export function storeRecentColors(colors: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(colors.slice(0, MAX_RECENT_COLORS)));
  } catch {
    // Storage may be unavailable in private mode; the in-memory palette still works.
  }
}
