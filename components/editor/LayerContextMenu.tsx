'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { deleteMaskedPixels, hasActiveSelection, removeBackgroundFromLayer } from '@/utils/layerActions';
import { localRectToDocRect } from '@/utils/coordinates';
import type { LayerReference } from '@/types';

export interface ContextMenuState {
  x: number;
  y: number;
  target: { id: string; type: 'base' | 'ai' };
}

export function LayerContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const {
    documents, activeDocIndex,
    duplicateAiLayer, duplicateBaseLayer, deleteAiLayer, updateAiLayer, updateBaseLayer, clearEraseElements,
    selectLayer, setRightTab, resetBaseLayerSettings,
    moveLayerForward, moveLayerBackward, moveLayerToTop, moveLayerToBottom,
    setLayerCropTarget, setCropRect, setActiveTool, pushHistory,
  } = useStore();
  const doc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (!doc) return null;

  const isBase = menu.target.type === 'base';
  const aiLayer = isBase ? null : doc.aiLayers.find(layer => layer.id === menu.target.id);
  if (!isBase && !aiLayer) return null;

  const layerRef: LayerReference = isBase ? { type: 'base', id: menu.target.id } : { type: 'ai', id: menu.target.id };
  const visible = isBase ? doc.baseLayer?.visible !== false : aiLayer!.visible;
  const locked = isBase ? doc.baseLayer?.locked !== false : aiLayer!.locked === true;
  const opacity = isBase ? (doc.baseLayer?.opacity ?? 1) : aiLayer!.opacity;
  const crop = isBase ? doc.baseLayer?.crop : aiLayer!.crop;
  const eraseCount = isBase ? (doc.baseLayer?.eraseElements.length ?? 0) : (aiLayer!.eraseElements?.length ?? 0);
  const selectionActive = hasActiveSelection(doc);

  const run = async (key: string, action: () => Promise<void> | void, keepOpen = false) => {
    setBusy(key);
    try {
      await action();
      if (!keepOpen) onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    } finally {
      setBusy(null);
    }
  };

  type MenuItem =
    | { kind: 'item'; key: string; label: string; disabled?: boolean; danger?: boolean; onClick: () => void }
    | { kind: 'separator'; key: string }
    | { kind: 'opacity'; key: string };

  const items: MenuItem[] = [
    {
      kind: 'item',
      key: 'settings',
      label: 'Настройки изображения',
      onClick: () => run('settings', () => { selectLayer({ id: menu.target.id, type: menu.target.type }); setRightTab('layers'); }),
    },
    { kind: 'opacity', key: 'opacity' },
    { kind: 'separator', key: 'sep-1' },
    {
      kind: 'item',
      key: 'duplicate',
      label: 'Дублировать',
      onClick: () => run('duplicate', () => { if (isBase) duplicateBaseLayer(); else duplicateAiLayer(menu.target.id); }),
    },
    {
      kind: 'item',
      key: 'remove-bg',
      label: 'Удалить фон (Clipdrop)',
      onClick: () => run('remove-bg', () => removeBackgroundFromLayer(menu.target)),
    },
    {
      kind: 'item',
      key: 'delete-pixels',
      label: 'Удалить пиксели по выделению',
      disabled: !selectionActive,
      onClick: () => run('delete-pixels', () => deleteMaskedPixels(menu.target)),
    },
    ...(!isBase ? [{
      kind: 'item' as const,
      key: 'clear-erase',
      label: `Восстановить стёртое${eraseCount ? ` (${eraseCount})` : ''}`,
      disabled: eraseCount === 0,
      onClick: () => run('clear-erase', () => clearEraseElements({ id: menu.target.id, type: 'ai' })),
    }] : []),
    ...(isBase && eraseCount > 0 ? [{
      kind: 'item' as const,
      key: 'clear-erase',
      label: `Восстановить стёртое (${eraseCount})`,
      onClick: () => run('clear-erase', () => clearEraseElements({ type: 'base' })),
    }] : []),
    {
      kind: 'item',
      key: 'crop',
      label: crop ? 'Обрезать (изменить)' : 'Обрезать',
      onClick: () => run('crop', () => {
        selectLayer({ id: menu.target.id, type: menu.target.type });
        setLayerCropTarget(layerRef);
        // The crop frame lives in document space, but the layer may be moved,
        // scaled or rotated — open the frame where the layer's visible content
        // actually is on screen, not at its untransformed position.
        const placement = isBase ? doc.baseLayer : aiLayer!;
        const initial = crop ?? { x: 0, y: 0, width: 1, height: 1 };
        setCropRect(placement && !placement.perspective
          ? localRectToDocRect(initial, placement, doc.width, doc.height)
          : initial);
        setActiveTool('crop');
      }),
    },
    { kind: 'separator', key: 'sep-2' },
    {
      kind: 'item',
      key: 'visibility',
      label: visible ? 'Скрыть' : 'Показать',
      onClick: () => run('visibility', () => {
        if (isBase) updateBaseLayer({ visible: !visible });
        else updateAiLayer(menu.target.id, { visible: !visible });
      }),
    },
    {
      kind: 'item',
      key: 'lock',
      label: locked ? 'Разблокировать' : 'Заблокировать',
      onClick: () => run('lock', () => {
        if (isBase) updateBaseLayer({ locked: !locked });
        else updateAiLayer(menu.target.id, { locked: !locked });
      }),
    },
    { kind: 'separator', key: 'sep-3' },
    { kind: 'item', key: 'forward', label: 'Поднять выше', onClick: () => run('forward', () => moveLayerForward(layerRef)) },
    { kind: 'item', key: 'backward', label: 'Опустить ниже', onClick: () => run('backward', () => moveLayerBackward(layerRef)) },
    { kind: 'item', key: 'to-top', label: 'На самый верх', onClick: () => run('to-top', () => moveLayerToTop(layerRef)) },
    { kind: 'item', key: 'to-bottom', label: 'На самый низ', onClick: () => run('to-bottom', () => moveLayerToBottom(layerRef)) },
    { kind: 'separator', key: 'sep-4' },
  ];

  if (isBase) {
    items.push({
      kind: 'item',
      key: 'reset',
      label: 'Сбросить настройки',
      onClick: () => run('reset', () => resetBaseLayerSettings()),
    });
  } else {
    items.push({
      kind: 'item',
      key: 'delete',
      label: 'Удалить слой',
      danger: true,
      onClick: () => run('delete', () => deleteAiLayer(menu.target.id)),
    });
  }

  const itemCount = items.filter(item => item.kind === 'item').length;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={isBase ? 'Действия с исходником' : 'Действия со слоем'}
      style={{
        position: 'fixed',
        left: Math.min(menu.x, typeof window !== 'undefined' ? window.innerWidth - 260 : menu.x),
        top: Math.max(8, Math.min(menu.y, typeof window !== 'undefined' ? window.innerHeight - itemCount * 30 - 90 : menu.y)),
        zIndex: 100,
        minWidth: 240,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
        background: 'var(--bg-panel-raised)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ padding: '5px 10px 7px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {isBase ? `Оригинал — ${doc.name}` : aiLayer!.name}
      </div>
      {items.map(item => {
        if (item.kind === 'separator') {
          return <div key={item.key} role="separator" style={{ height: 1, background: 'var(--border-default)', margin: '4px 6px' }} />;
        }
        if (item.kind === 'opacity') {
          return (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Прозрачность</span>
              <input
                aria-label="Прозрачность слоя"
                type="range"
                min={0}
                max={100}
                value={Math.round(opacity * 100)}
                onPointerDown={() => pushHistory()}
                onChange={e => {
                  const value = Number(e.target.value) / 100;
                  if (isBase) updateBaseLayer({ opacity: value }, { history: false });
                  else updateAiLayer(menu.target.id, { opacity: value }, { history: false });
                }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 30, textAlign: 'right' }}>{Math.round(opacity * 100)}%</span>
            </div>
          );
        }
        return (
          <button
            key={item.key}
            role="menuitem"
            type="button"
            disabled={item.disabled || busy !== null}
            onClick={item.onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 10px',
              fontSize: 12,
              textAlign: 'left',
              borderRadius: 5,
              border: 'none',
              background: 'transparent',
              color: item.disabled ? 'var(--text-muted)' : item.danger ? 'var(--danger)' : 'var(--text-primary)',
              cursor: item.disabled || busy !== null ? 'not-allowed' : 'pointer',
              opacity: busy && busy !== item.key ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!item.disabled && !busy) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover, rgba(255,255,255,0.06))'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            {busy === item.key ? 'Выполняется…' : item.label}
          </button>
        );
      })}
    </div>
  );
}
