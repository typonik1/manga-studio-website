'use client';

import { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import type { ImageDocument } from '@/types';
import { buildCleanupSourceCanvas } from '@/utils/cleanupRaster';
import { resolveLayerOrder } from '@/utils/layerOrder';
import { getBubblePath, tailTipPixels } from '@/utils/bubbleGeometry';
import { drawBrushStroke } from '@/utils/brushRaster';

async function renderDocumentToCanvas(doc: ImageDocument): Promise<HTMLCanvasElement> {
  // Make sure web fonts are loaded before drawing text to canvas
  try { await document.fonts.ready; } catch { /* ignore */ }
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d')!;

  // Raster stack (base + AI) rendered by the shared pipeline: it follows the
  // unified layer order and applies adjustments, erase masks, crop and transforms.
  const raster = await buildCleanupSourceCanvas(doc);
  ctx.drawImage(raster, 0, 0, doc.width, doc.height);

  // Brush strokes use the same color/hardness rasterizer as the editor preview.
  for (const stroke of doc.cleanup.strokes.filter(item => item.purpose !== 'mask')) {
    drawBrushStroke(ctx, stroke, doc.width, doc.height);
  }

  // Watermarks, texts and shapes drawn bottom → top following the unified
  // layer order, so the exported file matches the canvas exactly.
  const drawWatermark = async (wm: (typeof doc.watermarks)[number]) => {
    if (!wm.visible) return;
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
      ctx.textBaseline = 'top';
      ctx.fillText(wm.text, 0, 0);
    } else if (wm.type === 'image' && wm.imageSrc) {
      const wmImg = new window.Image();
      wmImg.crossOrigin = 'anonymous';
      await new Promise<void>((res) => {
        wmImg.onload = () => res();
        wmImg.onerror = () => res();
        wmImg.src = wm.imageSrc!;
      });
      // Preserve the logo's natural aspect ratio (same as the canvas preview)
      const w = (wm.imageWidth ?? 0.25) * doc.width;
      const h = wmImg.naturalWidth > 0
        ? w * (wmImg.naturalHeight / wmImg.naturalWidth)
        : (wm.imageHeight ?? 0.12) * doc.height;
      ctx.drawImage(wmImg, 0, 0, w, h);
    }
    ctx.restore();
  };

  const drawText = (txt: (typeof doc.texts)[number]) => {
    if (!txt.visible) return;
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
  };

  const drawShape = (shape: NonNullable<typeof doc.shapes>[number]) => {
    if (!shape.visible) return;
    ctx.save();
    ctx.globalAlpha = shape.opacity;
    const cx = shape.x * doc.width;
    const cy = shape.y * doc.height;
    const w = shape.width * doc.width;
    const h = shape.height * doc.height;
    ctx.translate(cx, cy);
    ctx.rotate((shape.rotation * Math.PI) / 180);
    ctx.scale(shape.scaleX, shape.scaleY);
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shape.kind === 'rect') {
      ctx.beginPath();
      const r = Math.min(shape.cornerRadius, w / 2, h / 2);
      ctx.roundRect(-w / 2, -h / 2, w, h, r);
      if (shape.fill) { ctx.fillStyle = shape.fill; ctx.fill(); }
      if (shape.stroke && shape.strokeWidth > 0) { ctx.strokeStyle = shape.stroke; ctx.stroke(); }
    } else if (shape.kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (shape.fill) { ctx.fillStyle = shape.fill; ctx.fill(); }
      if (shape.stroke && shape.strokeWidth > 0) { ctx.strokeStyle = shape.stroke; ctx.stroke(); }
    } else if (shape.kind === 'line' || shape.kind === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.strokeStyle = shape.stroke || '#000';
      ctx.stroke();
      if (shape.kind === 'arrow') {
        const head = Math.max(8, shape.strokeWidth * 3);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2 - head, -head / 2);
        ctx.lineTo(w / 2 - head, head / 2);
        ctx.closePath();
        ctx.fillStyle = shape.stroke || '#000';
        ctx.fill();
      }
    } else if (shape.kind === 'star') {
      const outer = Math.min(w, h) / 2;
      const inner = outer / 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (shape.fill) { ctx.fillStyle = shape.fill; ctx.fill(); }
      if (shape.stroke && shape.strokeWidth > 0) { ctx.strokeStyle = shape.stroke; ctx.stroke(); }
    }
    ctx.restore();
  };

  const drawBubble = (bubble: NonNullable<typeof doc.bubbles>[number]) => {
    if (!bubble.visible) return;
    ctx.save();
    ctx.globalAlpha = 1;
    const cx = bubble.x * doc.width;
    const cy = bubble.y * doc.height;
    const w = bubble.width * doc.width;
    const h = bubble.height * doc.height;
    ctx.translate(cx, cy);
    ctx.rotate((bubble.rotation * Math.PI) / 180);

    // Get bubble path in local pixel space (centered at 0,0).
    // Use the new tail model directly — no legacy tipX/tipY needed.
    const pathData = getBubblePath(bubble.kind, {
      x: 0,
      y: 0,
      width: w,
      height: h,
      rotation: bubble.rotation,
      tail: bubble.tail ?? null,
    });

    try {
      const path = new Path2D(pathData);
      if (bubble.fill) { ctx.fillStyle = bubble.fill; ctx.fill(path); }
      if (bubble.stroke && bubble.strokeWidth > 0) {
        ctx.strokeStyle = bubble.stroke;
        ctx.lineWidth = bubble.strokeWidth;
        if (bubble.kind === 'whisper') {
          ctx.setLineDash([6, 4]);
        }
        ctx.stroke(path);
        ctx.setLineDash([]);
      }
    } catch { /* Path2D not supported, skip bubble */ }

    // Draw text inside bubble
    const fontSize = bubble.text.fontSize;
    ctx.font = `${fontSize}px "${bubble.text.fontFamily}"`;
    ctx.fillStyle = bubble.text.fill;
    ctx.textAlign = bubble.text.align;
    ctx.textBaseline = 'middle';
    const lines = bubble.text.content.split('\n');
    const lineH = fontSize * bubble.text.lineHeight;
    for (let i = 0; i < lines.length; i++) {
      const y = (i - lines.length / 2 + 0.5) * lineH;
      ctx.fillText(lines[i], 0, y);
    }

    ctx.restore();
  };

  for (const ref of resolveLayerOrder(doc)) {
    if (ref.type === 'watermark') {
      const wm = doc.watermarks.find(item => item.id === ref.id);
      if (wm) await drawWatermark(wm);
    } else if (ref.type === 'text') {
      const txt = doc.texts.find(item => item.id === ref.id);
      if (txt) drawText(txt);
    } else if (ref.type === 'shape') {
      const shape = (doc.shapes ?? []).find(item => item.id === ref.id);
      if (shape) drawShape(shape);
    } else if (ref.type === 'bubble') {
      const bubble = (doc.bubbles ?? []).find(item => item.id === ref.id);
      if (bubble) drawBubble(bubble);
    }
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
