import type {
  BubbleObject,
  GlowStyle,
  PaintStyle,
  ShapeObject,
} from '@/types';
import { getBubblePath, getThoughtTailCircles } from '@/utils/bubbleGeometry';
import { createCanvasPaint, normalizeGlowStyle } from '@/utils/objectPaint';
import { getShapeGeometry } from '@/utils/shapeGeometry';
import { isOpenShape } from '@/utils/shapePresets';

interface LocalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PathPaintOptions {
  fillStyle?: PaintStyle;
  strokeStyle?: PaintStyle;
  fallbackFill?: string;
  fallbackStroke?: string;
  strokeWidth?: number;
  glow?: GlowStyle;
  fill?: boolean;
  stroke?: boolean;
}

function drawPaintedPath(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  bounds: LocalBounds,
  options: PathPaintOptions,
) {
  const fill = options.fill !== false && Boolean(options.fillStyle || options.fallbackFill);
  const stroke = options.stroke !== false
    && (options.strokeWidth ?? 0) > 0
    && Boolean(options.strokeStyle || options.fallbackStroke);
  const glow = normalizeGlowStyle(options.glow);

  if (glow.enabled && (fill || stroke)) {
    for (let pass = 0; pass < glow.intensity; pass++) {
      ctx.save();
      ctx.globalAlpha *= glow.opacity / glow.intensity;
      ctx.shadowColor = glow.color;
      ctx.shadowBlur = glow.blur * (1 + pass * 0.35);
      if (fill) {
        ctx.fillStyle = createCanvasPaint(
          ctx,
          options.fillStyle ?? { type: 'solid', color: options.fallbackFill || '#ffffff' },
          bounds,
          options.fallbackFill || '#ffffff',
        );
        ctx.fill(path);
      }
      if (stroke) {
        ctx.strokeStyle = createCanvasPaint(
          ctx,
          options.strokeStyle ?? { type: 'solid', color: options.fallbackStroke || '#000000' },
          bounds,
          options.fallbackStroke || '#000000',
        );
        ctx.lineWidth = (options.strokeWidth ?? 0) + glow.blur * (0.35 + pass * 0.12);
        ctx.stroke(path);
      }
      ctx.restore();
    }
  }

  if (fill) {
    ctx.fillStyle = createCanvasPaint(
      ctx,
      options.fillStyle ?? { type: 'solid', color: options.fallbackFill || '#ffffff' },
      bounds,
      options.fallbackFill || '#ffffff',
    );
    ctx.fill(path);
  }
  if (stroke) {
    ctx.strokeStyle = createCanvasPaint(
      ctx,
      options.strokeStyle ?? { type: 'solid', color: options.fallbackStroke || '#000000' },
      bounds,
      options.fallbackStroke || '#000000',
    );
    ctx.lineWidth = options.strokeWidth ?? 0;
    ctx.stroke(path);
  }
}

function roundedRectPath(width: number, height: number, radius: number) {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);
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

function starPath(width: number, height: number) {
  const outer = Math.min(width, height) / 2;
  const inner = outer / 2;
  const parts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = Math.PI / 5 * i - Math.PI / 2;
    parts.push(`${i === 0 ? 'M' : 'L'} ${Math.cos(angle) * radius} ${Math.sin(angle) * radius}`);
  }
  return `${parts.join(' ')} Z`;
}

function shapePaths(shape: ShapeObject, width: number, height: number) {
  if (shape.kind === 'rect') {
    return { fillPath: roundedRectPath(width, height, shape.cornerRadius), strokePath: roundedRectPath(width, height, shape.cornerRadius) };
  }
  if (shape.kind === 'ellipse') {
    const path = getBubblePath('speech', {
      x: 0, y: 0, width, height, rotation: 0, tail: null,
    });
    return { fillPath: path, strokePath: path };
  }
  if (shape.kind === 'star') {
    const path = starPath(width, height);
    return { fillPath: path, strokePath: path };
  }
  if (shape.kind === 'line') {
    return { strokePath: `M ${-width / 2} 0 L ${width / 2} 0` };
  }
  return getShapeGeometry(shape.kind, width, height, shape.curve ?? 0.35);
}

