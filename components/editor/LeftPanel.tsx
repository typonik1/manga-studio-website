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
  const { leftTab, setLeftTab, activeTool, setActiveTool } = useStore();

  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
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
            title={`${t.label} (${t.hotkey})`}
            onClick={() => setActiveTool(t.key)}
            style={{
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: activeTool === t.key ? 'var(--accent-dim)' : 'transparent',
              color: activeTool === t.key ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => {
              if (activeTool !== t.key) {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={e => {
              if (activeTool !== t.key) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            {t.icon}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{activeTool === 'brush' ? '[  ]' : ''}</span>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setLeftTab(tab.key)}
            title={`${tab.label} (${tab.hotkey})`}
            style={{
              flex: 1,
              padding: '8px 2px',
              fontSize: 11,
              fontWeight: leftTab === tab.key ? 600 : 400,
              color: leftTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              borderBottom: leftTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color 0.12s',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {leftTab === 'watermark' && <WatermarkPanel />}
        {leftTab === 'cleanup' && <CleanupPanel />}
        {leftTab === 'text' && <TextPanel />}
        {leftTab === 'insert' && <InsertPanel />}
        {leftTab === 'transform' && <TransformPanel />}
      </div>
    </aside>
  );
}
