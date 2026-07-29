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

  it('moves a gradient stop directly on the preview bar', () => {
    const onChange = vi.fn();
    const onGestureStart = vi.fn();
    const value = {
      type: 'linear' as const,
      angle: 0,
      stops: [
        { id: 'a', offset: 0.2, color: '#000000' },
        { id: 'b', offset: 1, color: '#ffffff' },
      ],
    };
    render(
      <PaintEditor
        label="Заливка"
        value={value}
        onGestureStart={onGestureStart}
        onChange={onChange}
      />,
    );
    const bar = screen.getByRole('button', { name: 'Добавить точку градиента' });
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 38,
      width: 200,
      height: 38,
      toJSON: () => ({}),
    });
    const stop = screen.getByRole('button', { name: 'Точка градиента 20%' });
    fireEvent.pointerDown(stop, { pointerId: 1, clientX: 40 });
    fireEvent.pointerMove(stop, { pointerId: 1, clientX: 150 });
    fireEvent.pointerUp(stop, { pointerId: 1, clientX: 150 });

    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      stops: expect.arrayContaining([expect.objectContaining({ id: 'a', offset: 0.75 })]),
    }));
  });

  it('adds and removes gradient stops with one history gesture each', () => {
    const onChange = vi.fn();
    const onGestureStart = vi.fn();
    const value = {
      type: 'linear' as const,
      angle: 0,
      stops: [
        { id: 'a', offset: 0, color: '#000000' },
        { id: 'b', offset: 0.5, color: '#888888' },
        { id: 'c', offset: 1, color: '#ffffff' },
      ],
    };
    render(
      <PaintEditor
        label="Заливка"
        value={value}
        onGestureStart={onGestureStart}
        onChange={onChange}
      />,
    );
    const bar = screen.getByRole('button', { name: 'Добавить точку градиента' });
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 38,
      width: 200,
      height: 38,
      toJSON: () => ({}),
    });

    fireEvent.click(bar, { clientX: 50 });
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      stops: expect.arrayContaining([expect.objectContaining({ offset: 0.25 })]),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Удалить выбранную точку' }));
    expect(onGestureStart).toHaveBeenCalledTimes(2);
  });

  it('edits radial gradient center and radius', () => {
    const onChange = vi.fn();
    const value = {
      type: 'radial' as const,
      centerX: 0.5,
      centerY: 0.5,
      radius: 1,
      stops: [
        { id: 'a', offset: 0, color: '#ffffff' },
        { id: 'b', offset: 1, color: '#000000' },
      ],
    };
    render(<PaintEditor label="Заливка" value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Центр градиента X'), { target: { value: '70' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ centerX: 0.7 }));

    fireEvent.change(screen.getByLabelText('Радиус градиента'), { target: { value: '125' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ radius: 1.25 }));
  });

  it('reverses gradient colors and offsets', () => {
    const onChange = vi.fn();
    const onGestureStart = vi.fn();
    const value = {
      type: 'linear' as const,
      angle: 0,
      stops: [
        { id: 'a', offset: 0, color: '#000000' },
        { id: 'b', offset: 0.25, color: '#ff0000' },
        { id: 'c', offset: 1, color: '#ffffff' },
      ],
    };
    render(
      <PaintEditor
        label="Заливка"
        value={value}
        onGestureStart={onGestureStart}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть градиент' }));

    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      stops: [
        expect.objectContaining({ offset: 0, color: '#ffffff' }),
        expect.objectContaining({ offset: 0.75, color: '#ff0000' }),
        expect.objectContaining({ offset: 1, color: '#000000' }),
      ],
    }));
  });

  it('saves and applies a custom preset', () => {
    const onChange = vi.fn();
    render(<PaintEditor label="Заливка" value={solid} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить градиент' }));
    fireEvent.change(screen.getByLabelText('Название градиента'), { target: { value: 'Мой неон' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пресет' }));
    const preset = screen.getByTitle('Мой неон');
    expect(preset).toBeTruthy();
    fireEvent.click(preset);
    expect(onChange).toHaveBeenCalledWith(solid);
  });

  it('renames a custom preset without a browser prompt', () => {
    render(<PaintEditor label="Заливка" value={solid} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить градиент' }));
    fireEvent.change(screen.getByLabelText('Название градиента'), { target: { value: 'Старое имя' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пресет' }));
    fireEvent.click(screen.getByRole('button', { name: 'Переименовать Старое имя' }));
    fireEvent.change(screen.getByLabelText('Название градиента'), { target: { value: 'Новое имя' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пресет' }));

    expect(screen.getByTitle('Новое имя')).toBeTruthy();
    expect(screen.queryByTitle('Старое имя')).toBeNull();
  });

  it('toggles neon and reports the glow update', () => {
    const onGlowChange = vi.fn();
    render(<PaintEditor label="Заливка" value={solid} glow={{ enabled: false, color: '#00e5ff', blur: 24, opacity: 0.8, intensity: 1 }} onChange={vi.fn()} onGlowChange={onGlowChange} />);
    fireEvent.click(screen.getByLabelText('Неон'));
    expect(onGlowChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('applies neon color presets and intensity controls', () => {
    const onGlowChange = vi.fn();
    const onGestureStart = vi.fn();
    render(
      <PaintEditor
        label="Заливка"
        value={solid}
        glow={{ enabled: true, color: '#00e5ff', blur: 24, opacity: 0.8, intensity: 1 }}
        onGestureStart={onGestureStart}
        onChange={vi.fn()}
        onGlowChange={onGlowChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Неон Розовый' }));
    expect(onGlowChange).toHaveBeenCalledWith(expect.objectContaining({ color: '#ff4fd8' }));

    fireEvent.change(screen.getByLabelText('Яркость неона'), { target: { value: '60' } });
    expect(onGlowChange).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.6 }));

    fireEvent.change(screen.getByLabelText('Интенсивность неона'), { target: { value: '3' } });
    expect(onGlowChange).toHaveBeenCalledWith(expect.objectContaining({ intensity: 3 }));
    expect(onGestureStart).toHaveBeenCalled();
  });
});
