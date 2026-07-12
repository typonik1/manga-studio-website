'use client';

import { Copy, Layers, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

export function ToolOptionsBar() {
  const state = useStore();
  const { activeTool, cleanupSettings, updateCleanupSettings, selectedObject, documents, activeDocIndex } = state;
  const doc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;
  const isMarking = activeTool === 'brush' || activeTool === 'eraser';

  if (!doc) return null;
  return (
    <div className="tool-options" aria-label="Параметры активного инструмента">
      <strong>{activeTool === 'eraser' ? 'Ластик' : activeTool === 'brush' ? 'Кисть' : activeTool === 'select' ? 'Выделение' : activeTool === 'pan' ? 'Рука' : activeTool === 'text' ? 'Текст' : activeTool === 'watermark' ? 'Вотерка' : activeTool === 'wand' ? 'Волшебный бабл' : 'Лассо'}</strong>
      {isMarking && <>
        <label>Размер <input type="range" min="3" max="200" value={Math.round(cleanupSettings.brushSize * 1000)} onChange={e => updateCleanupSettings({ brushSize: Number(e.target.value) / 1000 })} /></label>
        <input className="tool-number" aria-label="Размер инструмента" type="number" min="3" max="200" value={Math.round(cleanupSettings.brushSize * 1000)} onChange={e => updateCleanupSettings({ brushSize: Math.max(3, Math.min(200, Number(e.target.value))) / 1000 })} />
        <label>Жёсткость <input type="range" min="0" max="100" value={Math.round(cleanupSettings.brushHardness * 100)} onChange={e => updateCleanupSettings({ brushHardness: Number(e.target.value) / 100 })} /></label>
        <span>{Math.round(cleanupSettings.brushHardness * 100)}%</span>
        {activeTool === 'brush' && <span className="color-swatch" style={{ background: cleanupSettings.brushColor }} title="Цвет кисти" />}
      </>}
      {activeTool === 'pan' && <span>Перетаскивайте холст. Удерживайте Space для временного режима.</span>}
      {activeTool === 'lasso' && <><button disabled>Замыть</button><button disabled>Залить белым</button><button disabled>Сбросить</button></>}
      {(activeTool === 'text' || activeTool === 'watermark' || activeTool === 'wand') && <button onClick={() => state.setLeftTab(activeTool === 'text' ? 'text' : activeTool === 'watermark' ? 'watermark' : 'cleanup')}>Открыть настройки</button>}
      {activeTool === 'select' && (selectedObject ? <>
        <span>{selectedObject.type === 'text' ? 'Текст' : selectedObject.type === 'shape' ? 'Фигура' : 'Вотерка'}</span>
        <button onClick={state.duplicateSelectedObject}><Copy size={14} /> Дублировать</button>
        <button onClick={() => state.moveSelectedObject('forward')}><Layers size={14} /> Вперёд</button>
        <button className="danger" onClick={state.deleteSelectedObject}><Trash2 size={14} /> Удалить</button>
      </> : <span>Нажмите на объект, чтобы выбрать его</span>)}
    </div>
  );
}
