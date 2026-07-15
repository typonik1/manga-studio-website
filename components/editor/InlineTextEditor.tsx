'use client';

import { useEffect, useRef } from 'react';
import type { TextObject, ViewportState } from '@/types';

interface Props {
  textObj: TextObject;
  docWidth: number;   // px (docWidth * previewScale)
  docHeight: number;  // px (docHeight * previewScale)
  viewport: ViewportState;
  isNew: boolean;     // if true, select all on mount
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * Floating textarea that appears over the Konva canvas at the text object's
 * position. Mirrored font/size/color to match the rendered Konva Text node.
 */
export function InlineTextEditor({
  textObj,
  docWidth,
  docHeight,
  viewport,
  isNew,
  onCommit,
  onCancel,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Compute screen-space position matching the Konva Text node
  const screenX = textObj.x * docWidth * viewport.scale + viewport.x;
  const screenY = textObj.y * docHeight * viewport.scale + viewport.y;
  const scaledFontSize = textObj.fontSize * docHeight * viewport.scale;
  const scaledWidth = textObj.width * docWidth * viewport.scale;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (isNew) {
      el.select();
    } else {
      // Place cursor at end
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [isNew]);

  function commit() {
    if (ref.current) onCommit(ref.current.value);
  }

  return (
    <textarea
      ref={ref}
      defaultValue={textObj.text}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape') { onCancel(); return; }
        // Ctrl/Cmd+Enter or plain Enter when no Shift → commit
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        width: Math.max(80, scaledWidth),
        minHeight: scaledFontSize * 1.5,
        fontSize: scaledFontSize,
        fontFamily: textObj.fontFamily,
        color: textObj.fill,
        lineHeight: textObj.lineHeight,
        textAlign: textObj.align as React.CSSProperties['textAlign'],
        background: 'rgba(0,0,0,0.55)',
        border: '1.5px solid var(--accent)',
        borderRadius: 4,
        outline: 'none',
        padding: '2px 4px',
        resize: 'none',
        overflow: 'hidden',
        zIndex: 50,
        boxSizing: 'border-box',
        pointerEvents: 'all',
        caretColor: textObj.fill,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    />
  );
}
