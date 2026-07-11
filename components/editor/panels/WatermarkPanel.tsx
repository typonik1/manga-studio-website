'use client';

import { useRef } from 'react';
import { useStore } from '@/store/useStore';
import { uid } from '@/utils/imageUtils';
import type { WatermarkObject } from '@/types';
import { MANGA_FONTS } from '@/types';
import { PanelRow, PanelSlider, PanelLabel } from './PanelComponents';

export function WatermarkPanel() {
  const { wmSettings, updateWmSettings, addWatermark, batchApplyWatermark, activeDocIndex, documents } = useStore();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const hasDoc = activeDocIndex >= 0;

  function handleAddWatermark() {
    if (!hasDoc) return;
    const wm: WatermarkObject = {
      id: uid(),
      type: wmSettings.type,
      text: wmSettings.text,
      fontFamily: wmSettings.fontFamily,
      fontSize: wmSettings.fontSize,
      fill: wmSettings.fill,
      imageSrc: wmSettings.imageSrc ?? undefined,
      imageWidth: wmSettings.imageWidth,
      imageHeight: wmSettings.imageHeight,
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: wmSettings.rotation,
      opacity: wmSettings.opacity,
      visible: true,
      isBatch: false,
    };
    addWatermark(wm);
  }

  function handleLogoLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const ratio = img.height / img.width;
        updateWmSettings({ imageSrc: src, type: 'image', imageWidth: 0.25, imageHeight: 0.25 * ratio });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="section-label">Вотерка</div>

      {/* Type switcher */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['text', 'image'] as const).map(t => (
          <button
            key={t}
            onClick={() => updateWmSettings({ type: t })}
            style={{
              flex: 1,
              padding: '5px 8px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid var(--border-default)',
              background: wmSettings.type === t ? 'var(--accent-dim)' : 'var(--bg-panel-raised)',
              color: wmSettings.type === t ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: wmSettings.type === t ? 600 : 400,
            }}
          >
            {t === 'text' ? 'Текст' : 'Лого'}
          </button>
        ))}
      </div>

      {wmSettings.type === 'text' ? (
        <>
          <PanelLabel>Текст вотерки</PanelLabel>
          <input
            type="text"
            value={wmSettings.text}
            onChange={e => updateWmSettings({ text: e.target.value })}
            placeholder="© Ваш текст"
          />
          <PanelLabel>Шрифт</PanelLabel>
          <select value={wmSettings.fontFamily} onChange={e => updateWmSettings({ fontFamily: e.target.value })}>
            {MANGA_FONTS.map(f => (
              <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
            ))}
          </select>
          <PanelRow label="Цвет">
            <input
              type="color"
              value={wmSettings.fill.startsWith('rgba') ? '#ffffff' : wmSettings.fill}
              onChange={e => updateWmSettings({ fill: e.target.value })}
              style={{ width: 36, height: 28 }}
            />
          </PanelRow>
          <PanelSlider
            label="Размер"
            value={Math.round(wmSettings.fontSize * 1000)}
            min={10}
            max={200}
            onChange={v => updateWmSettings({ fontSize: v / 1000 })}
          />
        </>
      ) : (
        <>
          <button
            onClick={() => logoInputRef.current?.click()}
            style={{
              padding: '7px 10px',
              borderRadius: 6,
              border: '1px dashed var(--border-default)',
              background: 'var(--bg-panel-raised)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {wmSettings.imageSrc ? 'Заменить PNG-лого' : 'Загрузить PNG-лого'}
          </button>
          <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoLoad} style={{ display: 'none' }} />
          {wmSettings.imageSrc && (
            <img
              src={wmSettings.imageSrc}
              alt="Logo preview"
              style={{ maxHeight: 48, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border-subtle)' }}
            />
          )}
        </>
      )}

      <div className="divider" />

      <PanelSlider
        label={`Прозрачность ${Math.round(wmSettings.opacity * 100)}%`}
        value={Math.round(wmSettings.opacity * 100)}
        min={5}
        max={100}
        onChange={v => updateWmSettings({ opacity: v / 100 })}
      />
      <PanelSlider
        label={`Наклон ${Math.round(wmSettings.rotation)}°`}
        value={Math.round(wmSettings.rotation)}
        min={-180}
        max={180}
        onChange={v => updateWmSettings({ rotation: v })}
      />

      <div className="divider" />

      <button
        onClick={handleAddWatermark}
        disabled={!hasDoc}
        style={{
          padding: '7px 10px',
          borderRadius: 6,
          border: '1px solid var(--accent)',
          background: 'transparent',
          color: hasDoc ? 'var(--accent)' : 'var(--text-muted)',
          cursor: hasDoc ? 'pointer' : 'not-allowed',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        + Добавить на текущее
      </button>

      <div className="section-label" style={{ marginTop: 4 }}>Пакетное применение</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(['fixed', 'random', 'scattered'] as const).map(m => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
            <input
              type="radio"
              name="batchMode"
              checked={wmSettings.batchMode === m}
              onChange={() => updateWmSettings({ batchMode: m })}
              style={{ accentColor: 'var(--accent)' }}
            />
            {m === 'fixed' ? 'Одинаковое место' : m === 'random' ? 'Случайное место' : 'С разбросом'}
          </label>
        ))}
      </div>

      {wmSettings.batchMode === 'scattered' && (
        <>
          <PanelSlider
            label={`Разброс ${wmSettings.scatterOffsetPct}%`}
            value={wmSettings.scatterOffsetPct}
            min={0}
            max={40}
            onChange={v => updateWmSettings({ scatterOffsetPct: v })}
          />
          <PanelSlider
            label={`Наклон ±${wmSettings.scatterTiltDeg}°`}
            value={wmSettings.scatterTiltDeg}
            min={0}
            max={90}
            onChange={v => updateWmSettings({ scatterTiltDeg: v })}
          />
        </>
      )}

      <button
        onClick={batchApplyWatermark}
        disabled={documents.length === 0}
        style={{
          padding: '7px 10px',
          borderRadius: 6,
          border: 'none',
          background: documents.length > 0 ? 'var(--accent)' : 'var(--bg-active)',
          color: documents.length > 0 ? '#fff' : 'var(--text-muted)',
          cursor: documents.length > 0 ? 'pointer' : 'not-allowed',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Применить ко всем ({documents.length})
      </button>
    </div>
  );
}
