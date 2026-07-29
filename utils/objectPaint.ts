import type {
  GlowStyle,
  GradientStop,
  PaintStyle,
} from '@/types';

export interface PaintBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GradientPoints {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export const DEFAULT_GLOW: GlowStyle = {
  enabled: false,
  color: '#00e5ff',
  blur: 24,
  opacity: 0.8,
  intensity: 1,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const finite = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function normalizeColor(color: unknown, fallback: string) {
  return typeof color === 'string' && color.trim() ? color : fallback;
}

function normalizeStop(stop: Partial<GradientStop> | null | undefined, index: number, fallback: string): GradientStop {
  return {
    id: typeof stop?.id === 'string' && stop.id ? stop.id : `stop-${index + 1}`,
    offset: clamp(finite(stop?.offset, index === 0 ? 0 : 1), 0, 1),
    color: normalizeColor(stop?.color, fallback),
  };
}

function normalizeStops(stops: unknown, fallback: string): GradientStop[] {
  const source = Array.isArray(stops) ? stops : [];
  const normalized = source
    .map((stop, index) => normalizeStop(
      stop && typeof stop === 'object' ? stop as Partial<GradientStop> : undefined,
      index,
      fallback,
    ))
    .sort((a, b) => a.offset - b.offset);

  if (normalized.length === 0) {
    return [
      { id: 'stop-1', offset: 0, color: fallback },
      { id: 'stop-2', offset: 1, color: fallback },
    ];
  }
  if (normalized.length === 1) {
    normalized.push({
      id: normalized[0].id === 'stop-1' ? 'stop-2' : 'stop-2',
      offset: normalized[0].offset < 1 ? 1 : 0,
      color: normalized[0].color,
    });
    normalized.sort((a, b) => a.offset - b.offset);
  }
  return normalized;
}

export function normalizePaintStyle(
  style: PaintStyle | null | undefined,
  fallbackColor: string,
): PaintStyle {
  const fallback = normalizeColor(fallbackColor, '#ffffff');
  if (!style || typeof style !== 'object') {
    return { type: 'solid', color: fallback };
  }

  if (style.type === 'solid') {
    return { type: 'solid', color: normalizeColor(style.color, fallback) };
  }
  if (style.type === 'linear') {
    const angle = ((finite(style.angle, 0) % 360) + 360) % 360;
    return { type: 'linear', angle, stops: normalizeStops(style.stops, fallback) };
  }
  if (style.type === 'radial') {
    return {
      type: 'radial',
      centerX: clamp(finite(style.centerX, 0.5), 0, 1),
      centerY: clamp(finite(style.centerY, 0.5), 0, 1),
      radius: clamp(finite(style.radius, 1), 0.05, 2),
      stops: normalizeStops(style.stops, fallback),
    };
  }
  return { type: 'solid', color: fallback };
}

export function normalizeStrokePaintStyle(
  style: PaintStyle | null | undefined,
  fallbackColor: string,
): PaintStyle {
  const normalized = normalizePaintStyle(style, fallbackColor);
  if (normalized.type !== 'radial') return normalized;
  return {
    type: 'linear',
    angle: 0,
    stops: normalized.stops.map(stop => ({ ...stop })),
  };
}

export function clonePaintStyle(style: PaintStyle): PaintStyle {
  if (style.type === 'solid') return { ...style };
  if (style.type === 'linear') {
    return {
      ...style,
      stops: style.stops.map(stop => ({ ...stop })),
    };
  }
  return {
    ...style,
    stops: style.stops.map(stop => ({ ...stop })),
  };
}

export function normalizeGlowStyle(
  glow: Partial<GlowStyle> | null | undefined,
): GlowStyle {
  return {
    enabled: glow?.enabled === true,
    color: normalizeColor(glow?.color, DEFAULT_GLOW.color),
    blur: clamp(finite(glow?.blur, DEFAULT_GLOW.blur), 0, 120),
    opacity: clamp(finite(glow?.opacity, DEFAULT_GLOW.opacity), 0, 1),
    intensity: Math.round(clamp(finite(glow?.intensity, DEFAULT_GLOW.intensity), 1, 3)),
  };
}

export function cloneGlowStyle(glow: GlowStyle | undefined): GlowStyle {
  return normalizeGlowStyle(glow);
}

export function getLinearGradientPoints(angle: number, bounds: PaintBounds): GradientPoints {
  const radians = (((finite(angle, 0) % 360) + 360) % 360) * Math.PI / 180;
  const halfLength = (
    Math.abs(bounds.width * Math.cos(radians))
    + Math.abs(bounds.height * Math.sin(radians))
  ) / 2;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const dx = Math.cos(radians) * halfLength;
  const dy = Math.sin(radians) * halfLength;
  return {
    start: { x: cx - dx, y: cy - dy },
    end: { x: cx + dx, y: cy + dy },
  };
}

function colorStopsForCanvas(stops: GradientStop[]) {
  return stops.map(stop => [stop.offset, stop.color] as const);
}

export function createCanvasPaint(
  ctx: CanvasRenderingContext2D,
  style: PaintStyle,
  bounds: PaintBounds,
  fallbackColor = '#ffffff',
): string | CanvasGradient {
  const normalized = normalizePaintStyle(style, fallbackColor);
  if (normalized.type === 'solid') return normalized.color;

  if (normalized.type === 'linear') {
    const points = getLinearGradientPoints(normalized.angle, bounds);
    const gradient = ctx.createLinearGradient(
      points.start.x,
      points.start.y,
      points.end.x,
      points.end.y,
    );
    for (const [offset, color] of colorStopsForCanvas(normalized.stops)) {
      gradient.addColorStop(offset, color);
    }
    return gradient;
  }

  const cx = bounds.x + bounds.width * normalized.centerX;
  const cy = bounds.y + bounds.height * normalized.centerY;
  const radius = Math.max(bounds.width, bounds.height) * normalized.radius;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  for (const [offset, color] of colorStopsForCanvas(normalized.stops)) {
    gradient.addColorStop(offset, color);
  }
  return gradient;
}

function konvaStops(stops: GradientStop[]) {
  return stops.flatMap(stop => [stop.offset, stop.color]);
}

function gradientChannelPrefix(channel: 'fill' | 'stroke') {
  return channel === 'fill' ? 'fill' : 'stroke';
}

export function toKonvaPaintProps(
  style: PaintStyle,
  bounds: PaintBounds,
  channel: 'fill' | 'stroke',
  fallbackColor = '#ffffff',
): Record<string, unknown> {
  const normalized = channel === 'stroke'
    ? normalizeStrokePaintStyle(style, fallbackColor)
    : normalizePaintStyle(style, fallbackColor);
  const prefix = gradientChannelPrefix(channel);
  if (normalized.type === 'solid') {
    return { [channel]: normalized.color };
  }

  if (normalized.type === 'linear') {
    const points = getLinearGradientPoints(normalized.angle, bounds);
    return {
      [prefix]: undefined,
      [`${prefix}Priority`]: 'linear-gradient',
      [`${prefix}LinearGradientStartPoint`]: points.start,
      [`${prefix}LinearGradientEndPoint`]: points.end,
      [`${prefix}LinearGradientColorStops`]: konvaStops(normalized.stops),
    };
  }

  const cx = bounds.x + bounds.width * normalized.centerX;
  const cy = bounds.y + bounds.height * normalized.centerY;
  return {
    [prefix]: undefined,
    [`${prefix}Priority`]: 'radial-gradient',
    [`${prefix}RadialGradientStartPoint`]: { x: cx, y: cy },
    [`${prefix}RadialGradientEndPoint`]: { x: cx, y: cy },
    [`${prefix}RadialGradientStartRadius`]: 0,
    [`${prefix}RadialGradientEndRadius`]: Math.max(bounds.width, bounds.height) * normalized.radius,
    [`${prefix}RadialGradientColorStops`]: konvaStops(normalized.stops),
  };
}

export function paintToCss(style: PaintStyle, bounds: PaintBounds, fallbackColor = '#ffffff'): string {
  const normalized = normalizePaintStyle(style, fallbackColor);
  if (normalized.type === 'solid') return normalized.color;
  if (normalized.type === 'linear') {
    const stops = normalized.stops.map(stop => `${stop.color} ${Math.round(stop.offset * 100)}%`).join(', ');
    return `linear-gradient(${normalized.angle}deg, ${stops})`;
  }
  const stops = normalized.stops.map(stop => `${stop.color} ${Math.round(stop.offset * 100)}%`).join(', ');
  return `radial-gradient(circle at ${Math.round(normalized.centerX * 100)}% ${Math.round(normalized.centerY * 100)}%, ${stops})`;
}
