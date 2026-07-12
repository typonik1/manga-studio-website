'use client';

import { useRef } from 'react';
import { useStore } from '@/store/useStore';
import { uid } from '@/utils/imageUtils';
import type { ShapeKind, ShapeObject, WatermarkObject } from '@/types';
import { PanelRow, PanelSlider, PanelLabel, PanelSection, PanelButton } from './PanelComponents';

const SHAPES: { kind: ShapeKind; label: string; icon: React.ReactNode }[] = [
  {
    kind: 'rect', label: 'Прямоугольник',
    icon: <svg width="18" height="18" viewBox="0 0 18 18"><rect x="2.5" y="4.5" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg>,
  },
  {
    kind: 'ellipse', label: 'Эллипс',
    icon: <svg width="18" height="18" viewBox="0 0 18 18"><ellipse cx="9" cy="9" rx="6.5" ry="4.5" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg>,
  },
  {
    kind: 'line', label: 'Линия',
    icon: <svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 15L15 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  },
  {
    kind: 'arrow', label: 'Стрелка',
    icon: <svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 15L14 4M14 4H8M14 4v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>,
  },
  {
    kind: 'star', label: 'Звезда',
    icon: <svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 2l2 4.5 4.8.4-3.6 3.2 1.1 4.7L9 12.3l-4.3 2.5 1.1-4.7L2.2 6.9 7 6.5 9 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" /></svg>,
  },
];

export function InsertPanel() {
  const {
    activeDocIndex, documents,
    addWatermark, addShape,
    shapeSettings, updateShapeSettings,
    setSelectedObject,
  } = useStore();
  const overlayInputRef = useRef<HTMLInputElement>(null);

  const hasDoc = activeDocIndex >= 0;
  const activeDoc = hasDoc ? documents[activeDocIndex] : null;

  function handleOverlayFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeDoc) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataURL = ev.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const wm: WatermarkObject = {
          id: uid(),
          type: 'image',
          imageSrc: dataURL,
          imageWidth: 0.45,
          imageHeight: (0.45 * activeDoc.width * (img.naturalHeight / img.naturalWidth)) / activeDoc.height,
          x: 0.28,
          y: 0.28,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
          visible: true,
          isBatch: false,
        };
        addWatermark(wm);
        setSelectedObject({ id: wm.id, type: 'watermark' });
      };
      img.src = dataURL;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleAddShape(kind: ShapeKind) {
    if (!activeDoc) return;
    const shape: ShapeObject = {
      id: uid(),
      kind,
      x: 0.5,
      y: 0.5,
      width: kind === 'line' || kind === 'arrow' ? 0.3 : 0.25,
      height: kind === 'line' ? 0.001 : kind === 'arrow' ? 0.001 : 0.2,
      fill: kind === 'line' || kind === 'arrow' ? '' : shapeSettings.fill,
      stroke: shapeSettings.stroke,
      strokeWidth: shapeSettings.strokeWidth,
      opacity: shapeSettings.opacity,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      cornerRadius: shapeSettings.cornerRadius,
      visible: true,
    };
    addShape(shape);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="section-label">Вставка</div>

      {/* Overlay image */}
      <PanelSection title="Картинка поверх">
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Вставьте изображение с компьютера поверх текущего — его можно двигать, масштабировать и вращать.
        </div>
        <PanelButton variant="primary" fullWidth onClick={() => overlayInputRef.current?.click()} disabled={!hasDoc}>
          + Вставить картинку
        </PanelButton>
        <input
          ref={overlayInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={handleOverlayFile}
        />
      </PanelSection>

      <div className="divider" />

      {/* Shapes */}
      <PanelSection title="Фигуры">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
          {SHAPES.map(s => (
            <button
              key={s.kind}
              onClick={() => handleAddShape(s.kind)}
              disabled={!hasDoc}
              title={s.label}
              style={{
                aspectRatio: '1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-panel-raised)',
                color: hasDoc ? 'var(--text-secondary)' : 'var(--text-muted)',
                cursor: hasDoc ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={e => { if (hasDoc) { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; } }}
              onMouseLeave={e => { e.currentTarget.style.color = hasDoc ? 'var(--text-secondary)' : 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
            >
              {s.icon}
            </button>
          ))}
        </div>

        <PanelRow label="Заливка">
          <input
            type="color"
            value={shapeSettings.fill || '#ffffff'}
            onChange={e => updateShapeSettings({ fill: e.target.value })}
            style={{ width: 36, height: 28 }}
          />
          <button
            onClick={() => updateShapeSettings({ fill: shapeSettings.fill ? '' : '#ffffff' })}
            title={shapeSettings.fill ? 'Убрать заливку' : 'Включить заливку'}
            style={{
              padding: '3px 6px', fontSize: 10, borderRadius: 4,
              border: '1px solid var(--border-default)',
              background: 'var(--bg-panel-raised)',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            {shapeSettings.fill ? 'выкл' : 'вкл'}
          </button>
        </PanelRow>

        <PanelRow label="Обводка">
          <input
            type="color"
            value={shapeSettings.stroke || '#000000'}
            onChange={e => updateShapeSettings({ stroke: e.target.value })}
            style={{ width: 36, height: 28 }}
          />
          <input
            type="number"
            value={shapeSettings.strokeWidth}
            min={0}
            max={60}
            onChange={e => updateShapeSettings({ strokeWidth: Number(e.target.value) })}
            style={{ width: 44 }}
          />
        </PanelRow>

        <PanelSlider
          label={`Непрозрачность ${Math.round(shapeSettings.opacity * 100)}%`}
          value={Math.round(shapeSettings.opacity * 100)}
          min={5}
          max={100}
          onChange={v => updateShapeSettings({ opacity: v / 100 })}
        />

        <PanelSlider
          label={`Скругление углов ${shapeSettings.cornerRadius}px`}
          value={shapeSettings.cornerRadius}
          min={0}
          max={120}
          onChange={v => updateShapeSettings({ cornerRadius: v })}
        />

        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Настройки применяются к новым фигурам. Выделенную фигуру можно двигать, масштабировать и вращать; Delete — удалить.
        </div>
      </PanelSection>
    </div>
  );
}
