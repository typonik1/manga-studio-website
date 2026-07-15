'use client';

/**
 * EditorSlider — a range input with:
 * - Mouse-wheel support (scroll to change value)
 * - Pointer capture so dragging never escapes the input or triggers layer drag
 * - Shift×10 and Alt×0.1 multipliers
 * - No React state for cursor position
 */
export function EditorSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  style,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
  style?: React.CSSProperties;
  /** Optional display formatter, used in the tooltip/title only */
  fmt?: (v: number) => string;
}) {
  function handleWheel(e: React.WheelEvent<HTMLInputElement>) {
    e.preventDefault();
    e.stopPropagation();
    const dir = e.deltaY < 0 ? 1 : -1;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const next = Math.max(min, Math.min(max, value + dir * step * mult));
    onChange(next);
  }

  return (
    <input
      aria-label={label}
      title={fmt ? fmt(value) : String(value)}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      className={className}
      style={style}
      onChange={e => onChange(Number(e.target.value))}
      onWheel={handleWheel}
      onPointerDown={e => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={e => {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onDragStart={e => e.preventDefault()}
    />
  );
}
