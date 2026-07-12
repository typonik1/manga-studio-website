'use client';

import { useStore } from '@/store/useStore';
import { PanelSlider, PanelRow, PanelLabel, PanelButton } from './PanelComponents';
import { simpleInpaint } from '@/utils/imageUtils';

export function CleanupPanel() {
  const {
    cleanupSettings, updateCleanupSettings,
    setActiveTool, activeTool,
    activeDocIndex, documents,
    applyCleanupCommit, setInpaintRunning,
    isInpaintRunning, inpaintProgress,
  } = useStore();

  const activeDoc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;

  async function handleInpaint() {
    if (!activeDoc || isInpaintRunning) return;
    setInpaintRunning(true, 0);
    try {
      await new Promise(r => setTimeout(r, 30));
      setInpaintRunning(true, 15);

      // Build the full-res canvas with base + cleanup strokes
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = activeDoc.originalSrc;
      });

      const canvas = document.createElement('canvas');
      canvas.width = activeDoc.width;
      canvas.height = activeDoc.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      if (activeDoc.cleanup.committed) {
        const cleanImg = new window.Image();
        cleanImg.crossOrigin = 'anonymous';
        await new Promise<void>((res, rej) => {
          cleanImg.onload = () => res();
          cleanImg.onerror = rej;
          cleanImg.src = activeDoc.cleanup.committed!;
        });
        ctx.drawImage(cleanImg, 0, 0);
      }

      setInpaintRunning(true, 40);

      // Draw white strokes to build mask
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = activeDoc.width;
      maskCanvas.height = activeDoc.height;
      const maskCtx = maskCanvas.getContext('2d')!;
      maskCtx.fillStyle = 'black';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

      for (const stroke of activeDoc.cleanup.strokes) {
        if (stroke.mode === 'erase') continue;
        maskCtx.beginPath();
        maskCtx.strokeStyle = 'white';
        maskCtx.lineWidth = stroke.size * activeDoc.height;
        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
        const pts = stroke.points;
        for (let i = 0; i < pts.length; i += 2) {
          const px = pts[i] * activeDoc.width;
          const py = pts[i + 1] * activeDoc.height;
          if (i === 0) maskCtx.moveTo(px, py);
          else maskCtx.lineTo(px, py);
        }
        maskCtx.stroke();
      }

      setInpaintRunning(true, 60);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
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
              setActiveTool(m.key === 'brush' ? 'brush' : 'select');
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

      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Ctrl+Z — отмена, Ctrl+Shift+Z — повтор
      </div>
    </div>
  );
}
