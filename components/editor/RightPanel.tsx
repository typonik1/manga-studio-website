'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import type { ImageDocument, LayerVisibility, BaseLayerAdjustments } from '@/types';
import { LayerContextMenu } from './LayerContextMenu';
import { resolveLayerOrder } from '@/utils/layerOrder';
import { createDrawingLayer } from '@/utils/layerActions';

export function RightPanel() {
  const { rightTab: tab, setRightTab: setTab } = useStore();

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
const { layerVisibility, toggleLayerVisibility, activeDocIndex, documents, selectedObject, setSelectedObject, setActiveTool, setLeftTab, selectLayer, updateMask, deleteMask, updateAiLayer, deleteAiLayer, duplicateAiLayer, deleteWatermark, deleteText, deleteShape, reorderLayer } = useStore();
const activeDoc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;
const [aiMenu, setAiMenu] = useState<{ x: number; y: number; id: string } | null>(null);
const [dragIndex, setDragIndex] = useState<number | null>(null);
const [dropIndex, setDropIndex] = useState<number | null>(null);
// Ref mirrors dragIndex so drop handlers read the current value even before re-render.
const dragIndexRef = useRef<number | null>(null);

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

      {/* Unified raster stack: top layer first, drag to reorder */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 2px 6px' }}>
        <div className="section-label" style={{ padding: 0 }}>Растровые слои</div>
        <button
          type="button"
          onClick={() => { createDrawingLayer(); setActiveTool('brush'); }}
          title="Создать пустой слой для рисования поверх"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
            border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)',
          }}
        >
          + Новый слой
        </button>
      </div>
      {[...resolveLayerOrder(activeDoc)]
        .map((ref, orderIndex) => ({ ref, orderIndex }))
        .filter(({ ref }) => ref.type === 'base' || ref.type === 'ai')
        .reverse()
        .map(({ ref, orderIndex }) => {
          const isDropTarget = dropIndex === orderIndex && dragIndex !== null && dragIndex !== orderIndex;
          const wrapperProps = {
            draggable: true,
            onDragStart: (e: React.DragEvent) => {
              // The expanded settings area (sliders, labels, buttons) must never
              // start a row drag — otherwise moving a slider tears off a ghost
              // of the whole panel. Row reorder starts only from the header.
              if ((e.target as HTMLElement).closest('input, button, select, textarea, [data-nodrag]')) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              dragIndexRef.current = orderIndex; setDragIndex(orderIndex); e.dataTransfer.effectAllowed = 'move';
            },
            onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropIndex(orderIndex); },
            onDragLeave: () => setDropIndex(current => (current === orderIndex ? null : current)),
            onDrop: (e: React.DragEvent) => {
              e.preventDefault();
              const from = dragIndexRef.current;
              if (from !== null && from !== orderIndex) reorderLayer(from, orderIndex);
              dragIndexRef.current = null; setDragIndex(null); setDropIndex(null);
            },
            onDragEnd: () => { dragIndexRef.current = null; setDragIndex(null); setDropIndex(null); },
            style: {
              opacity: dragIndex === orderIndex ? 0.45 : 1,
              outline: isDropTarget ? '2px solid var(--accent)' : 'none',
              outlineOffset: -1,
              borderRadius: 6,
              cursor: 'grab',
            } as React.CSSProperties,
          };
          if (ref.type === 'base') {
            return (
              <div key="base-row" {...wrapperProps}>
                <BaseLayerRow activeDoc={activeDoc} />
              </div>
            );
          }
          const layer = (activeDoc.aiLayers ?? []).find(item => item.id === ref.id);
          if (!layer) return null;
          return (
            <div key={layer.id} {...wrapperProps}>
              <LayerRow
                label={layer.name}
                prefix="AI"
                selected={activeDoc.selectedLayer?.id === layer.id}
                visible={layer.visible}
                opacity={layer.opacity}
                onSelect={() => selectLayer({ id: layer.id, type: 'ai' })}
                onVisibility={() => updateAiLayer(layer.id, { visible: !layer.visible })}
                onOpacity={opacity => updateAiLayer(layer.id, { opacity })}
                onDelete={() => deleteAiLayer(layer.id)}
                onContextMenu={e => { e.preventDefault(); setAiMenu({ x: e.clientX, y: e.clientY, id: layer.id }); }}
                locked={layer.locked === true}
                onLock={() => updateAiLayer(layer.id, { locked: layer.locked !== true })}
                adjustments={layer.adjustments}
                onAdjustments={updates => updateAiLayer(layer.id, { adjustments: { brightness: 1, contrast: 1, saturation: 1, ...layer.adjustments, ...updates } })}
                onDuplicate={() => duplicateAiLayer(layer.id)}
              />
            </div>
          );
        })}

      {(activeDoc.masks?.length ?? 0) > 0 && (
        <>
          <div className="section-label" style={{ padding: '12px 2px 6px' }}>Маски</div>
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
              label={wm.type === 'text' ? (wm.text?.slice(0, 18) ?? 'Вотерка') : '��ого'}
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

      {aiMenu && <LayerContextMenu menu={{ x: aiMenu.x, y: aiMenu.y, target: { id: aiMenu.id, type: 'ai' } }} onClose={() => setAiMenu(null)} />}
    </div>
  );
}

