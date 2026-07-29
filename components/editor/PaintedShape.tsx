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
  dash?: number[];
  dashEnabled?: boolean;
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
  dash,
  dashEnabled,
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
  const glowPasses = glowStyle.enabled && strokeWidth > 0 ? glowStyle.intensity : 0;

  return (
    <Fragment>
      {Array.from({ length: glowPasses }, (_, index) => (
        <Path
          key={`glow-${index}`}
          data={data}
          {...strokeProps}
          strokeWidth={strokeWidth + glowStyle.blur * (0.4 + index * 0.15)}
          shadowColor={glowStyle.color}
          shadowBlur={glowStyle.blur * (1 + index * 0.35)}
          shadowOpacity={glowStyle.opacity / glowPasses}
          opacity={opacity}
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
        opacity={opacity}
        listening={listening}
      />
    </Fragment>
  );
}
