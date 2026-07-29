'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GlowStyle, GradientPreset, PaintStyle } from '@/types';
import {
  clonePaintStyle,
  DEFAULT_GLOW,
  normalizeGlowStyle,
  normalizePaintStyle,
  paintToCss,
} from '@/utils/objectPaint';
import {
  deleteGradientPreset,
  getBrowserPresetStorage,
  loadGradientPresets,
  renameGradientPreset,
  saveGradientPreset,
} from '@/utils/gradientPresets';
import { PanelButton, PanelLabel } from './PanelComponents';

const PREVIEW_BOUNDS = { x: 0, y: 0, width: 220, height: 38 };

function newStopId() {
  return `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface PaintEditorProps {
  label: string;
  value: PaintStyle;
  glow?: GlowStyle;
  allowRadial?: boolean;
  onGestureStart?: () => void;
  onChange: (paint: PaintStyle) => void;
  onGlowChange?: (glow: GlowStyle) => void;
}

export function PaintEditor({
  label,
  value,
  glow,
  allowRadial = true,
  onGestureStart,
  onChange,
  onGlowChange,
}: PaintEditorProps) {
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [presets, setPresets] = useState<GradientPreset[]>([]);
  const storage = useMemo(() => getBrowserPresetStorage(), []);
  const paint = normalizePaintStyle(value, '#ffffff');
  const stops = paint.type === 'solid' ? [] : paint.stops;
  const selectedStop = stops.find(stop => stop.id === selectedStopId) ?? stops[0];
  const currentGlow = normalizeGlowStyle(glow ?? DEFAULT_GLOW);

  useEffect(() => {
    setPresets(loadGradientPresets(storage));
  }, [storage]);

  useEffect(() => {
    if (selectedStop && selectedStop.id !== selectedStopId) setSelectedStopId(selectedStop.id);
  }, [selectedStop, selectedStopId]);

  const update = (next: PaintStyle) => onChange(clonePaintStyle(next));

  const setType = (type: PaintStyle['type']) => {
    onGestureStart?.();
    if (type === 'solid') {
      const color = paint.type === 'solid' ? paint.color : (stops[0]?.color ?? '#ffffff');
      update({ type: 'solid', color });
      return;
    }
    if (paint.type === type) return;
    const baseColor = paint.type === 'solid' ? paint.color : (stops[0]?.color ?? '#ffffff');
    const endColor = paint.type === 'solid' ? '#000000' : (stops.at(-1)?.color ?? '#000000');
    const next = type === 'linear'
      ? { type: 'linear' as const, angle: 90, stops: [
        { id: newStopId(), offset: 0, color: baseColor },
        { id: newStopId(), offset: 1, color: endColor },
      ] }
      : { type: 'radial' as const, centerX: 0.5, centerY: 0.5, radius: 1, stops: [
        { id: newStopId(), offset: 0, color: baseColor },
        { id: newStopId(), offset: 1, color: endColor },
      ] };
    setSelectedStopId(next.stops[0].id);
    update(next);
  };

  const updateStop = (id: string, changes: Partial<{ color: string; offset: number }>) => {
    if (paint.type === 'solid') return;
    update({
      ...paint,
      stops: paint.stops.map(stop => stop.id === id
        ? { ...stop, ...changes, offset: changes.offset == null ? stop.offset : Math.max(0, Math.min(1, changes.offset)) }
        : stop),
    });
  };

  const addStop = (offset = 0.5) => {
    if (paint.type === 'solid') return;
    const left = [...paint.stops].sort((a, b) => Math.abs(a.offset - offset) - Math.abs(b.offset - offset))[0];
    const stop = { id: newStopId(), offset, color: left?.color ?? '#ffffff' };
    setSelectedStopId(stop.id);
    update({ ...paint, stops: [...paint.stops, stop] });
  };

  const removeSelectedStop = () => {
    if (paint.type === 'solid' || paint.stops.length <= 2 || !selectedStop) return;
    const next = paint.stops.filter(stop => stop.id !== selectedStop.id);
    setSelectedStopId(next[0]?.id ?? null);
    update({ ...paint, stops: next });
  };

  const handleGradientBarClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (paint.type === 'solid') return;
    const rect = event.currentTarget.getBoundingClientRect();
    addStop((event.clientX - rect.left) / Math.max(1, rect.width));
  };

  const saveCurrent = () => {
    const name = typeof window !== 'undefined' ? window.prompt('Название градиента', 'Мой градиент') : null;
    if (!name) return;
    const next = saveGradientPreset(storage, presets, name, paint);
    setPresets(next);
  };

  const applyPreset = (preset: GradientPreset) => {
    onGestureStart?.();
    update(preset.style);
  };

  const renamePreset = (preset: GradientPreset) => {
    const name = typeof window !== 'undefined' ? window.prompt('Новое название', preset.name) : null;
    if (!name) return;
    setPresets(renameGradientPreset(storage, presets, preset.id, name));
  };

  const removePreset = (preset: GradientPreset) => {
    setPresets(deleteGradientPreset(storage, presets, preset.id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <PanelLabel>{label}</PanelLabel>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['solid', 'linear', ...(allowRadial ? ['radial'] : [])] as PaintStyle['type'][]).map(type => (
          <button
            key={type}
            type="button"
            aria-pressed={paint.type === type}
            onClick={() => setType(type)}
            style={{
              flex: 1, padding: '4px 3px', fontSize: 10, borderRadius: 4,
              border: paint.type === type ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
              background: paint.type === type ? 'var(--accent-dim)' : 'var(--bg-panel-raised)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {type === 'solid' ? 'Цвет' : type === 'linear' ? 'Линейный' : 'Радиальный'}
          </button>
        ))}
      </div>

      {paint.type === 'solid' ? (
        <input
          aria-label={`Цвет: ${label}`}
          type="color"
          value={paint.color.startsWith('#') ? paint.color.slice(0, 7) : '#ffffff'}
          onPointerDown={() => onGestureStart?.()}
          onChange={event => update({ type: 'solid', color: event.target.value })}
          style={{ width: 42, height: 26, padding: 0 }}
        />
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label="Добавить точку градиента"
            onClick={handleGradientBarClick}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') addStop(0.5); }}
            style={{
              position: 'relative', height: 38, borderRadius: 5,
              border: '1px solid var(--border-default)',
              background: paintToCss(paint, PREVIEW_BOUNDS),
              cursor: 'crosshair',
            }}
          >
            {paint.stops.map(stop => (
              <button
                key={stop.id}
                type="button"
                aria-label={`Точка градиента ${Math.round(stop.offset * 100)}%`}
                onClick={event => { event.stopPropagation(); setSelectedStopId(stop.id); }}
                style={{
                  position: 'absolute', left: `${stop.offset * 100}%`, top: '50%',
                  width: 15, height: 15, padding: 0, borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  border: selectedStop?.id === stop.id ? '2px solid #fff' : '1px solid #333',
                  background: stop.color, boxShadow: '0 0 0 1px rgba(0,0,0,.35)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
          {selectedStop && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                aria-label="Цвет выбранной точки"
                type="color"
                value={selectedStop.color.startsWith('#') ? selectedStop.color.slice(0, 7) : '#ffffff'}
                onPointerDown={() => onGestureStart?.()}
                onChange={event => updateStop(selectedStop.id, { color: event.target.value })}
                style={{ width: 34, height: 24, padding: 0 }}
              />
              <input
                aria-label="Позиция точки"
                type="range"
                min={0}
                max={100}
                value={Math.round(selectedStop.offset * 100)}
                onPointerDown={() => onGestureStart?.()}
                onChange={event => updateStop(selectedStop.id, { offset: Number(event.target.value) / 100 })}
                style={{ flex: 1 }}
              />
              <span style={{ width: 30, fontSize: 10, color: 'var(--text-muted)' }}>
                {Math.round(selectedStop.offset * 100)}%
              </span>
              <button
                type="button"
                aria-label="Удалить выбранную точку"
                disabled={paint.stops.length <= 2}
                onClick={removeSelectedStop}
                style={{ padding: '3px 6px', fontSize: 11 }}
              >
                ×
              </button>
            </div>
          )}
          {paint.type === 'linear' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
              Угол
              <input
                aria-label="Угол градиента"
                type="range"
                min={0}
                max={359}
                value={Math.round(paint.angle)}
                onPointerDown={() => onGestureStart?.()}
                onChange={event => update({ ...paint, angle: Number(event.target.value) })}
                style={{ flex: 1 }}
              />
              {Math.round(paint.angle)}°
            </label>
          )}
        </>
      )}

      {onGlowChange && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={currentGlow.enabled}
              onChange={event => {
                onGestureStart?.();
                onGlowChange({ ...currentGlow, enabled: event.target.checked });
              }}
            />
            Неон
          </label>
          {currentGlow.enabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                aria-label="Цвет неона"
                type="color"
                value={currentGlow.color.startsWith('#') ? currentGlow.color.slice(0, 7) : '#00e5ff'}
                onPointerDown={() => onGestureStart?.()}
                onChange={event => onGlowChange({ ...currentGlow, color: event.target.value })}
                style={{ width: 32, height: 22, padding: 0 }}
              />
              <input
                aria-label="Сила неона"
                type="range"
                min={0}
                max={120}
                value={currentGlow.blur}
                onPointerDown={() => onGestureStart?.()}
                onChange={event => onGlowChange({ ...currentGlow, blur: Number(event.target.value) })}
                style={{ flex: 1 }}
              />
            </div>
          )}
        </div>
      )}

      <PanelButton onClick={saveCurrent} fullWidth>Сохранить градиент</PanelButton>
      {presets.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {presets.map(preset => (
            <div key={preset.id} style={{ display: 'flex', gap: 2 }}>
              <button
                type="button"
                title={preset.name}
                onClick={() => applyPreset(preset)}
                style={{
                  width: 58, height: 22, borderRadius: 4, border: '1px solid var(--border-default)',
                  background: paintToCss(preset.style, PREVIEW_BOUNDS), cursor: 'pointer',
                }}
              />
              {!preset.builtIn && (
                <>
                  <button type="button" aria-label={`Переименовать ${preset.name}`} onClick={() => renamePreset(preset)}>✎</button>
                  <button type="button" aria-label={`Удалить ${preset.name}`} onClick={() => removePreset(preset)}>×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