export function drawShapeToContext(
  ctx: CanvasRenderingContext2D,
  shape: ShapeObject,
  docWidth: number,
  docHeight: number,
) {
  if (!shape.visible) return;
  const width = shape.width * docWidth;
  const height = shape.height * docHeight;
  const bounds = { x: -width / 2, y: -height / 2, width, height };
  const paths = shapePaths(shape, width, height);
  const fillStyle = shape.fillStyle ?? { type: 'solid' as const, color: shape.fill || 'transparent' };
  const strokeStyle = shape.strokeStyle ?? { type: 'solid' as const, color: shape.stroke || '#000000' };
  const open = isOpenShape(shape.kind) || shape.kind === 'line';

  ctx.save();
  ctx.globalAlpha = shape.opacity;
  ctx.translate(shape.x * docWidth, shape.y * docHeight);
  ctx.rotate(shape.rotation * Math.PI / 180);
  ctx.scale(shape.scaleX, shape.scaleY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(shape.lineStyle === 'dashed'
    ? [12, 8]
    : shape.lineStyle === 'dotted'
      ? [2, 7]
      : []);

  if (paths.strokePath && (open || !paths.fillPath)) {
    drawPaintedPath(ctx, new Path2D(paths.strokePath), bounds, {
      strokeStyle,
      fallbackStroke: shape.stroke,
      strokeWidth: shape.strokeWidth,
      glow: shape.glow,
      fill: false,
    });
  }
  if (paths.fillPath) {
    drawPaintedPath(ctx, new Path2D(paths.fillPath), bounds, {
      fillStyle: open ? strokeStyle : fillStyle,
      strokeStyle: open ? undefined : strokeStyle,
      fallbackFill: open ? shape.stroke : shape.fill,
      fallbackStroke: shape.stroke,
      strokeWidth: open ? 0 : shape.strokeWidth,
      glow: shape.glow,
    });
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function circlePath(cx: number, cy: number, radius: number) {
  return [
    `M ${cx + radius} ${cy}`,
    `A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy}`,
    `A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy}`,
    'Z',
  ].join(' ');
}

export function drawBubbleToContext(
  ctx: CanvasRenderingContext2D,
  bubble: BubbleObject,
  docWidth: number,
  docHeight: number,
) {
  if (!bubble.visible) return;
  const width = bubble.width * docWidth;
  const height = bubble.height * docHeight;
  const bounds = { x: -width / 2, y: -height / 2, width, height };
  const fillStyle = bubble.fillStyle ?? { type: 'solid' as const, color: bubble.fill };
  const strokeStyle = bubble.strokeStyle ?? { type: 'solid' as const, color: bubble.stroke };

  ctx.save();
  ctx.translate(bubble.x * docWidth, bubble.y * docHeight);
  ctx.rotate(bubble.rotation * Math.PI / 180);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(bubble.kind === 'whisper' ? [6, 4] : []);

  const pathData = getBubblePath(bubble.kind, {
    x: 0,
    y: 0,
    width,
    height,
    rotation: bubble.rotation,
    tail: bubble.tail,
  });
  drawPaintedPath(ctx, new Path2D(pathData), bounds, {
    fillStyle,
    strokeStyle,
    fallbackFill: bubble.fill,
    fallbackStroke: bubble.stroke,
    strokeWidth: bubble.strokeWidth,
    glow: bubble.glow,
  });

  if (bubble.kind === 'thought') {
    for (const circle of getThoughtTailCircles(bubble.tail, width, height)) {
      const circleBounds = {
        x: circle.cx - circle.r,
        y: circle.cy - circle.r,
        width: circle.r * 2,
        height: circle.r * 2,
      };
      drawPaintedPath(ctx, new Path2D(circlePath(circle.cx, circle.cy, circle.r)), circleBounds, {
        fillStyle,
        strokeStyle,
        fallbackFill: bubble.fill,
        fallbackStroke: bubble.stroke,
        strokeWidth: bubble.strokeWidth,
        glow: bubble.glow,
      });
    }
  }

  const fontSize = bubble.text.fontSize;
  ctx.font = `${fontSize}px "${bubble.text.fontFamily}"`;
  ctx.fillStyle = bubble.text.fill;
  ctx.textAlign = bubble.text.align;
  ctx.textBaseline = 'middle';
  const lines = bubble.text.content.split('\n');
  const lineHeight = fontSize * bubble.text.lineHeight;
  for (let index = 0; index < lines.length; index++) {
    const y = (index - lines.length / 2 + 0.5) * lineHeight;
    ctx.fillText(lines[index], 0, y);
  }
  ctx.setLineDash([]);
  ctx.restore();
}
