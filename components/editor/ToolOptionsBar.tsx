'use client';

import { useRef, useState } from 'react';
import { Copy, Layers, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { aiCleanupMaskedArea, deleteMaskedPixels, fillMaskedArea, hasActiveSelection, inpaintMaskedArea } from '@/utils/layerActions';
import type { SelectionMode } from '@/types';

const toolTitles: Record<string, string> = {
  eraser: 'Ластик', maskBrush: 'Маска', brush: 'Кисть', select: 'Выделение объектов',
  pan: 'Рука', text: 'Текст', watermark: 'Вотерка', wand: 'Волшебная палочка',
  lasso: 'Лассо', rectSelect: 'Прямоугольное выделение', crop: 'Кадрирование',
};

const selectionModes: Array<{ mode: SelectionMode; label: string; hint: string }> = [
  { mode: 'replace', label: 'Новое', hint: 'Каждое выделение заменяет предыдущее' },
  { mode: 'add', label: '+', hint: 'Добавить к выделению (Shift)' },
  { mode: 'subtract', label: '−', hint: 'Вычесть из выделения (Alt)' },
];

export function ToolOptionsBar() {
  const state = useStore();
  const { activeTool, cleanupSettings, updateCleanupSettings, selectedObject, documents, activeDocIndex } = state;
  const doc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;
  const isMarking = activeTool === 'brush' || activeTool === 'maskBrush' || activeTool === 'eraser';
  const isSelecting = activeTool === 'lasso' || activeTool === 'rectSelect' || activeTool === 'wand';
  const [running, setRunning] = useState<string | null>(null);
  const [fillColor, setFillColor] = useState('#ffffff');
  const abortRef = useRef<AbortController | null>(null);

  if (!doc) return null;
  const selectionActive = hasActiveSelection(doc);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setRunning(key);
    try {
      await action();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="tool-options" aria-label="Параметры активного инструмента" style={{ pointerEvents: 'auto', zIndex: 40 }} onMouseDown={event => event.stopPropagation()}>
      <strong>{toolTitles[activeTool] ?? 'Инструмент'}</strong>
      {isMarking && <>
        <label>Размер <input type="range" min="3" max="200" value={Math.round(cleanupSettings.brushSize * 1000)} onChange={e => updateCleanupSettings({ brushSize: Number(e.target.value) / 1000 })} /></label>
        <input className="tool-number" aria-label="Размер инструмента" type="number" min="3" max="200" value={Math.round(cleanupSettings.brushSize * 1000)} onChange={e => updateCleanupSettings({ brushSize: Math.max(3, Math.min(200, Number(e.target.value))) / 1000 })} />
        <label>Жёсткость <input type="range" min="0" max="100" value={Math.round(cleanupSettings.brushHardness * 100)} onChange={e => updateCleanupSettings({ brushHardness: Number(e.target.value) / 100 })} /></label>
        <span>{Math.round(cleanupSettings.brushHardness * 100)}%</span>
        {activeTool === 'brush' && <input aria-label="Цвет кисти" title="Цвет кисти" type="color" value={cleanupSettings.brushColor} onChange={event => updateCleanupSettings({ brushColor: event.target.value })} onMouseDown={event => event.stopPropagation()} style={{ width: 30, height: 26, cursor: 'pointer', pointerEvents: 'auto' }} />}
      </>}
      {activeTool === 'pan' && <span>Перетаскивайте холст. Удерживайте Space для временного режима.</span>}

      {isSelecting && <>
        {/* Selection mode: replace / add / subtract */}
        <div role="group" aria-label="Режим выделения" style={{ display: 'flex', gap: 2 }}>
          {selectionModes.map(({ mode, label, hint }) => (
            <button
              key={mode}
              type="button"
              title={hint}
              aria-pressed={cleanupSettings.selectionMode === mode}
              onClick={() => updateCleanupSettings({ selectionMode: mode })}
              style={{
                minWidth: 30,
                background: cleanupSettings.selectionMode === mode ? 'var(--accent)' : undefined,
                color: cleanupSettings.selectionMode === mode ? 'var(--bg-base)' : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTool === 'wand' && <>
          <label>Порог <input type="range" min="1" max="100" value={cleanupSettings.magicThreshold} onChange={e => updateCleanupSettings({ magicThreshold: Number(e.target.value) })} /></label>
          <span>{cleanupSettings.magicThreshold}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Только связанная область вокруг точки клика">
            <input type="checkbox" checked={cleanupSettings.wandContiguous} onChange={e => updateCleanupSettings({ wandContiguous: e.target.checked })} />
            Смежные
          </label>
        </>}

        {/* Actions on the selection */}
        <button disabled={!selectionActive || running !== null} title="Сделать выделенную область прозрачной (локально)" onClick={() => runAction('delete', deleteMaskedPixels)}>
          {running === 'delete' ? 'Удаляю…' : 'Удалить пиксели'}
        </button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <button disabled={!selectionActive || running !== null} title="Залить выделение цветом (новый слой)" onClick={() => runAction('fill', () => fillMaskedArea(fillColor))}>
            {running === 'fill' ? 'Заливаю…' : 'Залить'}
          </button>
          <input aria-label="Цвет заливки" type="color" value={fillColor} onChange={e => setFillColor(e.target.value)} style={{ width: 26, height: 24, cursor: 'pointer' }} />
        </span>
        <button disabled={!selectionActive || running !== null} title="Локальное замывание без AI (быстро)" onClick={() => runAction('inpaint', inpaintMaskedArea)}>
          {running === 'inpaint' ? 'Замываю…' : 'Замыть'}
        </button>
        <button
          disabled={!selectionActive || running !== null}
          title="AI-восстановление области через Clipdrop"
          onClick={() => {
            abortRef.current = new AbortController();
            void runAction('ai', () => aiCleanupMaskedArea(abortRef.current?.signal));
          }}
        >
          {running === 'ai' ? 'AI работает…' : 'AI-восстановить'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Не сбрасывать выделение после действия">
          <input type="checkbox" checked={cleanupSettings.keepSelectionAfterAction} onChange={e => updateCleanupSettings({ keepSelectionAfterAction: e.target.checked })} />
          Сохранять
        </label>
        <button disabled={!selectionActive} onClick={state.clearActiveMask}>Сбросить</button>
      </>}

      {(activeTool === 'text' || activeTool === 'watermark') && <button onClick={() => state.setLeftTab(activeTool === 'text' ? 'text' : 'watermark')}>Открыть настройки</button>}
      {activeTool === 'select' && (selectedObject ? <>
        <span>{selectedObject.type === 'text' ? 'Текст' : selectedObject.type === 'shape' ? 'Фигура' : 'Вотерка'}</span>
        <button onClick={state.duplicateSelectedObject}><Copy size={14} /> Дублировать</button>
        <button onClick={() => state.moveSelectedObject('forward')}><Layers size={14} /> Вперёд</button>
        <button className="danger" onClick={state.deleteSelectedObject}><Trash2 size={14} /> Удалить</button>
      </> : <span>Нажмите на объект, чтобы выбрать его</span>)}
    </div>
  );
}
