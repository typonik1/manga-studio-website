'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { PanelSlider, PanelRow } from './PanelComponents';
import { simpleInpaint } from '@/utils/imageUtils';
import { buildCleanupMask, buildCleanupSource, buildCleanupSourceCanvas, createCleanupPatch } from '@/utils/cleanupRaster';
import { cleanupWithClipdrop, removeBackgroundWithClipdrop } from '@/lib/clipdrop/client';

const primaryButtonStyle = {
  padding: '7px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  border: 'none', background: 'var(--accent)', color: 'var(--accent-foreground)', cursor: 'pointer',
} as const;

const secondaryButtonStyle = {
  padding: '6px', borderRadius: 6, fontSize: 11,
  border: '1px solid var(--border-default)', background: 'var(--bg-panel-raised)',
  color: 'var(--text-secondary)', cursor: 'pointer',
} as const;

export function CleanupPanel() {
  const {
    cleanupSettings, updateCleanupSettings,
    setActiveTool, activeTool,
    activeDocIndex, documents,
    applyCleanupCommit, addAiLayer, createMask, clearActiveMask, setInpaintRunning,
    isInpaintRunning, inpaintProgress,
  } = useStore();
  const [aiOperation, setAiOperation] = useState<'cleanup' | 'background' | null>(null);
  const [aiError, setAiError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const activeDoc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;
  const activeMask = activeDoc?.masks.find(mask => mask.id === activeDoc.activeMaskId) ?? null;
  const hasMask = Boolean(activeMask && ((activeMask.elements?.length ?? 0) > 0 || activeMask.strokes.some(stroke => stroke.mode !== 'erase')));

  async function handleClipdrop(operation: 'cleanup' | 'background') {
    if (!activeDoc || aiOperation) return;
    const documentId = activeDoc.id;
    const controller = new AbortController();
    abortRef.current = controller;
    setAiError('');
    setAiOperation(operation);
    try {
      const image = await buildCleanupSource(activeDoc);
      let result: string;
      if (operation === 'cleanup') {
        const mask = await buildCleanupMask(activeDoc);
        if (mask.isEmpty) throw new Error('Сначала создайте маску кистью, лассо или волшебным баблом.');
        const fullResult = await cleanupWithClipdrop(image, mask.blob, controller.signal);
        result = await createCleanupPatch(fullResult, mask.canvas, activeDoc.width, activeDoc.height);
      } else {
        result = await removeBackgroundWithClipdrop(image, controller.signal);
      }
      const current = useStore.getState().documents.find(doc => doc.id === documentId);
      const index = (current?.aiLayers.filter(layer => layer.operation === operation).length ?? 0) + 1;
      addAiLayer(documentId, {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: operation === 'cleanup' ? `Удаление объекта ${index}` : `Фон удалён ${index}`,
        src: result,
        visible: true,
        opacity: 1,
        operation: operation === 'cleanup' ? 'cleanup' : 'remove-background',
        replacesBase: operation === 'background',
        maskId: operation === 'cleanup' ? activeMask?.id : undefined,
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setAiError(error instanceof Error ? error.message : 'Не удалось обработать изображение.');
      }
    } finally {
      abortRef.current = null;
      setAiOperation(null);
    }
  }

  async function handleInpaint() {
    if (!activeDoc || isInpaintRunning) return;
    setInpaintRunning(true, 0);
    try {
      await new Promise(r => setTimeout(r, 30));
      setInpaintRunning(true, 15);

      const canvas = await buildCleanupSourceCanvas(activeDoc);
      const ctx = canvas.getContext('2d')!;
      setInpaintRunning(true, 40);
      const mask = await buildCleanupMask(activeDoc);
      if (mask.isEmpty) throw new Error('Пустая маска');
      setInpaintRunning(true, 60);
      const maskCtx = mask.canvas.getContext('2d', { willReadFrequently: true })!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const maskData = maskCtx.getImageData(0, 0, mask.canvas.width, mask.canvas.height);
      const result = simpleInpaint(imageData, maskData, cleanupSettings.inpaintRadius * 3);

      setInpaintRunning(true, 85);

      ctx.putImageData(result, 0, 0);
      const dataURL = canvas.toDataURL('image/png');
      applyCleanupCommit(dataURL);
      setInpaintRunning(false, 100);
    } catch (err) {
      setInpaintRunning(false, 0);
      alert('Ошибка при замывании. Попробуйте ещё раз.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="section-label">Очистка текста</div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {([
          { key: 'brush', label: 'Кисть' },
          { key: 'inpaint', label: 'Замывание' },
        ] as const).map(m => (
          <button
            key={m.key}
            onClick={() => {
              updateCleanupSettings({ mode: m.key });
              setActiveTool(m.key === 'brush' ? 'brush' : 'maskBrush');
            }}
            style={{
              flex: 1,
              padding: '5px 6px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid var(--border-default)',
              background: cleanupSettings.mode === m.key ? 'var(--accent-dim)' : 'var(--bg-panel-raised)',
              color: cleanupSettings.mode === m.key ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {cleanupSettings.mode === 'brush' && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Рисуйте белой кистью по тексту в баблах. Инструмент Кисть (B).
          </div>
          <PanelRow label="Цвет кисти">
            <input
              type="color"
              value={cleanupSettings.brushColor}
              onChange={e => updateCleanupSettings({ brushColor: e.target.value })}
              style={{ width: 36, height: 28 }}
            />
            <button
              onClick={() => updateCleanupSettings({ brushColor: '#ffffff' })}
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-panel-raised)',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              Белый
            </button>
          </PanelRow>
          <PanelSlider
            label={`Размер кисти ([ ])`}
            value={Math.round(cleanupSettings.brushSize * 1000)}
            min={3}
            max={200}
            onChange={v => updateCleanupSettings({ brushSize: v / 1000 })}
          />
          <PanelSlider
            label={`Жёсткость ${Math.round(cleanupSettings.brushHardness * 100)}%`}
            value={Math.round(cleanupSettings.brushHardness * 100)}
            min={0}
            max={100}
            onChange={v => updateCleanupSettings({ brushHardness: v / 100 })}
          />
        </>
      )}

      {cleanupSettings.mode === 'inpaint' && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Нарисуйте маску кистью (B), затем нажмите «Замыть». Хорошо работает на ровных фонах.
          </div>
          <PanelSlider
            label={`Радиус ${cleanupSettings.inpaintRadius}px`}
            value={cleanupSettings.inpaintRadius}
            min={1}
            max={20}
            onChange={v => updateCleanupSettings({ inpaintRadius: v })}
          />
          <PanelSlider
            label={`Размер маски`}
            value={Math.round(cleanupSettings.brushSize * 1000)}
            min={3}
            max={200}
            onChange={v => updateCleanupSettings({ brushSize: v / 1000 })}
          />

          {isInpaintRunning ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Замывание... {inpaintProgress}%
              </div>
              <div style={{ height: 4, background: 'var(--bg-active)', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${inpaintProgress}%`,
                    height: '100%',
                    background: 'var(--accent)',
                    borderRadius: 2,
                    transition: 'width 0.2s',
                  }}
                />
              </div>
              <button
                onClick={() => setInpaintRunning(false, 0)}
                style={{
                  padding: '5px', borderRadius: 6, fontSize: 11,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-panel-raised)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                ��тмена
              </button>
            </div>
          ) : (
            <button
              onClick={handleInpaint}
              disabled={!activeDoc || activeDoc.cleanup.strokes.length === 0}
              style={{
                padding: '7px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: 'none',
                background: activeDoc && activeDoc.cleanup.strokes.length > 0 ? 'var(--accent)' : 'var(--bg-active)',
                color: activeDoc && activeDoc.cleanup.strokes.length > 0 ? '#fff' : 'var(--text-muted)',
                cursor: activeDoc && activeDoc.cleanup.strokes.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              Замыть
            </button>
          )}
        </>
      )}

      <div className="divider" />
      <div className="section-label">Маска и удаление</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        {activeMask ? `Активна: ${activeMask.name} · ${activeMask.strokes.length} штр.` : 'Создайте маску и закрасьте объект оранжевой кистью.'}
      </div>
      <button
        type="button"
        onClick={() => { createMask(); setActiveTool('maskBrush'); }}
        disabled={!activeDoc || Boolean(aiOperation)}
        style={secondaryButtonStyle}
      >
        Новая маска
      </button>
      <button
        type="button"
        aria-label="Включить кисть маски"
        onClick={() => { updateCleanupSettings({ mode: 'inpaint' }); setActiveTool('maskBrush'); }}
        disabled={!activeDoc || Boolean(aiOperation)}
        style={secondaryButtonStyle}
      >
        Кисть маски
      </button>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => handleClipdrop('cleanup')}
          disabled={!activeDoc || !hasMask || Boolean(aiOperation)}
          aria-busy={aiOperation === 'cleanup'}
          style={{ ...primaryButtonStyle, flex: 1 }}
        >
          {aiOperation === 'cleanup' ? 'Удаляем…' : 'Удалить отмеченное'}
        </button>
        <button
          type="button"
          onClick={() => { if (window.confirm('Очистить все штрихи активной маски?')) clearActiveMask(); }}
          disabled={!hasMask || Boolean(aiOperation)}
          style={secondaryButtonStyle}
        >
          Очистить маску
        </button>
      </div>
      <button
        type="button"
        onClick={() => handleClipdrop('background')}
        disabled={!activeDoc || Boolean(aiOperation)}
        aria-busy={aiOperation === 'background'}
        style={primaryButtonStyle}
      >
        {aiOperation === 'background' ? 'Удаляем фон…' : 'Удалить фон'}
      </button>
      {aiOperation && (
        <button type="button" onClick={() => abortRef.current?.abort()} style={secondaryButtonStyle}>
          Отменить запрос
        </button>
      )}
      {aiError && <div role="alert" style={{ color: 'var(--destructive)', fontSize: 11, lineHeight: 1.4 }}>{aiError}</div>}

      <div className="divider" />

      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Ctrl+Z — отмена, Ctrl+Shift+Z — повтор
      </div>
    </div>
  );
}
