'use client';

import { useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/store/useStore';
import { LeftPanel } from './LeftPanel';
import { ToolRail } from './ToolRail';
import { RightPanel } from './RightPanel';
import { ExportModal } from './ExportModal';

// Konva's Stage relies on browser APIs and react-reconciler internals that
// break during SSR ("getOwner is not a function"), so load it client-only.
const CanvasArea = dynamic(
  () => import('./CanvasArea').then(m => m.CanvasArea),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}
      >
        Загрузка редактора…
      </div>
    ),
  },
);

export function EditorShell() {
  const { undo, redo, setActiveTool, setLeftTab, selectedObject, deleteWatermark, deleteText, deleteShape, documents } = useStore();

  // Register hasChanges for beforeunload
  useEffect(() => {
    (window as any).__mangaStudioHasChanges = () =>
      documents.some(d => d.hasChanges);
    return () => { delete (window as any).__mangaStudioHasChanges; };
  }, [documents]);

  // Load all fonts (Google + saved custom) once, then force a canvas redraw
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { preloadGoogleFonts, loadSavedCustomFonts } = await import('@/utils/fonts');
      const [, customNames] = await Promise.all([
        preloadGoogleFonts(),
        loadSavedCustomFonts(),
      ]);
      if (cancelled) return;
      const { setCustomFonts, bumpFontsVersion } = useStore.getState();
      if (customNames.length > 0) setCustomFonts(customNames);
      bumpFontsVersion();
    })();
    return () => { cancelled = true; };
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    // Use e.code so shortcuts work on any keyboard layout (e.g. Russian)
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.code === 'KeyY' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault(); redo(); return;
    }
    if (e.code === 'KeyV') { setActiveTool('select'); return; }
    if (e.code === 'KeyH') { setActiveTool('pan'); return; }
    if (e.code === 'KeyB') { setActiveTool('brush'); setLeftTab('cleanup'); return; }
    if (e.code === 'KeyE') { setActiveTool('eraser'); setLeftTab('cleanup'); return; }
    if (e.code === 'KeyL') { setActiveTool('lasso'); setLeftTab('cleanup'); return; }
    if (e.code === 'Space') { e.preventDefault(); setActiveTool('pan'); return; }
    if (e.code === 'KeyT') { setActiveTool('text'); setLeftTab('text'); return; }
    if (e.code === 'KeyW') { setActiveTool('watermark'); setLeftTab('watermark'); return; }
    if (e.code === 'KeyM') { setActiveTool('wand'); setLeftTab('cleanup'); return; }
    if (e.key === '1') { setLeftTab('watermark'); return; }
    if (e.key === '2') { setLeftTab('cleanup'); return; }
    if (e.key === '3') { setLeftTab('text'); return; }
    if (e.key === '4') { setLeftTab('insert'); return; }
    if (e.key === '5') { setLeftTab('transform'); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObject) {
      if (selectedObject.type === 'watermark') deleteWatermark(selectedObject.id);
      else if (selectedObject.type === 'shape') deleteShape(selectedObject.id);
      else deleteText(selectedObject.id);
    }
  }, [undo, redo, setActiveTool, setLeftTab, selectedObject, deleteWatermark, deleteText, deleteShape]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg-app)',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <TopBar />
      {/* Main area */}
      <div className="editor-main">
        <LeftPanel />
        <ToolRail />
        <CanvasArea />
        <RightPanel />
      </div>
      <ExportModal />
    </div>
  );
}

function TopBar() {
  const { documents, activeDocIndex, setShowExportModal, undo, redo } = useStore();
  const activeDoc = activeDocIndex >= 0 ? documents[activeDocIndex] : null;

  return (
    <header style={{ height: 52, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, flexShrink: 0, zIndex: 50 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 190 }}>
        <svg width="24" height="24" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <rect width="22" height="22" rx="5" fill="var(--accent-dim)" />
          <rect x="3" y="3" width="7" height="10" rx="1.5" fill="var(--accent)" />
          <rect x="12" y="3" width="7" height="6" rx="1.5" fill="var(--accent)" opacity="0.7" />
          <rect x="12" y="11" width="7" height="8" rx="1.5" fill="var(--accent)" opacity="0.5" />
          <rect x="3" y="15" width="7" height="4" rx="1.5" fill="var(--accent)" opacity="0.5" />
        </svg>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Манга-студия</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>
            {activeDoc ? `${activeDoc.name} · ${activeDocIndex + 1}/${documents.length}` : 'Новый проект'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, paddingLeft: 8, borderLeft: '1px solid var(--border-subtle)' }}>
        <button className="ui-icon-button" onClick={undo} disabled={!activeDoc?.past.length} aria-label="Отменить действие" title="Отменить (Ctrl+Z)">↶</button>
        <button className="ui-icon-button" onClick={redo} disabled={!activeDoc?.future.length} aria-label="Повторить действие" title="Повторить (Ctrl+Shift+Z)">↷</button>
      </div>

      {activeDoc?.hasChanges && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}><span style={{ color: 'var(--accent)' }}>●</span> Есть изменения</span>}
      <div style={{ flex: 1 }} />
      <span className="topbar-privacy" style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 1L2 3v3c0 2.21 1.79 4 4 4s4-1.79 4-4V3L6 1z" fill="currentColor" opacity="0.7" /></svg>
        Обработка локально
      </span>
      <button className="ui-button ui-button-primary" onClick={() => setShowExportModal(true)} disabled={!activeDoc} aria-label="Открыть экспорт">
        Экспортировать
        <span aria-hidden="true">→</span>
      </button>
    </header>
  );
}
