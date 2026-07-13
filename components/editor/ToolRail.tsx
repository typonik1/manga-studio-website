'use client';

import { Brush, Eraser, Hand, MousePointer2, Scan, Type, WandSparkles, Stamp, Paintbrush } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { ActiveTool, LeftTab } from '@/types';

const tools: Array<{ tool: ActiveTool; label: string; hotkey: string; icon: typeof Brush; tab?: LeftTab }> = [
  { tool: 'select', label: 'Выделение', hotkey: 'V', icon: MousePointer2 },
  { tool: 'pan', label: 'Рука', hotkey: 'H / Space', icon: Hand },
  { tool: 'brush', label: 'Кисть', hotkey: 'B', icon: Brush, tab: 'cleanup' },
  { tool: 'maskBrush', label: 'Маска', hotkey: 'M', icon: Paintbrush, tab: 'cleanup' },
  { tool: 'eraser', label: 'Ластик', hotkey: 'E', icon: Eraser, tab: 'cleanup' },
  { tool: 'lasso', label: 'Лассо', hotkey: 'L', icon: Scan, tab: 'cleanup' },
  { tool: 'text', label: 'Текст', hotkey: 'T', icon: Type, tab: 'text' },
  { tool: 'watermark', label: 'Вотерка', hotkey: 'W', icon: Stamp, tab: 'watermark' },
  { tool: 'wand', label: 'Волшебный бабл', hotkey: 'G', icon: WandSparkles, tab: 'cleanup' },
];

export function ToolRail() {
  const { activeTool, setActiveTool, setLeftTab, documents } = useStore();
  const disabled = documents.length === 0;
  return (
    <nav className="tool-rail" aria-label="Инструменты холста">
      {tools.map(({ tool, label, hotkey, icon: Icon, tab }) => (
        <button
          key={tool}
          className="tool-rail-button"
          aria-label={`${label}, клавиша ${hotkey}`}
          aria-pressed={activeTool === tool}
          title={`${label} (${hotkey})`}
          disabled={disabled}
          onClick={() => {
            setActiveTool(tool);
            if (tab) setLeftTab(tab);
          }}
        >
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ))}
    </nav>
  );
}
