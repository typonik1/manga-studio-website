import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayerSlider } from '@/components/editor/RightPanel';

function Harness({ onBeforeChange }: { onBeforeChange: () => void }) {
  const [value, setValue] = useState(50);
  return (
    <LayerSlider
      label="Яркость"
      min={0}
      max={100}
      value={value}
      onBeforeChange={onBeforeChange}
      onChange={setValue}
    />
  );
}

describe('LayerSlider history boundary', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('creates one snapshot for a wheel burst and a new one after the burst', () => {
    vi.useFakeTimers();
    const onBeforeChange = vi.fn();
    render(<Harness onBeforeChange={onBeforeChange} />);
    const slider = screen.getByLabelText('Яркость');

    fireEvent.wheel(slider, { deltaY: -1 });
    fireEvent.wheel(slider, { deltaY: -1 });
    expect(onBeforeChange).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(251);
    fireEvent.wheel(slider, { deltaY: -1 });
    expect(onBeforeChange).toHaveBeenCalledTimes(2);
  });

  it('coalesces keyboard changes until keyup', () => {
    const onBeforeChange = vi.fn();
    render(<Harness onBeforeChange={onBeforeChange} />);
    const slider = screen.getByLabelText('Яркость');

    fireEvent.change(slider, { target: { value: '51' } });
    fireEvent.change(slider, { target: { value: '52' } });
    expect(onBeforeChange).toHaveBeenCalledTimes(1);

    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    fireEvent.change(slider, { target: { value: '53' } });
    expect(onBeforeChange).toHaveBeenCalledTimes(2);
  });
});
