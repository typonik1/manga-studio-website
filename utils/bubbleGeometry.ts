import type { BubbleKind, BubbleTail } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Public geometry params – pixel-space, centered at (0,0)
// ─────────────────────────────────────────────────────────────────────────────
export interface BubbleGeometryParams {
  x: number;           // always 0 in local space
  y: number;           // always 0 in local space
  width: number;       // pixel width of body
  height: number;      // pixel height of body
  rotation: number;    // degrees (only used by scream jitter seed)
  tail?: BubbleTail | null;
  // legacy support
  tipX?: number;
  tipY?: number;
  tailWidth?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tail constraint helpers
// ─────────────────────────────────────────────────────────────────────────────
const ANCHOR_MIN = 0.12;
const ANCHOR_MAX = 0.88;
const LENGTH_MIN = 0.08;
const LENGTH_MAX = 0.80;
const WIDTH_MIN  = 0.04;
const WIDTH_MAX  = 0.25;

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/** Migrate old tipX/tipY tail to the new structured model (pixels, centered at 0,0). */
export function migrateTail(
  tail: BubbleTail,
  bodyW: number,
  bodyH: number,
): BubbleTail {
  // Already migrated
  if (tail.side && tail.anchor !== undefined && tail.length !== undefined && tail.curve !== undefined) {
    return {
      ...tail,
      anchor: clamp(tail.anchor, ANCHOR_MIN, ANCHOR_MAX),
      length: clamp(tail.length, LENGTH_MIN, LENGTH_MAX),
      width:  clamp(tail.width,  WIDTH_MIN,  WIDTH_MAX),
    };
  }

  // Legacy: tipX/tipY are in normalized doc space relative to bubble center.
  // At this point BubbleNode calls us with local-pixel coords:
  //   tipLocalX = (bubble.tail.tipX - bubble.x) * pW
  //   tipLocalY = (bubble.tail.tipY - bubble.y) * pH
  // So we receive the pixel offset directly via tipX/tipY on the params object.
  const tx = tail.tipX ?? 0;
  const ty = tail.tipY ?? 0;
  const hw = bodyW / 2;
  const hh = bodyH / 2;

  // Determine closest side from the tip direction
  const absx = Math.abs(tx) / (hw || 1);
  const absy = Math.abs(ty) / (hh || 1);
  let side: BubbleTail['side'];
  let anchor: number;
  let length: number;

  if (absx >= absy) {
    side = tx > 0 ? 'right' : 'left';
    anchor = clamp(0.5 + ty / (bodyH || 1), ANCHOR_MIN, ANCHOR_MAX);
    const baseEdge = hw;
    length = clamp((Math.abs(tx) - baseEdge) / (Math.min(bodyW, bodyH) || 1), LENGTH_MIN, LENGTH_MAX);
  } else {
    side = ty > 0 ? 'bottom' : 'top';
    anchor = clamp(0.5 + tx / (bodyW || 1), ANCHOR_MIN, ANCHOR_MAX);
    const baseEdge = hh;
    length = clamp((Math.abs(ty) - baseEdge) / (Math.min(bodyW, bodyH) || 1), LENGTH_MIN, LENGTH_MAX);
  }

  return {
    enabled: tail.enabled,
    side,
    anchor,
    length,
    width: clamp(tail.width ?? 0.12, WIDTH_MIN, WIDTH_MAX),
    curve: 0.3,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute the tip point in local pixel space given structured tail params
// ─────────────────────────────────────────────────────────────────────────────
export function tailTipPixels(tail: BubbleTail, bodyW: number, bodyH: number): { x: number; y: number } {
  const hw = bodyW / 2;
  const hh = bodyH / 2;
  const shorter = Math.min(bodyW, bodyH);
  const length = clamp(tail.length, LENGTH_MIN, LENGTH_MAX) * shorter;

  switch (tail.side) {
    case 'top':
      return { x: (tail.anchor - 0.5) * bodyW, y: -hh - length };
    case 'bottom':
      return { x: (tail.anchor - 0.5) * bodyW, y:  hh + length };
    case 'left':
      return { x: -hw - length, y: (tail.anchor - 0.5) * bodyH };
    case 'right':
      return { x:  hw + length, y: (tail.anchor - 0.5) * bodyH };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute the tail base-center on the ellipse edge
// ─────────────────────────────────────────────────────────────────────────────
function tailBaseCenter(tail: BubbleTail, bodyW: number, bodyH: number): { x: number; y: number } {
  const hw = bodyW / 2;
  const hh = bodyH / 2;
  switch (tail.side) {
    case 'top':    return { x: (tail.anchor - 0.5) * bodyW, y: -hh };
    case 'bottom': return { x: (tail.anchor - 0.5) * bodyW, y:  hh };
    case 'left':   return { x: -hw, y: (tail.anchor - 0.5) * bodyH };
    case 'right':  return { x:  hw, y: (tail.anchor - 0.5) * bodyH };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Smooth ellipse path with a Bézier tail
// ─────────────────────────────────────────────────────────────────────────────
function ellipsePath(hw: number, hh: number): string {
  // SVG ellipse via 4 cubic Bézier arcs (κ = 0.5523)
  const k = 0.5523;
  const kx = hw * k, ky = hh * k;
  return [
    `M ${hw} 0`,
    `C ${hw} ${-ky} ${kx} ${-hh} 0 ${-hh}`,
    `C ${-kx} ${-hh} ${-hw} ${-ky} ${-hw} 0`,
    `C ${-hw} ${ky} ${-kx} ${hh} 0 ${hh}`,
    `C ${kx} ${hh} ${hw} ${ky} ${hw} 0`,
    'Z',
  ].join(' ');
}

function speechBubblePath(params: BubbleGeometryParams, tail: BubbleTail | null): string {
  const hw = params.width / 2;
  const hh = params.height / 2;
  const shorter = Math.min(params.width, params.height);

  if (!tail?.enabled) return ellipsePath(hw, hh);

  const t = tail;
  const baseW = clamp(t.width, WIDTH_MIN, WIDTH_MAX) * shorter * 0.5;
  const tip = tailTipPixels(t, params.width, params.height);
  const bc  = tailBaseCenter(t, params.width, params.height);
  const curve = clamp(t.curve ?? 0.3, 0, 1);

  // Perpendicular direction to the tail axis at the base
  let perpX = 0, perpY = 0;
  switch (t.side) {
    case 'top': case 'bottom': perpX = 1; perpY = 0; break;
    case 'left': case 'right': perpX = 0; perpY = 1; break;
  }

  const lx = bc.x - perpX * baseW;
  const ly = bc.y - perpY * baseW;
  const rx = bc.x + perpX * baseW;
  const ry = bc.y + perpY * baseW;

  // Control points for curved tail sides
  const midX = (bc.x + tip.x) / 2;
  const midY = (bc.y + tip.y) / 2;
  const cpOffset = curve * baseW;
  const lcp = { x: midX + perpX * cpOffset, y: midY + perpY * cpOffset };
  const rcp = { x: midX - perpX * cpOffset, y: midY - perpY * cpOffset };

  // Build ellipse with a notch where the tail exits
  // We parameterize the ellipse angle at the base center
  const kappa = 0.5523;
  const kx = hw * kappa, ky = hh * kappa;

  // Angle of the base center on the ellipse
  const baseAngle = Math.atan2(bc.y / hh, bc.x / hw);
  // Angular half-width of the notch
  const notchHalfAngle = Math.max(0.08, (baseW / shorter) * 0.5);
  const a1 = baseAngle - notchHalfAngle;
  const a2 = baseAngle + notchHalfAngle;

  // Point on ellipse at angle θ
  const ep = (a: number) => ({ x: hw * Math.cos(a), y: hh * Math.sin(a) });
  const ep1 = ep(a1);
  const ep2 = ep(a2);

  return [
    `M ${hw} 0`,
    `C ${hw} ${-ky} ${kx} ${-hh} 0 ${-hh}`,
    `C ${-kx} ${-hh} ${-hw} ${-ky} ${-hw} 0`,
    `C ${-hw} ${ky} ${-kx} ${hh} 0 ${hh}`,
    `C ${kx} ${hh} ${hw} ${ky} ${hw} 0`,
    // Re-draw from start, arc to notch left point
    `M ${ep1.x} ${ep1.y}`,
    // Tail left side
    `Q ${lcp.x} ${lcp.y} ${tip.x} ${tip.y}`,
    // Tail right side
    `Q ${rcp.x} ${rcp.y} ${ep2.x} ${ep2.y}`,
    'Z',
  ].join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Thought bubble: cloud of bumps + separate circle tail
// ─────────────────────────────────────────────────────────────────────────────
function thoughtBubblePath(params: BubbleGeometryParams): string {
  const { width: W, height: H } = params;
  const hw = W / 2, hh = H / 2;
  const bumps = 10;
  const parts: string[] = [];

  for (let i = 0; i < bumps; i++) {
    const a1 = (i / bumps) * Math.PI * 2;
    const a2 = ((i + 1) / bumps) * Math.PI * 2;
    const mid = (a1 + a2) / 2;
    const bumpR = 1.18; // bump outward scale
    const cx = hw * bumpR * Math.cos(mid);
    const cy = hh * bumpR * Math.sin(mid);
    const x1 = hw * Math.cos(a1), y1 = hh * Math.sin(a1);
    const x2 = hw * Math.cos(a2), y2 = hh * Math.sin(a2);
    if (i === 0) parts.push(`M ${x1} ${y1}`);
    parts.push(`Q ${cx} ${cy} ${x2} ${y2}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Returns the 2–3 thought-tail circles as separate SVG path circles */
export function getThoughtTailCircles(
  tail: BubbleTail | null,
  bodyW: number,
  bodyH: number,
): Array<{ cx: number; cy: number; r: number }> {
  if (!tail?.enabled) return [];
  const tip = tailTipPixels(tail, bodyW, bodyH);
  const bc  = tailBaseCenter(tail, bodyW, bodyH);
  const shorter = Math.min(bodyW, bodyH);
  const baseR = shorter * 0.055;

  const circles = [
    { t: 0.3, r: baseR },
    { t: 0.6, r: baseR * 0.68 },
    { t: 0.88, r: baseR * 0.42 },
  ];

  return circles.map(({ t, r }) => ({
    cx: bc.x + (tip.x - bc.x) * t,
    cy: bc.y + (tip.y - bc.y) * t,
    r,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scream bubble: elliptical star rays
// ─────────────────────────────────────────────────────────────────────────────
let _screamSeed = 0;
export function getScreamParams(params: BubbleGeometryParams): { rayCount: number; spikiness: number } {
  void params;
  return { rayCount: 24, spikiness: 0.35 };
}

function screamBubblePath(params: BubbleGeometryParams, opts?: { rays?: number; spikiness?: number }): string {
  const { width: W, height: H } = params;
  const hw = W / 2, hh = H / 2;
  const rays = opts?.rays ?? 24;
  const spike = opts?.spikiness ?? 0.35;
  const innerScale = 1 - spike;
  const parts: string[] = [];

  for (let i = 0; i < rays * 2; i++) {
    const angle = (i / (rays * 2)) * Math.PI * 2;
    const isOuter = i % 2 === 0;
    const rx = hw * (isOuter ? 1 : innerScale);
    const ry = hh * (isOuter ? 1 : innerScale);
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);
    if (i === 0) parts.push(`M ${x} ${y}`);
    else parts.push(`L ${x} ${y}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Narration box (rounded rect)
// ─────────────────────────────────────────────────────────────────────────────
function narrationPath(params: BubbleGeometryParams, cornerRadius?: number): string {
  const { width: W, height: H } = params;
  const hw = W / 2, hh = H / 2;
  const r = Math.min(cornerRadius ?? 8, hw * 0.2, hh * 0.2);
  return [
    `M ${-hw + r} ${-hh}`,
    `L ${hw - r} ${-hh}`,
    `Q ${hw} ${-hh} ${hw} ${-hh + r}`,
    `L ${hw} ${hh - r}`,
    `Q ${hw} ${hh} ${hw - r} ${hh}`,
    `L ${-hw + r} ${hh}`,
    `Q ${-hw} ${hh} ${-hw} ${hh - r}`,
    `L ${-hw} ${-hh + r}`,
    `Q ${-hw} ${-hh} ${-hw + r} ${-hh}`,
    'Z',
  ].join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dispatch
// ─────────────────────────────────────────────────────────────────────────────
export function getBubblePath(kind: BubbleKind, params: BubbleGeometryParams, opts?: {
  rays?: number;
  spikiness?: number;
  cornerRadius?: number;
}): string {
  const resolvedTail = resolveTail(params.tail, params);

  switch (kind) {
    case 'speech':    return speechBubblePath(params, resolvedTail);
    case 'whisper':   return speechBubblePath(params, resolvedTail); // styled differently outside
    case 'thought':   return thoughtBubblePath(params);
    case 'scream':    return screamBubblePath(params, opts);
    case 'narration': return narrationPath(params, opts?.cornerRadius);
    default:          return speechBubblePath(params, resolvedTail);
  }
}

/** Resolve and migrate tail to structured form, or return null */
export function resolveTail(
  tail: BubbleTail | null | undefined,
  params: BubbleGeometryParams,
): BubbleTail | null {
  if (!tail || !tail.enabled) return null;
  return migrateTail(tail, params.width, params.height);
}

// Legacy compat export
export function getSpeechBubblePath(params: BubbleGeometryParams): string {
  return getBubblePath('speech', params);
}
export function getThoughtBubblePath(params: BubbleGeometryParams): string {
  return getBubblePath('thought', params);
}
export function getScreamBubblePath(params: BubbleGeometryParams): string {
  return getBubblePath('scream', params);
}
export function getWhisperBubblePath(params: BubbleGeometryParams): string {
  return getBubblePath('whisper', params);
}
export function getNarrationBubblePath(params: BubbleGeometryParams): string {
  return getBubblePath('narration', params);
}