function BaseLayerRow({ activeDoc }: { activeDoc: ImageDocument }) {
  const { selectLayer, updateBaseLayer, duplicateBaseLayer, clearEraseElements } = useStore();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const base = activeDoc.baseLayer;
  const baseId = base?.id ?? `base-${activeDoc.id}`;
  const selected = activeDoc.selectedLayer?.type === 'base';
  const visible = base?.visible !== false;
  const locked = base?.locked !== false;
  const adjustments = base?.adjustments ?? { brightness: 1, contrast: 1, saturation: 1 };
  const eraseCount = base?.eraseElements.length ?? 0;

  return (
    <>
      <div
        onClick={() => selectLayer({ id: baseId, type: 'base' })}
        onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
        style={{
          padding: 6, borderRadius: 6, cursor: 'pointer',
          background: selected ? 'var(--accent-dim)' : 'var(--bg-panel-raised)',
          border: selected ? '1px solid var(--accent)' : '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <img src={activeDoc.thumbnail || activeDoc.originalSrc} alt="Миниатюра оригинала" width={30} height={30} style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 4 }} />
          <span title={`Оригинал — ${activeDoc.name}`} style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {`Оригинал — ${activeDoc.name}`}
            {eraseCount > 0 && <span title={`Стёрто областей: ${eraseCount}`} style={{ marginLeft: 4, fontSize: 9, color: 'var(--accent)' }}>{`✂${eraseCount}`}</span>}
          </span>
          <button type="button" aria-label={visible ? 'Скрыть оригинал' : 'Показать оригинал'} onClick={e => { e.stopPropagation(); updateBaseLayer({ visible: !visible }); }} style={{ border: 0, background: 'none', color: visible ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>{visible ? '◉' : '○'}</button>
          <button
            type="button"
            aria-label={locked ? 'Разблокировать слой' : 'Заблокировать слой'}
            title={locked ? 'Слой заблокирован — нажмите, чтобы разблокировать (иначе его нельзя двигать)' : 'Слой разблокирован — можно двигать и масштабировать'}
            onClick={e => { e.stopPropagation(); updateBaseLayer({ locked: !locked }); }}
            style={{ border: 0, background: 'none', color: locked ? 'var(--warning, #e5a50a)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <LockIcon locked={locked} />
          </button>
        </div>
        {selected && (
          <div data-nodrag draggable={false} style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 6, cursor: 'default' }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
            {([
              { key: 'opacity', label: 'Прозрачность', value: base?.opacity ?? 1, min: 0, max: 100, apply: (v: number) => updateBaseLayer({ opacity: v / 100 }) },
              { key: 'brightness', label: 'Яркость', value: adjustments.brightness, min: 20, max: 180, apply: (v: number) => updateBaseLayer({ adjustments: { ...adjustments, brightness: v / 100 } }) },
              { key: 'contrast', label: 'Контраст', value: adjustments.contrast, min: 20, max: 180, apply: (v: number) => updateBaseLayer({ adjustments: { ...adjustments, contrast: v / 100 } }) },
              { key: 'saturation', label: 'Насыщенность', value: adjustments.saturation, min: 0, max: 200, apply: (v: number) => updateBaseLayer({ adjustments: { ...adjustments, saturation: v / 100 } }) },
            ] as const).map(slider => (
              <div key={slider.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 78 }}>{slider.label}</span>
                <input aria-label={slider.label} type="range" min={slider.min} max={slider.max} value={Math.round(slider.value * 100)} onChange={e => slider.apply(Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 30 }}>{Math.round(slider.value * 100)}%</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 5, paddingTop: 2 }}>
              <button type="button" onClick={() => duplicateBaseLayer()} style={{ flex: 1, padding: '4px 6px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border-default)', background: 'var(--bg-panel-raised)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Дублировать</button>
              {eraseCount > 0 && (
                <button type="button" onClick={() => clearEraseElements({ type: 'base' })} style={{ flex: 1, padding: '4px 6px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border-default)', background: 'var(--bg-panel-raised)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Восстановить стёртое</button>
              )}
            </div>
          </div>
        )}
      </div>
      {menu && <LayerContextMenu menu={{ x: menu.x, y: menu.y, target: { id: baseId, type: 'base' } }} onClose={() => setMenu(null)} />}
    </>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      {locked
        ? <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        : <path d="M8 11V7a4 4 0 0 1 7.5-1.8" />}
    </svg>
  );
}

function LayerRow({ label, prefix, selected, visible, opacity, onSelect, onVisibility, onOpacity, onDelete, onContextMenu, locked, onLock, adjustments, onAdjustments, onDuplicate }: {
  label: string; prefix: string; selected: boolean; visible: boolean; opacity: number;
  onSelect: () => void; onVisibility: () => void; onOpacity: (value: number) => void; onDelete: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  locked?: boolean; onLock?: () => void;
  adjustments?: BaseLayerAdjustments; onAdjustments?: (updates: Partial<BaseLayerAdjustments>) => void;
  onDuplicate?: () => void;
}) {
  const adj = adjustments ?? { brightness: 1, contrast: 1, saturation: 1 };
  return (
    <div onClick={onSelect} onContextMenu={onContextMenu} style={{ padding: 6, borderRadius: 6, marginBottom: 3, background: selected ? 'var(--accent-dim)' : 'var(--bg-panel-raised)', border: selected ? '1px solid var(--accent)' : '1px solid transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 22, fontSize: 9, fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text-muted)' }}>{prefix}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <button type="button" aria-label={visible ? 'Скрыть слой' : 'Показать слой'} onClick={event => { event.stopPropagation(); onVisibility(); }} style={{ border: 0, background: 'none', color: visible ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>{visible ? '◉' : '○'}</button>
        {onLock && (
          <button
            type="button"
            aria-label={locked ? 'Разблокировать слой' : 'Заблокировать слой'}
            title={locked ? 'Слой заблокирован — нажмите, чтобы разблокировать (иначе его нельзя двигать)' : 'Слой разблокирован — можно двигать и масштабировать'}
            onClick={event => { event.stopPropagation(); onLock(); }}
            style={{ border: 0, background: 'none', color: locked ? 'var(--warning, #e5a50a)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <LockIcon locked={Boolean(locked)} />
          </button>
        )}
        <button type="button" aria-label="Удалить слой" onClick={event => { event.stopPropagation(); onDelete(); }} style={{ border: 0, background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
      </div>
      {selected && (
        <div data-nodrag draggable={false} style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 5, cursor: 'default' }} onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}>
          {([
            { key: 'opacity', label: 'Прозрачность', value: opacity, min: 0, max: 100, apply: (v: number) => onOpacity(v / 100) },
            ...(onAdjustments ? [
              { key: 'brightness', label: 'Яркость', value: adj.brightness, min: 20, max: 180, apply: (v: number) => onAdjustments({ brightness: v / 100 }) },
              { key: 'contrast', label: 'Контраст', value: adj.contrast, min: 20, max: 180, apply: (v: number) => onAdjustments({ contrast: v / 100 }) },
              { key: 'saturation', label: 'Насыщенность', value: adj.saturation, min: 0, max: 200, apply: (v: number) => onAdjustments({ saturation: v / 100 }) },
            ] : []),
          ]).map(slider => (
            <div key={slider.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 78 }}>{slider.label}</span>
              <input aria-label={slider.label} type="range" min={slider.min} max={slider.max} value={Math.round(slider.value * 100)} onChange={event => slider.apply(Number(event.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 30 }}>{Math.round(slider.value * 100)}%</span>
            </div>
          ))}
          {onDuplicate && (
            <button type="button" onClick={onDuplicate} style={{ padding: '4px 6px', fontSize: 10, borderRadius: 5, border: '1px solid var(--border-default)', background: 'var(--bg-panel-raised)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Дублировать</button>
          )}
        </div>
      )}
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
