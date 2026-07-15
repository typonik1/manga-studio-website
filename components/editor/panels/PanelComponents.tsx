'use client';

import type { ReactNode, CSSProperties } from 'react';
import { EditorSlider } from '../EditorSlider';

export function PanelLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2, ...style }}>
      {children}
    </span>
  );
}

export function PanelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{children}</div>
    </div>
  );
}

export function PanelSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <EditorSlider label={label} min={min} max={max} step={step} value={value} onChange={onChange} />
    </div>
  );
}

export function PanelButton({
  children,
  onClick,
  disabled,
  variant = 'secondary',
  fullWidth,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
  title?: string;
}) {
  const styles: CSSProperties = {
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    width: fullWidth ? '100%' : undefined,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    transition: 'background 0.12s',
    opacity: disabled ? 0.5 : 1,
  };

  if (variant === 'primary') {
    styles.background = 'var(--accent)';
    styles.color = '#fff';
  } else if (variant === 'danger') {
    styles.background = 'rgba(232, 94, 94, 0.15)';
    styles.color = 'var(--danger)';
    styles.border = '1px solid rgba(232, 94, 94, 0.3)';
  } else if (variant === 'ghost') {
    styles.background = 'transparent';
    styles.color = 'var(--text-secondary)';
  } else {
    styles.background = 'var(--bg-panel-raised)';
    styles.color = 'var(--text-secondary)';
    styles.border = '1px solid var(--border-default)';
  }

  return (
    <button style={styles} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {title && <div className="section-label">{title}</div>}
      {children}
    </div>
  );
}
