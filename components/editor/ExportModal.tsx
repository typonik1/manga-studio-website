'use client';

import { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import type { ImageDocument } from '@/types';

async function renderDocumentToCanvas(doc: ImageDocument): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d')!;

  // Load base image
  const baseImg = new window.Image();
  baseImg.crossOrigin = 'anonymous';
  await new Promise<void>((res, rej) => {
    baseImg.onload = () => res();
    baseImg.onerror = rej;
    baseImg.src = doc.originalSrc;
  });
  ctx.drawImage(baseImg, 0, 0, doc.width, doc.height);

  // Cleanup committed
  if (doc.cleanup.committed) {
    const cleanImg = new window.Image();
    cleanImg.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => {
      cleanImg.onload = () => res();
      cleanImg.onerror = rej;
      cleanImg.src = doc.cleanup.committed!;
    });
    ctx.drawImage(cleanImg, 0, 0, doc.width, doc.height);
  }

  // Brush strokes (white paint on top)
  for (const stroke of doc.cleanup.strokes) {
    const pts = stroke.points;
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size * doc.height;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = stroke.opacity;
    for (let i = 0; i < pts.length; i += 2) {
      const px = pts[i] * doc.width;
      const py = pts[i + 1] * doc.height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Watermarks
  for (const wm of doc.watermarks) {
    if (!wm.visible) continue;
    ctx.save();
    ctx.globalAlpha = wm.opacity;
    const x = wm.x * doc.width;
    const y = wm.y * doc.height;
    ctx.translate(x, y);
    ctx.rotate((wm.rotation * Math.PI) / 180);
    ctx.scale(wm.scaleX, wm.scaleY);

    if (wm.type === 'text' && wm.text) {
      const fontSize = (wm.fontSize ?? 0.06) * doc.height;
      ctx.font = `${fontSize}px "${wm.fontFamily ?? 'Arial'}"`;
      ctx.fillStyle = wm.fill ?? '#ffffff';
      ctx.fillText(wm.text, 0, 0);
    } else if (wm.type === 'image' && wm.imageSrc) {
      const wmImg = new window.Image();
      wmImg.crossOrigin = 'anonymous';
      await new Promise<void>((res) => {
        wmImg.onload = () => res();
        wmImg.onerror = () => res();
        wmImg.src = wm.imageSrc!;
      });
      const w = (wm.imageWidth ?? 0.25) * doc.width;
      const h = (wm.imageHeight ?? 0.12) * doc.height;
      ctx.drawImage(wmImg, 0, 0, w, h);
    }
    ctx.restore();
  }

  // Texts
  for (const txt of doc.texts) {
    if (!txt.visible) continue;
    ctx.save();
    ctx.globalAlpha = 1;
    const x = txt.x * doc.width;
    const y = txt.y * doc.height;
    ctx.translate(x, y);
    ctx.rotate((txt.rotation * Math.PI) / 180);
    ctx.scale(txt.scaleX, txt.scaleY);
    const fontSize = txt.fontSize * doc.height;
    ctx.font = `${fontSize}px "${txt.fontFamily}"`;
    ctx.fillStyle = txt.fill;
    if (txt.shadowBlur > 0) {
      ctx.shadowColor = txt.shadowColor;
      ctx.shadowBlur = txt.shadowBlur;
    }
    const lines = txt.text.split('\n');
    const lineH = fontSize * txt.lineHeight;
    for (let li = 0; li < lines.length; li++) {
      const lineY = li * lineH;
      if (txt.stroke && txt.strokeWidth > 0) {
        ctx.strokeStyle = txt.stroke;
        ctx.lineWidth = txt.strokeWidth;
        ctx.strokeText(lines[li], 0, lineY);
      }
      ctx.fillText(lines[li], 0, lineY);
    }
    ctx.restore();
  }

  return canvas;
}

function getExportName(originalName: string, format: 'png' | 'jpg', usedNames: Set<string>): string {
  const base = originalName.replace(/\.[^.]+$/, '');
  const ext = format === 'jpg' ? 'jpg' : 'png';
  let candidate = `${base}_edit.${ext}`;
  let n = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_edit_${n}.${ext}`;
    n++;
  }
  usedNames.add(candidate);
  return candidate;
}

export function ExportModal() {
  const { showExportModal, setShowExportModal, exportSettings, updateExportSettings, documents, activeDocIndex } = useStore();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const activeDoc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;

  const handleExportCurrent = useCallback(async () => {
    if (!activeDoc) return;
    setIsExporting(true);
    setError(null);
    try {
      const canvas = await renderDocumentToCanvas(activeDoc);
      const mime = exportSettings.format === 'jpg' ? 'image/jpeg' : 'image/png';
      const dataURL = canvas.toDataURL(mime, exportSettings.quality);
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = getExportName(activeDoc.name, exportSettings.format, new Set());
      a.click();
    } catch (e) {
      setError('Ошибка экспорта. Попробуйте ещё раз.');
    } finally {
      setIsExporting(false);
    }
  }, [activeDoc, exportSettings]);

  const handleExportAll = useCallback(async () => {
    if (documents.length === 0) return;
    setIsExporting(true);
    setProgress(0);
    setError(null);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const mime = exportSettings.format === 'jpg' ? 'image/jpeg' : 'image/png';

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const canvas = await renderDocumentToCanvas(doc);
        const dataURL = canvas.toDataURL(mime, exportSettings.quality);
        const base64 = dataURL.split(',')[1];
        const filename = getExportName(doc.name, exportSettings.format, usedNames);
        zip.file(filename, base64, { base64: true });
        setProgress(Math.round(((i + 1) / documents.length) * 100));
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'manga-studio-export.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError('Ошибка при создании ZIP-архива.');
    } finally {
      setIsExporting(false);
    }
  }, [documents, exportSettings]);

  if (!showExportModal) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) setShowExportModal(false); }}
    >
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        padding: '24px',
        width: 360,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Экспорт
          </h2>
          <button
            onClick={() => setShowExportModal(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 20, lineHeight: 1,
              display: 'flex', alignItems: 'center',
            }}
          >×</button>
        </div>

        {/* Format */}
        <div>
          <div className="section-label">Формат</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['png', 'jpg'] as const).map(f => (
              <button
                key={f}
                onClick={() => updateExportSettings({ format: f })}
                style={{
                  flex: 1, padding: '6px', borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  background: exportSettings.format === f ? 'var(--accent-dim)' : 'var(--bg-panel-raised)',
                  color: exportSettings.format === f ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Quality */}
        {exportSettings.format === 'jpg' && (
          <div>
            <div className="section-label">
              Качество {Math.round(exportSettings.quality * 100)}%
            </div>
            <input
              type="range"
              min={50}
              max={100}
              value={Math.round(exportSettings.quality * 100)}
              onChange={e => updateExportSettings({ quality: Number(e.target.value) / 100 })}
            />
          </div>
        )}

        {/* Info */}
        <div style={{
          background: 'var(--bg-panel-raised)',
          borderRadius: 8, padding: '10px 12px',
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          <div>Изображений в пачке: <span style={{ color: 'var(--text-secondary)' }}>{documents.length}</span></div>
          {activeDoc && (
            <div>Текущее: <span style={{ color: 'var(--text-secondary)' }}>{activeDoc.width}×{activeDoc.height}px</span></div>
          )}
          <div style={{ marginTop: 4, fontSize: 11 }}>Экспорт в исходном разрешении</div>
        </div>

        {/* Progress */}
        {isExporting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {documents.length > 1 ? `Обработка... ${progress}%` : 'Подготовка...'}
            </div>
            <div style={{ height: 4, background: 'var(--bg-active)', borderRadius: 2 }}>
              <div
                style={{
                  width: `${documents.length > 1 ? progress : 50}%`,
                  height: '100%', background: 'var(--accent)',
                  borderRadius: 2, transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 10px', borderRadius: 6,
            background: 'rgba(232,94,94,0.1)',
            border: '1px solid rgba(232,94,94,0.3)',
            fontSize: 12, color: 'var(--danger)',
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleExportCurrent}
            disabled={!activeDoc || isExporting}
            style={{
              flex: 1, padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1px solid var(--accent)',
              background: 'transparent',
              color: !activeDoc || isExporting ? 'var(--text-muted)' : 'var(--accent)',
              cursor: !activeDoc || isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            Текущее
          </button>
          <button
            onClick={handleExportAll}
            disabled={documents.length === 0 || isExporting}
            style={{
              flex: 1, padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: 'none',
              background: documents.length === 0 || isExporting ? 'var(--bg-active)' : 'var(--accent)',
              color: documents.length === 0 || isExporting ? 'var(--text-muted)' : '#fff',
              cursor: documents.length === 0 || isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            ZIP все ({documents.length})
          </button>
        </div>
      </div>
    </div>
  );
}
