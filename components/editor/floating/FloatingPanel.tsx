'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface FloatingPanelProps {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  role?: 'menu' | 'dialog';
  ariaLabel: string;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  style?: CSSProperties;
}

const GAP = 12;
const EDGE = 8;

export function FloatingPanel({
  x,
  y,
  onClose,
  children,
  role = 'dialog',
  ariaLabel,
  minWidth = 260,
  maxWidth = 360,
  className,
  style,
}: FloatingPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x + GAP, top: y + GAP, ready: false });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const preferredLeft = x + GAP;
    const flippedLeft = x - rect.width - GAP;
    const preferredTop = y + GAP;
    const flippedTop = y - rect.height - GAP;
    const left = Math.max(
      EDGE,
      Math.min(preferredLeft + rect.width <= viewportWidth - EDGE ? preferredLeft : flippedLeft, viewportWidth - rect.width - EDGE),
    );
    const top = Math.max(
      EDGE,
      Math.min(preferredTop + rect.height <= viewportHeight - EDGE ? preferredTop : flippedTop, viewportHeight - rect.height - EDGE),
    );
    setPosition({ left, top, ready: true });
  }, [x, y, children]);

  useLayoutEffect(() => {
    const handleOutside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', handleOutside, true);
    return () => window.removeEventListener('pointerdown', handleOutside, true);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role={role}
      aria-label={ariaLabel}
      className={className}
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        zIndex: 140,
        minWidth,
        width: 'max-content',
        maxWidth: `min(${maxWidth}px, calc(100vw - ${EDGE * 2}px))`,
        maxHeight: `calc(100vh - ${EDGE * 2}px)`,
        overflowY: 'auto',
        visibility: position.ready ? 'visible' : 'hidden',
        background: 'var(--bg-panel-raised)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        padding: 8,
        boxShadow: '0 12px 38px rgba(0,0,0,.52)',
        color: 'var(--text-primary)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
