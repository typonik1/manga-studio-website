'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import type { LayerVisibility } from '@/types';

type RightTab = 'layers' | 'gallery';

export function RightPanel() {
  const [tab, setTab] = useState<RightTab>('gallery');

  return (
    <aside
      className="editor-sidebar-right"
      aria-label="Страницы и слои"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-default)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Tab bar */}
      <div role="tablist" aria-label="Правая панель" style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid var(--border-default)' }}>
        {(['gallery', 'layers'] as const).map(t => (
          <button key={t} role="tab" className="ui-tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{ flex: 1 }}>
            {t === 'gallery' ? 'Страницы' : 'Слои'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'gallery' ? <GalleryPanel /> : <LayersPanel />}
      </div>
    </aside>
  );
}

function GalleryPanel() {
  const { documents, activeDocIndex, setActiveDoc, removeDocument } = useStore();

  if (documents.length === 0) {
    return (
      <div className="editor-empty" style={{ flex: 1 }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" opacity="0.45" aria-hidden="true">
          <rect x="4" y="4" width="10" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="18" y="4" width="10" height="8" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="18" y="16" width="10" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
          <rect x="4" y="20" width="10" height="8" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
        </svg>
        <strong>Страниц пока нет</strong>
        <span style={{ fontSize: 11, lineHeight: 1.5 }}>Загруженные изображения появятся здесь для быстрого переключения.</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {documents.map((doc, i) => (
        <div
          key={doc.id}
          onClick={() => setActiveDoc(i)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 6px',
            borderRadius: 7,
            cursor: 'pointer',
            background: i === activeDocIndex ? 'var(--accent-dim)' : 'transparent',
            border: i === activeDocIndex ? '1px solid rgba(94,159,232,0.3)' : '1px solid transparent',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => {
            if (i !== activeDocIndex) e.currentTarget.style.background = 'var(--bg-hover)';
          }}
          onMouseLeave={e => {
            if (i !== activeDocIndex) e.currentTarget.style.background = 'transparent';
          }}
        >
          {/* Thumbnail */}
          <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 4, overflow: 'hidden', background: '#111' }}>
            <img
              src={doc.thumbnail}
              alt={doc.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          {/* Info */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{
              fontSize: 11, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {doc.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {doc.width}×{doc.height}
              {doc.hasChanges && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>●</span>}
            </div>
          </div>
          {/* Remove */}
          <button
            onClick={e => {
              e.stopPropagation();
              removeDocument(doc.id);
            }}
            title="Удалить из списка"
            style={{
              width: 20, height: 20, borderRadius: 4,
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 14,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(232,94,94,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function LayersPanel() {
const { layerVisibility, toggleLayerVisibility, activeDocIndex, documents, selectedObject, setSelectedObject, setActiveTool, setLeftTab, selectLayer, updateMask, deleteMask, updateAiLayer, deleteAiLayer, deleteWatermark, deleteText, deleteShape } = useStore();
const activeDoc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;

const LAYERS: { key: keyof LayerVisibility; label: string; icon: string }[] = [
{ key: 'cleanup', label: 'Очистка', icon: '✦' },
{ key: 'watermarks', label: 'Вотерки', icon: 'W' },
{ key: 'texts', label: 'Тексты', icon: 'T' },
{ key: 'shapes', label: 'Фигуры', icon: 'S' },
];

  if (!activeDoc) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Нет активного изображения</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
      {/* Layer visibility toggles */}
      <div className="section-label" style={{ padding: '0 2px 6px' }}>Видимость слоёв</div>
      {LAYERS.map(layer => (
        <div
          key={layer.key}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 6px', borderRadius: 6, marginBottom: 2,
            background: 'var(--bg-panel-raised)',
          }}
        >
          <span style={{ width: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            {layer.icon}
          </span>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{layer.label}</span>
          <button
            onClick={() => toggleLayerVisibility(layer.key)}
            title={layerVisibility[layer.key] ? 'Скрыть' : 'Показать'}
            style={{
              width: 24, height: 24, borderRadius: 4,
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: layerVisibility[layer.key] ? 'var(--accent)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {layerVisibility[layer.key] ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 3C4 3 1.5 7 1.5 7s2.5 4 5.5 4 5.5-4 5.5-4-2.5-4-5.5-4z" stroke="currentColor" strokeWidth="1.2" fill="none" />
                <circle cx="7" cy="7" r="1.5" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M5.5 4.5C6 4.2 6.5 4 7 4c3 0 5.5 3 5.5 3s-.8 1.3-2 2.3M4 5.7C2.7 6.7 1.5 8 1.5 8s2.5 3 5.5 3c.5 0 1-.1 1.5-.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      ))}

      {((activeDoc.aiLayers?.length ?? 0) > 0 || (activeDoc.masks?.length ?? 0) > 0) && (
        <>
          <div className="section-label" style={{ padding: '12px 2px 6px' }}>Маски и AI-результаты</div>
          {[...(activeDoc.aiLayers ?? [])].reverse().map(layer => (
            <LayerRow
              key={layer.id}
              label={layer.name}
              prefix="AI"
              selected={activeDoc.selectedLayer?.id === layer.id}
              visible={layer.visible}
              opacity={layer.opacity}
              onSelect={() => selectLayer({ id: layer.id, type: 'ai' })}
              onVisibility={() => updateAiLayer(layer.id, { visible: !layer.visible })}
              onOpacity={opacity => updateAiLayer(layer.id, { opacity })}
              onDelete={() => deleteAiLayer(layer.id)}
            />
          ))}
          {[...(activeDoc.masks ?? [])].reverse().map(mask => (
            <LayerRow
              key={mask.id}
              label={mask.name}
              prefix="M"
              selected={activeDoc.selectedLayer?.id === mask.id}
              visible={mask.visible}
              opacity={mask.opacity}
              onSelect={() => { selectLayer({ id: mask.id, type: 'mask' }); setActiveTool('maskBrush'); setLeftTab('cleanup'); }}
              onVisibility={() => updateMask(mask.id, { visible: !mask.visible })}
              onOpacity={opacity => updateMask(mask.id, { opacity })}
              onDelete={() => deleteMask(mask.id)}
            />
          ))}
        </>
      )}

      {/* Objects */}
      {(activeDoc.watermarks.length > 0 || activeDoc.texts.length > 0 || (activeDoc.shapes ?? []).length > 0) && (
        <>
          <div className="section-label" style={{ padding: '12px 2px 6px' }}>Объекты</div>

          {activeDoc.watermarks.map(wm => (
            <ObjectRow
              key={wm.id}
              label={wm.type === 'text' ? (wm.text?.slice(0, 18) ?? 'Вотерка') : 'Лого'}
              prefix="W"
              isSelected={selectedObject?.id === wm.id}
              visible={wm.visible}
              onSelect={() => setSelectedObject({ id: wm.id, type: 'watermark' })}
              onDelete={() => deleteWatermark(wm.id)}
              isBatch={wm.isBatch}
            />
          ))}

          {activeDoc.texts.map(txt => (
            <ObjectRow
              key={txt.id}
              label={txt.text.slice(0, 18)}
              prefix="T"
              isSelected={selectedObject?.id === txt.id}
              visible={txt.visible}
              onSelect={() => setSelectedObject({ id: txt.id, type: 'text' })}
              onDelete={() => deleteText(txt.id)}
            />
          ))}

          {(activeDoc.shapes ?? []).map(shape => (
            <ObjectRow
              key={shape.id}
              label={
                shape.kind === 'rect' ? 'Прямоугольник' :
                shape.kind === 'ellipse' ? 'Эллипс' :
                shape.kind === 'line' ? 'Линия' :
                shape.kind === 'arrow' ? 'Стрелка' : 'Звезда'
              }
              prefix="S"
              isSelected={selectedObject?.id === shape.id}
              visible={shape.visible}
              onSelect={() => setSelectedObject({ id: shape.id, type: 'shape' })}
              onDelete={() => deleteShape(shape.id)}
            />
          ))}
        </>
      )}

      <div className="section-label" style={{ padding: '12px 2px 6px' }}>Исходник</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 6, borderRadius: 6, background: 'var(--bg-panel-raised)', border: '1px solid var(--border-default)' }}>
        <img src={activeDoc.thumbnail || activeDoc.originalSrc} alt="Миниатюра оригинала" width={30} height={30} style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 4 }} />
        <span title={`Оригинал — ${activeDoc.name}`} style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`Оригинал — ${activeDoc.name}`}</span>
        <button type="button" aria-label={layerVisibility.base ? 'Скрыть оригинал' : 'Показать оригинал'} onClick={() => toggleLayerVisibility('base')} style={{ border: 0, background: 'none', color: layerVisibility.base ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>{layerVisibility.base ? '◉' : '○'}</button>
        <span aria-label="Слой заблокирован" title="Слой заблокирован" style={{ color: 'var(--text-muted)', fontSize: 13 }}>▣</span>
      </div>
    </div>
  );
}

function LayerRow({ label, prefix, selected, visible, opacity, onSelect, onVisibility, onOpacity, onDelete }: {
  label: string; prefix: string; selected: boolean; visible: boolean; opacity: number;
  onSelect: () => void; onVisibility: () => void; onOpacity: (value: number) => void; onDelete: () => void;
}) {
  return (
    <div onClick={onSelect} style={{ padding: 6, borderRadius: 6, marginBottom: 3, background: selected ? 'var(--accent-dim)' : 'var(--bg-panel-raised)', border: selected ? '1px solid var(--accent)' : '1px solid transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 22, fontSize: 9, fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text-muted)' }}>{prefix}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <button type="button" aria-label={visible ? 'Скрыть слой' : 'Показать слой'} onClick={event => { event.stopPropagation(); onVisibility(); }} style={{ border: 0, background: 'none', color: visible ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>{visible ? '◉' : '○'}</button>
        <button type="button" aria-label="Удалить слой" onClick={event => { event.stopPropagation(); onDelete(); }} style={{ border: 0, background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
      </div>
      {selected && <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 5 }}><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Прозрачность</span><input aria-label="Прозрачность слоя" type="range" min={0} max={100} value={Math.round(opacity * 100)} onClick={event => event.stopPropagation()} onChange={event => onOpacity(Number(event.target.value) / 100)} style={{ flex: 1 }} /><span style={{ fontSize: 10, color: 'var(--text-muted)', width: 28 }}>{Math.round(opacity * 100)}%</span></div>}
    </div>
  );
}

function ObjectRow({
  label, prefix, isSelected, visible, onSelect, onDelete, isBatch,
}: {
  label: string;
  prefix: string;
  isSelected: boolean;
  visible: boolean;
  onSelect: () => void;
  onDelete: () => void;
  isBatch?: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 6px', borderRadius: 6, marginBottom: 2,
        cursor: 'pointer',
        background: isSelected ? 'var(--accent-dim)' : 'transparent',
        border: isSelected ? '1px solid rgba(94,159,232,0.25)' : '1px solid transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: 3,
        background: isSelected ? 'var(--accent)' : 'var(--bg-active)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, color: isSelected ? '#fff' : 'var(--text-muted)',
        flexShrink: 0,
      }}>
        {prefix}
      </span>
      <span style={{
        flex: 1, fontSize: 11, color: visible ? 'var(--text-secondary)' : 'var(--text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
        {isBatch && <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>batch</span>}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 13, padding: '0 2px',
          lineHeight: 1,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        ×
      </button>
    </div>
  );
}
