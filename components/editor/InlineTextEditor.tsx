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
 * position. WYSIWYG: mirrors font, size, color, stroke, shadow, rotation and
 * scale of the Konva Text node, so editing looks exactly like the final
 * render. The Konva node itself is hidden while editing (no ghost copy), and
 * the textarea is fully transparent — only a thin frame marks the edit area.
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
  const scaledStroke = textObj.stroke && textObj.strokeWidth > 0
    ? textObj.strokeWidth * viewport.scale
    : 0;
  const scaledShadow = textObj.shadowBlur > 0
    ? textObj.shadowBlur * viewport.scale
    : 0;

  // Auto-grow the textarea to fit its content (no scrollbars, no clipping)
  function autoGrow() {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    autoGrow();
    el.focus();
    if (isNew) {
      el.select();
    } else {
      // Place cursor at end
      el.setSelectionRange(el.value.length, el.value.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  // Re-fit height when zoom changes the rendered font size
  useEffect(() => {
    autoGrow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaledFontSize, scaledWidth]);

  function commit() {
    if (ref.current) onCommit(ref.current.value);
  }

  return (
    <textarea
      ref={ref}
      defaultValue={textObj.text}
      onInput={autoGrow}
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
        minHeight: scaledFontSize * textObj.lineHeight,
        fontSize: scaledFontSize,
        fontFamily: textObj.fontFamily,
        color: textObj.fill,
        lineHeight: textObj.lineHeight,
        textAlign: textObj.align as React.CSSProperties['textAlign'],
        // Transparent editor — the text is the only thing you see,
        // exactly where it will be rendered. A thin frame marks the bounds.
        background: 'transparent',
        border: 'none',
        outline: '1px solid var(--accent)',
        outlineOffset: 3,
        borderRadius: 2,
        padding: 0,
        margin: 0,
        resize: 'none',
        overflow: 'hidden',
        display: 'block',
        zIndex: 50,
        boxSizing: 'border-box',
        pointerEvents: 'all',
        caretColor: textObj.fill,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        // Mirror Konva node visuals so editing is true WYSIWYG
        WebkitTextStroke: scaledStroke > 0 ? `${scaledStroke}px ${textObj.stroke}` : undefined,
        textShadow: scaledShadow > 0 ? `0 0 ${scaledShadow}px ${textObj.shadowColor}` : undefined,
        transform: `rotate(${textObj.rotation}deg) scale(${textObj.scaleX}, ${textObj.scaleY})`,
        transformOrigin: 'left top',
      }}
    />
  );
}
