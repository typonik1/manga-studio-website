'use client';

import { useStore } from '@/store/useStore';
import type { LeftTab, ActiveTool } from '@/types';
import { WatermarkPanel } from './panels/WatermarkPanel';
import { CleanupPanel } from './panels/CleanupPanel';
import { TextPanel } from './panels/TextPanel';
import { InsertPanel } from './panels/InsertPanel';
import { TransformPanel } from './panels/TransformPanel';

const TABS: { key: LeftTab; label: string; hotkey: string }[] = [
  { key: 'watermark', label: 'Вотерка', hotkey: '1' },
  { key: 'cleanup', label: 'Очистка', hotkey: '2' },
  { key: 'text', label: 'Текст', hotkey: '3' },
  { key: 'insert', label: 'Вставка', hotkey: '4' },
  { key: 'transform', label: 'Размер', hotkey: '5' },
];

const TOOLS: { key: ActiveTool; label: string; hotkey: string; icon: React.ReactNode }[] = [
  {
    key: 'select', hotkey: 'V', label: 'Выделение',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M3 2L3 11L5.5 8.5L7 12L8.5 11.5L7 7.5H10L3 2Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'brush', hotkey: 'B', label: 'Кисть',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M2 13c1-1 3-3 5-5l2-5 3 3-5 2c-2 2-4 4-5 5z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
        <circle cx="9.5" cy="5.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'pan', hotkey: 'Space', label: 'Панорама',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 2v2M7.5 11v2M2 7.5h2M11 7.5h2M4.22 4.22l1.41 1.41M9.37 9.37l1.41 1.41M4.22 10.78l1.41-1.41M9.37 5.63l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
      </svg>
    ),
  },
];

export function LeftPanel() {
  const { leftTab, setLeftTab, activeTool, setActiveTool, documents } = useStore();
  const hasDocuments = documents.length > 0;

  return (
    <aside
      className="editor-sidebar"
      aria-label="Инструменты редактора"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-default)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Tool strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {TOOLS.map(t => (
          <button
            key={t.key}
            className="ui-icon-button"
            title={`${t.label} (${t.hotkey})`}
            aria-label={`${t.label}, клавиша ${t.hotkey}`}
            aria-pressed={activeTool === t.key}
            onClick={() => setActiveTool(t.key)}
          >
            {t.icon}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{activeTool === 'brush' ? '[  ]' : ''}</span>
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Панели редактирования" style={{ display: 'flex', gap: 2, padding: 6, overflowX: 'auto', borderBottom: '1px solid var(--border-default)' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            className="ui-tab"
            aria-selected={leftTab === tab.key}
            aria-controls={`panel-${tab.key}`}
            onClick={() => setLeftTab(tab.key)}
            title={`${tab.label} (${tab.hotkey})`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div id={`panel-${leftTab}`} role="tabpanel" className="editor-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
        {!hasDocuments ? (
          <div className="editor-empty">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="5" y="7" width="26" height="22" rx="4" stroke="currentColor" strokeWidth="1.5"/><path d="M10 23l5-5 4 4 3-3 5 5M23 13h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <strong>Начните с изображения</strong>
            <span style={{ fontSize: 11, lineHeight: 1.5 }}>Перетащите файл на холст или выберите его с компьютера. PNG, JPG и WebP.</span>
            <button className="ui-button ui-button-primary" onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement | null)?.click()}>Выбрать изображение</button>
            <span style={{ fontSize: 10 }}>Файлы обрабатываются только в браузере</span>
          </div>
        ) : (
          <>
            {leftTab === 'watermark' && <WatermarkPanel />}
            {leftTab === 'cleanup' && <CleanupPanel />}
            {leftTab === 'text' && <TextPanel />}
            {leftTab === 'insert' && <InsertPanel />}
            {leftTab === 'transform' && <TransformPanel />}
          </>
        )}
      </div>
    </aside>
  );
}
