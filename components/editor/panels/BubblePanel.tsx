'use client';

import { useStore } from '@/store/useStore';
import { uid } from '@/utils/imageUtils';
import type { BubbleObject, BubbleKind } from '@/types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MANGA_FONTS } from '@/types';

const BUBBLE_TYPES: { kind: BubbleKind; label: string }[] = [
  { kind: 'speech', label: 'Речь' },
  { kind: 'thought', label: 'Мысль' },
  { kind: 'scream', label: 'Крик' },
  { kind: 'narration', label: 'Нарратив' },
  { kind: 'whisper', label: 'Шёпот' },
];

const TAIL_DIRECTIONS = [
  { label: 'N', tipX: 0.5, tipY: -0.15 },
  { label: 'NE', tipX: 0.65, tipY: -0.1 },
  { label: 'E', tipX: 0.8, tipY: 0.5 },
  { label: 'SE', tipX: 0.65, tipY: 1.1 },
  { label: 'S', tipX: 0.5, tipY: 1.15 },
  { label: 'SW', tipX: 0.35, tipY: 1.1 },
  { label: 'W', tipX: 0.2, tipY: 0.5 },
  { label: 'NW', tipX: 0.35, tipY: -0.1 },
];

export function BubblePanel() {
  const {
    activeDocIndex, documents, selectedObject, addBubble, updateBubble,
  } = useStore();

  const hasDoc = activeDocIndex >= 0;
  const activeDoc = hasDoc ? documents[activeDocIndex] : null;
  const selectedBubble = selectedObject?.type === 'bubble' && activeDoc
    ? activeDoc.bubbles?.find(b => b.id === selectedObject.id) ?? null
    : null;

  function createBubble(kind: BubbleKind) {
    if (!activeDoc) return;
    const bubble: BubbleObject = {
      id: uid(),
      kind,
      visible: true,
      x: 0.5,
      y: 0.5,
      width: 0.3,
      height: 0.2,
      rotation: 0,
      autoSize: true,
      tail: kind === 'narration' ? null : {
        enabled: true,
        tipX: 0.7,
        tipY: 0.8,
        width: 0.2,
      },
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 2,
      text: {
        content: 'Текст',
        fontFamily: 'Russo One',
        fontSize: 14,
        fill: '#000000',
        align: 'center',
        lineHeight: 1.3,
      },
    };
    addBubble(bubble);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!selectedBubble && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Выберите или создайте бабл, чтобы редактировать его параметры
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, padding: '0 2px 4px' }}>Тип бабла</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {BUBBLE_TYPES.map(({ kind, label }) => (
              <button
                key={kind}
                onClick={() => createBubble(kind)}
                style={{
                  padding: '6px 8px', fontSize: 10, borderRadius: 4,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-panel-raised)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {selectedBubble && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, padding: '0 2px 4px' }}>Тип бабла</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {BUBBLE_TYPES.map(({ kind, label }) => (
              <button
                key={kind}
                onClick={() => {
                  updateBubble(selectedBubble.id, {
                    kind,
                    tail: kind === 'narration' ? null : selectedBubble.tail || {
                      enabled: true,
                      tipX: 0.7,
                      tipY: 0.8,
                      width: 0.2,
                    },
                  });
                }}
                style={{
                  padding: '6px 8px', fontSize: 10, borderRadius: 4,
                  border: selectedBubble.kind === kind ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
                  background: selectedBubble.kind === kind ? 'var(--accent-dim)' : 'var(--bg-panel-raised)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Text content */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, padding: '6px 2px 4px' }}>Текст</div>
            <textarea
              value={selectedBubble.text.content}
              onChange={e => updateBubble(selectedBubble.id, { text: { ...selectedBubble.text, content: e.target.value } })}
              style={{ width: '100%', height: 60, padding: 6, fontSize: 11, borderRadius: 4, border: '1px solid var(--border-default)', fontFamily: 'monospace' }}
              placeholder="Введите текст бабла"
            />
          </div>

          {/* Tail direction presets */}
          {selectedBubble.kind !== 'narration' && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, padding: '6px 2px 4px' }}>Направление хвоста</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
                {TAIL_DIRECTIONS.map((dir, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (selectedBubble.tail) {
                        updateBubble(selectedBubble.id, {
                          tail: {
                            ...selectedBubble.tail,
                            tipX: selectedBubble.x + (dir.tipX - 0.5) * selectedBubble.width * 1.5,
                            tipY: selectedBubble.y + (dir.tipY - 0.5) * selectedBubble.height * 1.5,
                          },
                        });
                      }
                    }}
                    style={{
                      padding: '4px', fontSize: 10, borderRadius: 3,
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-panel-raised)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >
                    {dir.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>Толщина обводки</span>
            <input
              type="number"
              value={selectedBubble.strokeWidth}
              onChange={e => updateBubble(selectedBubble.id, { strokeWidth: Number(e.target.value) })}
              min={0}
              max={10}
              step={0.5}
              style={{ width: 50, padding: '4px 6px', fontSize: 10, borderRadius: 3, border: '1px solid var(--border-default)' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>Размер текста</span>
            <input
              type="number"
              value={selectedBubble.text.fontSize}
              onChange={e => updateBubble(selectedBubble.id, { text: { ...selectedBubble.text, fontSize: Number(e.target.value) } })}
              min={8}
              max={48}
              style={{ width: 50, padding: '4px 6px', fontSize: 10, borderRadius: 3, border: '1px solid var(--border-default)' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>Интервал строк</span>
            <input
              type="number"
              value={selectedBubble.text.lineHeight}
              onChange={e => updateBubble(selectedBubble.id, { text: { ...selectedBubble.text, lineHeight: Number(e.target.value) } })}
              min={1}
              max={2}
              step={0.1}
              style={{ width: 50, padding: '4px 6px', fontSize: 10, borderRadius: 3, border: '1px solid var(--border-default)' }}
            />
          </div>

          {/* Colors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>Заливка</span>
            <input
              type="color"
              value={selectedBubble.fill}
              onChange={e => updateBubble(selectedBubble.id, { fill: e.target.value })}
              style={{ width: 32, height: 24, borderRadius: 3, border: '1px solid var(--border-default)', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>Обводка</span>
            <input
              type="color"
              value={selectedBubble.stroke}
              onChange={e => updateBubble(selectedBubble.id, { stroke: e.target.value })}
              style={{ width: 32, height: 24, borderRadius: 3, border: '1px solid var(--border-default)', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>Цвет текста</span>
            <input
              type="color"
              value={selectedBubble.text.fill}
              onChange={e => updateBubble(selectedBubble.id, { text: { ...selectedBubble.text, fill: e.target.value } })}
              style={{ width: 32, height: 24, borderRadius: 3, border: '1px solid var(--border-default)', cursor: 'pointer' }}
            />
          </div>

          {/* Font */}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, padding: '6px 2px 4px' }}>Шрифт</div>
          <select
            value={selectedBubble.text.fontFamily}
            onChange={e => updateBubble(selectedBubble.id, { text: { ...selectedBubble.text, fontFamily: e.target.value } })}
            style={{ width: '100%', padding: '6px', fontSize: 10, borderRadius: 3, border: '1px solid var(--border-default)' }}
          >
            {MANGA_FONTS.map(font => (
              <option key={font} value={font}>{font}</option>
            ))}
          </select>

          {/* Alignment */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {(['left', 'center', 'right'] as const).map(align => (
              <button
                key={align}
                onClick={() => updateBubble(selectedBubble.id, { text: { ...selectedBubble.text, align } })}
                style={{
                  padding: '6px 8px', fontSize: 10, borderRadius: 4,
                  border: selectedBubble.text.align === align ? '1.5px solid var(--accent)' : '1px solid var(--border-default)',
                  background: selectedBubble.text.align === align ? 'var(--accent-dim)' : 'var(--bg-panel-raised)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                {align === 'left' ? 'Левое' : align === 'center' ? 'Центр' : 'Правое'}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
