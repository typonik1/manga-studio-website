import { BubbleKind } from '@/types';

export interface BubbleGeometryParams {
  x: number;           // normalized center x
  y: number;           // normalized center y
  width: number;       // normalized width
  height: number;      // normalized height
  rotation: number;    // degrees
  tipX?: number;       // normalized tail tip x (if tail enabled)
  tipY?: number;       // normalized tail tip y (if tail enabled)
  tailWidth?: number;  // fraction of body width
}

// Create seeded random for deterministic jitter
function seededRandom(seed: string): () => number {
  let value = 0;
  for (let i = 0; i < seed.length; i++) {
    value = ((value << 5) - value) + seed.charCodeAt(i);
    value = value & value; // Convert to 32bit integer
  }
  const x = Math.sin(value) * 10000;
  return () => x - Math.floor(x);
}

/**
 * Draw speech bubble: smooth oval with tail as a wedge
 */
export function getSpeechBubblePath(params: BubbleGeometryParams): string {
  const { x, y, width, height, tipX = 0, tipY = 0, tailWidth = 0.3 } = params;
  const w = width / 2;
  const h = height / 2;

  // Ellipse path (main bubble body)
  const pathParts: string[] = [];
  const segm = 72; // segments for smooth ellipse
  let px = x + w;
  let py = y;

  pathParts.push(`M ${px} ${py}`);
  for (let i = 1; i <= segm; i++) {
    const angle = (i / segm) * Math.PI * 2;
    const nx = x + w * Math.cos(angle);
    const ny = y + h * Math.sin(angle);
    pathParts.push(`L ${nx} ${ny}`);
  }

  // Add tail if tip is outside body
  if (Math.abs(tipX - x) > 0.001 || Math.abs(tipY - y) > 0.001) {
    // Find intersection point: ray from center to tip
    const dx = tipX - x;
    const dy = tipY - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.001) {
      const ux = dx / dist;
      const uy = dy / dist;
      // Find point on ellipse edge
      const edgeX = x + w * ux;
      const edgeY = y + h * uy;

      // Tail wedge points
      const tailLen = Math.min(0.15, dist * 0.3);
      const baseW = (tailWidth || 0.2) * w * 0.5;
      const perpX = -uy;
      const perpY = ux;

      const p1x = edgeX + perpX * baseW;
      const p1y = edgeY + perpY * baseW;
      const p2x = edgeX - perpX * baseW;
      const p2y = edgeY - perpY * baseW;
      const p3x = tipX;
      const p3y = tipY;

      pathParts.push(`L ${p1x} ${p1y}`);
      pathParts.push(`L ${p3x} ${p3y}`);
      pathParts.push(`L ${p2x} ${p2y}`);
      pathParts.push(`L ${edgeX} ${edgeY}`);
    }
  }

  pathParts.push('Z');
  return pathParts.join(' ');
}

/**
 * Draw thought bubble: bumpy oval outline + small circles as tail
 */
export function getThoughtBubblePath(params: BubbleGeometryParams): string {
  const { x, y, width, height, tipX = 0, tipY = 0 } = params;
  const w = width / 2;
  const h = height / 2;

  const pathParts: string[] = [];
  const bumps = 12;
  let px = x + w;
  let py = y;

  // Draw bumpy outline
  for (let i = 0; i <= bumps; i++) {
    const angle = (i / bumps) * Math.PI * 2;
    const bumpScale = 1 + 0.15 * Math.sin(angle * 3); // modulate radius
    const nx = x + w * bumpScale * Math.cos(angle);
    const ny = y + h * bumpScale * Math.sin(angle);
    if (i === 0) {
      pathParts.push(`M ${nx} ${ny}`);
      px = nx;
      py = ny;
    } else {
      const cx = (px + nx) / 2;
      const cy = (py + ny) / 2;
      pathParts.push(`Q ${cx} ${cy} ${nx} ${ny}`);
      px = nx;
      py = ny;
    }
  }
  pathParts.push('Z');

  return pathParts.join(' ');
}

/**
 * Draw scream bubble: jagged star with random jitter
 */
export function getScreamBubblePath(params: BubbleGeometryParams): string {
  const { x, y, width, height, tipX = 0, tipY = 0 } = params;
  const w = width / 2;
  const h = height / 2;
  const rand = seededRandom(params.rotation?.toString() || '0');

  const pathParts: string[] = [];
  const rays = 20;
  let px: number, py: number;

  for (let i = 0; i <= rays; i++) {
    const angle = (i / rays) * Math.PI * 2;
    const isOuter = i % 2 === 0;
    const radius = isOuter ? Math.max(w, h) : Math.min(w, h) * 0.5;
    const jitter = (rand() - 0.5) * 0.1 * Math.max(w, h);

    const nx = x + (radius + jitter) * Math.cos(angle);
    const ny = y + (radius + jitter) * Math.sin(angle);

    if (i === 0) {
      pathParts.push(`M ${nx} ${ny}`);
      px = nx;
      py = ny;
    } else {
      pathParts.push(`L ${nx} ${ny}`);
    }
  }
  pathParts.push('Z');

  return pathParts.join(' ');
}

/**
 * Draw narration bubble: rounded rectangle
 */
export function getNarrationBubblePath(params: BubbleGeometryParams): string {
  const { x, y, width, height } = params;
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(w, h) * 0.1; // corner radius

  const left = x - w;
  const right = x + w;
  const top = y - h;
  const bottom = y + h;

  return `M ${left + r} ${top}
    L ${right - r} ${top}
    Q ${right} ${top} ${right} ${top + r}
    L ${right} ${bottom - r}
    Q ${right} ${bottom} ${right - r} ${bottom}
    L ${left + r} ${bottom}
    Q ${left} ${bottom} ${left} ${bottom - r}
    L ${left} ${top + r}
    Q ${left} ${top} ${left + r} ${top}
    Z`;
}

/**
 * Draw whisper bubble: dashed oval (same as speech but dashed)
 */
export function getWhisperBubblePath(params: BubbleGeometryParams): string {
  // Same geometry as speech, but will be rendered with stroke-dasharray
  return getSpeechBubblePath(params);
}

/**
 * Get the path string for any bubble type
 */
export function getBubblePath(kind: BubbleKind, params: BubbleGeometryParams): string {
  switch (kind) {
    case 'speech':
      return getSpeechBubblePath(params);
    case 'thought':
      return getThoughtBubblePath(params);
    case 'scream':
      return getScreamBubblePath(params);
    case 'narration':
      return getNarrationBubblePath(params);
    case 'whisper':
      return getWhisperBubblePath(params);
    default:
      return getSpeechBubblePath(params);
  }
}

/**
 * Get SVG preview for bubble buttons (small versions)
 */
export function getBubblePreviewSvg(kind: BubbleKind): string {
  const params: BubbleGeometryParams = {
    x: 0.5,
    y: 0.5,
    width: 0.8,
    height: 0.6,
    rotation: 0,
    tipX: 0.9,
    tipY: 0.9,
  };

  const path = getBubblePath(kind, params);
  const isDashed = kind === 'whisper';

  return `<svg viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg">
    <path d="${path}" fill="white" stroke="black" stroke-width="0.03" ${isDashed ? 'stroke-dasharray="0.05"' : ''} />
  </svg>`;
}
