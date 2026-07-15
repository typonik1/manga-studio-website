'use client';

import { useStore } from '@/store/useStore';
import type { LeftTab } from '@/types';
import { WatermarkPanel } from './panels/WatermarkPanel';
import { CleanupPanel } from './panels/CleanupPanel';
import { TextPanel } from './panels/TextPanel';
import { InsertPanel } from './panels/InsertPanel';
import { TransformPanel } from './panels/TransformPanel';
import { BubblePanel } from './panels/BubblePanel';

const TABS: { key: LeftTab; label: string; hotkey: string }[] = [
  { key: 'watermark', label: 'Вотерка', hotkey: '1' },
  { key: 'cleanup', label: 'Очистка', hotkey: '2' },
  { key: 'text', label: 'Текст', hotkey: '3' },
  { key: 'bubble', label: 'Баблы', hotkey: 'B' },
  { key: 'insert', label: 'Вставка', hotkey: '4' },
  { key: 'transform', label: 'Трансформ.', hotkey: '5' },
];

export function LeftPanel() {
  const { leftTab, setLeftTab, documents } = useStore();
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
            {leftTab === 'bubble' && <BubblePanel />}
            {leftTab === 'insert' && <InsertPanel />}
            {leftTab === 'transform' && <TransformPanel />}
          </>
        )}
      </div>
    </aside>
  );
}
