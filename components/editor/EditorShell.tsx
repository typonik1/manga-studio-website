'use client';

import { useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/store/useStore';
import { LeftPanel } from './LeftPanel';
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
  const { undo, redo, setActiveTool, setLeftTab, selectedObject, deleteWatermark, deleteText, documents } = useStore();

  // Register hasChanges for beforeunload
  useEffect(() => {
    (window as any).__mangaStudioHasChanges = () =>
      documents.some(d => d.hasChanges);
    return () => { delete (window as any).__mangaStudioHasChanges; };
  }, [documents]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === 'y' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault(); redo(); return;
    }
    if (e.key === 'v' || e.key === 'м') { setActiveTool('select'); return; }
    if (e.key === 'b' || e.key === 'и') { setActiveTool('brush'); return; }
    if (e.key === ' ') { e.preventDefault(); setActiveTool('pan'); return; }
    if (e.key === 't' || e.key === 'е') { setLeftTab('text'); return; }
    if (e.key === 'w' || e.key === 'ц') { setLeftTab('watermark'); return; }
    if (e.key === '1') { setLeftTab('watermark'); return; }
    if (e.key === '2') { setLeftTab('cleanup'); return; }
    if (e.key === '3') { setLeftTab('text'); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObject) {
      if (selectedObject.type === 'watermark') deleteWatermark(selectedObject.id);
      else deleteText(selectedObject.id);
    }
  }, [undo, redo, setActiveTool, setLeftTab, selectedObject, deleteWatermark, deleteText]);

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
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <LeftPanel />
        <CanvasArea />
        <RightPanel />
      </div>
      <ExportModal />
    </div>
  );
}

function TopBar() {
  const { documents, setShowExportModal } = useStore();
  const hasDocuments = documents.length > 0;

  return (
    <header
      style={{
        height: 44,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect width="22" height="22" rx="5" fill="var(--accent)" opacity="0.18" />
          <rect x="3" y="3" width="7" height="10" rx="1.5" fill="var(--accent)" />
          <rect x="12" y="3" width="7" height="6" rx="1.5" fill="var(--accent)" opacity="0.7" />
          <rect x="12" y="11" width="7" height="8" rx="1.5" fill="var(--accent)" opacity="0.5" />
          <rect x="3" y="15" width="7" height="4" rx="1.5" fill="var(--accent)" opacity="0.5" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
          Манга-студия
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Privacy note */}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1L2 3v3c0 2.21 1.79 4 4 4s4-1.79 4-4V3L6 1z" fill="currentColor" opacity="0.6" />
        </svg>
        Фото не загружаются на сервер
      </span>

      {hasDocuments && (
        <button
          onClick={() => setShowExportModal(true)}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '5px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
        >
          Экспорт
        </button>
      )}
    </header>
  );
}
