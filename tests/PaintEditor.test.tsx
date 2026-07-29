import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintEditor } from '@/components/editor/panels/PaintEditor';

const solid = { type: 'solid' as const, color: '#ffffff' };

describe('PaintEditor', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  it('creates two stops when switching from solid to linear', () => {
    const onChange = vi.fn();
    render(<PaintEditor label="Заливка" value={solid} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Линейный' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      type: 'linear',
      stops: expect.arrayContaining([expect.objectContaining({ offset: 0 }), expect.objectContaining({ offset: 1 })]),
    }));
  });

  it('changes the selected stop color', () => {
    const onChange = vi.fn();
    const value = {
      type: 'linear' as const,
      angle: 0,
      stops: [
        { id: 'a', offset: 0, color: '#000000' },
        { id: 'b', offset: 1, color: '#ffffff' },
      ],
    };
    render(<PaintEditor label="Заливка" value={value} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Цвет выбранной точки'), { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      stops: expect.arrayContaining([expect.objectContaining({ id: 'a', color: '#ff0000' })]),
    }));
  });

  it('saves and applies a custom preset', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Мой неон');
    const onChange = vi.fn();
    render(<PaintEditor label="Заливка" value={solid} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить градиент' }));
    const preset = screen.getByTitle('Мой неон');
    expect(preset).toBeTruthy();
    fireEvent.click(preset);
    expect(onChange).toHaveBeenCalledWith(solid);
  });

  it('toggles neon and reports the glow update', () => {
    const onGlowChange = vi.fn();
    render(<PaintEditor label="Заливка" value={solid} glow={{ enabled: false, color: '#00e5ff', blur: 24, opacity: 0.8, intensity: 1 }} onChange={vi.fn()} onGlowChange={onGlowChange} />);
    fireEvent.click(screen.getByLabelText('Неон'));
    expect(onGlowChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });
});
