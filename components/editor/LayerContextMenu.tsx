'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { deleteMaskedPixels, hasActiveSelection, removeBackgroundFromLayer } from '@/utils/layerActions';

export interface ContextMenuState {
  x: number;
  y: number;
  target: { id: string; type: 'base' | 'ai' };
}

export function LayerContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const { documents, activeDocIndex, duplicateAiLayer, duplicateBaseLayer, deleteAiLayer, updateAiLayer, updateBaseLayer, clearEraseElements } = useStore();
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

  const visible = isBase ? doc.baseLayer?.visible !== false : aiLayer!.visible;
  const eraseCount = isBase ? (doc.baseLayer?.eraseElements.length ?? 0) : (aiLayer!.eraseElements?.length ?? 0);
  const selectionActive = hasActiveSelection(doc);

  const run = async (key: string, action: () => Promise<void> | void) => {
    setBusy(key);
    try {
      await action();
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    } finally {
      setBusy(null);
    }
  };

  const items: Array<{ key: string; label: string; disabled?: boolean; danger?: boolean; onClick: () => void }> = [
    {
      key: 'duplicate',
      label: 'Дублировать слой',
      onClick: () => run('duplicate', () => { if (isBase) duplicateBaseLayer(); else duplicateAiLayer(menu.target.id); }),
    },
    {
      key: 'remove-bg',
      label: 'Удалить фон (Clipdrop)',
      onClick: () => run('remove-bg', () => removeBackgroundFromLayer(menu.target)),
    },
    {
      key: 'delete-pixels',
      label: 'Удалить пиксели (по выделению)',
      disabled: !selectionActive,
      onClick: () => run('delete-pixels', () => deleteMaskedPixels()),
    },
    {
      key: 'clear-erase',
      label: `Восстановить стёртое${eraseCount ? ` (${eraseCount})` : ''}`,
      disabled: eraseCount === 0,
      onClick: () => run('clear-erase', () => clearEraseElements(isBase ? { type: 'base' } : { id: menu.target.id, type: 'ai' })),
    },
    {
      key: 'visibility',
      label: visible ? 'Скрыть слой' : 'Показать слой',
      onClick: () => run('visibility', () => {
        if (isBase) updateBaseLayer({ visible: !visible });
        else updateAiLayer(menu.target.id, { visible: !visible });
      }),
    },
  ];

  if (!isBase) {
    items.push({
      key: 'delete',
      label: 'Удалить слой',
      danger: true,
      onClick: () => run('delete', () => deleteAiLayer(menu.target.id)),
    });
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={isBase ? 'Действия с исходником' : 'Действия со слоем'}
      style={{
        position: 'fixed',
        left: Math.min(menu.x, typeof window !== 'undefined' ? window.innerWidth - 250 : menu.x),
        top: Math.min(menu.y, typeof window !== 'undefined' ? window.innerHeight - items.length * 34 - 40 : menu.y),
        zIndex: 100,
        minWidth: 230,
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
      {items.map(item => (
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
            padding: '7px 10px',
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
      ))}
    </div>
  );
}
