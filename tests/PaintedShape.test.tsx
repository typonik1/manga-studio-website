import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaintedShape } from '@/components/editor/PaintedShape';

vi.mock('react-konva', () => ({
  Path: (props: {
    shadowColor?: string;
    shadowBlur?: number;
    shadowOpacity?: number;
    opacity?: number;
    strokeWidth?: number;
  }) => (
    <div
      data-testid="painted-path"
      data-shadow-color={props.shadowColor}
      data-shadow-blur={props.shadowBlur}
      data-shadow-opacity={props.shadowOpacity}
      data-opacity={props.opacity}
      data-stroke-width={props.strokeWidth}
    />
  ),
}));

afterEach(() => cleanup());

describe('PaintedShape glow', () => {
  it('renders glow passes for a fill-only neon shape', () => {
    render(
      <PaintedShape
        data="M 0 0 L 10 0 L 10 10 Z"
        bounds={{ x: 0, y: 0, width: 10, height: 10 }}
        fillStyle={{ type: 'solid', color: '#ff00ff' }}
        fallbackStroke=""
        strokeWidth={0}
        glow={{ enabled: true, color: '#00ffff', blur: 20, opacity: 0.8, intensity: 2 }}
        glowScale={0.5}
      />,
    );
    const paths = screen.getAllByTestId('painted-path');
    expect(paths).toHaveLength(3);
    expect(paths[0].getAttribute('data-shadow-blur')).toBe('10');
    expect(paths[0].getAttribute('data-shadow-opacity')).toBe('1');
    expect(paths[0].getAttribute('data-opacity')).toBe('0.4');
  });
});
