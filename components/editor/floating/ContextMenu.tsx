'use client';

import type { ReactNode } from 'react';
import { FloatingPanel } from './FloatingPanel';

export function ContextMenu({
  x,
  y,
  onClose,
  label,
  children,
  minWidth = 240,
}: {
  x: number;
  y: number;
  onClose: () => void;
  label: string;
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <FloatingPanel x={x} y={y} onClose={onClose} role="menu" ariaLabel={label} minWidth={minWidth} maxWidth={360}>
      {children}
    </FloatingPanel>
  );
}
