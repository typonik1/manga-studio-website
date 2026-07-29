'use client';

import { Fragment } from 'react';
import { Path } from 'react-konva';
import type { GlowStyle, PaintStyle } from '@/types';
import { normalizeGlowStyle, toKonvaPaintProps } from '@/utils/objectPaint';

interface PaintedShapeProps {
  data: string;
  bounds: { x: number; y: number; width: number; height: number };
  fillStyle?: PaintStyle;
  strokeStyle?: PaintStyle;
  fallbackFill?: string;
  fallbackStroke?: string;
  strokeWidth?: number;
  glow?: GlowStyle;
  glowScale?: number;
  dash?: number[];
  dashEnabled?: boolean;
  hitStrokeWidth?: number;
  listening?: boolean;
  opacity?: number;
}

export function PaintedShape({
  data,
  bounds,
  fillStyle,
  strokeStyle,
  fallbackFill = '',
  fallbackStroke = '#000000',
  strokeWidth = 0,
  glow,
  glowScale = 1,
  dash,
  dashEnabled,
  hitStrokeWidth,
  listening = true,
  opacity = 1,
}: PaintedShapeProps) {
  const fillProps = fillStyle
    ? toKonvaPaintProps(fillStyle, bounds, 'fill', fallbackFill || '#ffffff')
    : fallbackFill ? { fill: fallbackFill } : {};
  const strokeProps = strokeStyle
    ? toKonvaPaintProps(strokeStyle, bounds, 'stroke', fallbackStroke)
    : fallbackStroke ? { stroke: fallbackStroke } : {};
  const glowStyle = normalizeGlowStyle(glow);
  const scaledGlowBlur = glowStyle.blur * glowScale;
  const hasVisibleFill = fillStyle
    ? fillStyle.type !== 'solid' || fillStyle.color !== 'transparent'
    : Boolean(fallbackFill && fallbackFill !== 'transparent');
  const hasVisibleStroke = strokeWidth > 0 && Boolean(strokeStyle || fallbackStroke);
  const glowPasses = glowStyle.enabled && (hasVisibleFill || hasVisibleStroke)
    ? glowStyle.intensity
    : 0;

  return (
    <Fragment>
      {Array.from({ length: glowPasses }, (_, index) => (
        <Path
          key={`glow-${index}`}
          data={data}
          {...fillProps}
          {...strokeProps}
          strokeWidth={hasVisibleStroke
            ? strokeWidth + scaledGlowBlur * (0.4 + index * 0.15)
            : 0}
          shadowColor={glowStyle.color}
          shadowBlur={scaledGlowBlur * (1 + index * 0.35)}
          shadowOpacity={1}
          opacity={opacity * glowStyle.opacity / glowPasses}
          lineCap="round"
          lineJoin="round"
          dash={dash}
          dashEnabled={dashEnabled}
          listening={false}
        />
      ))}
      <Path
        data={data}
        {...fillProps}
        {...strokeProps}
        strokeWidth={strokeWidth}
        dash={dash}
        dashEnabled={dashEnabled}
        hitStrokeWidth={hitStrokeWidth}
        opacity={opacity}
        lineCap="round"
        lineJoin="round"
        listening={listening}
      />
    </Fragment>
  );
}
