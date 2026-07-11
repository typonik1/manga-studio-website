'use client';

import { useState, useCallback, useRef } from 'react';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  loading?: boolean;
  errors?: string[];
}

export function DropZone({ onFiles, loading, errors }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(f.type)
    );
    if (files.length > 0) onFiles(files);
  }, [onFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
    e.target.value = '';
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        background: isDragging
          ? 'rgba(94, 159, 232, 0.06)'
          : 'transparent',
        border: isDragging
          ? '2px dashed var(--accent)'
          : '2px dashed transparent',
        borderRadius: 12,
        transition: 'all 0.15s',
        cursor: 'default',
      }}
    >
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {/* Icon */}
          <div style={{
            width: 80, height: 80, borderRadius: 16,
            background: 'rgba(94,159,232,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path
                d="M8 28L14 18L20 24L26 14L32 28H8Z"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="14" cy="14" r="3" stroke="var(--accent)" strokeWidth="2" fill="none" />
              <rect x="4" y="6" width="32" height="28" rx="3" stroke="var(--accent)" strokeWidth="2" fill="none" opacity="0.4" />
              <path d="M20 34v-8M17 29l3-3 3 3" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Перетащите мангу или арты сюда
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              JPG, PNG, WebP — одно или несколько изображений
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '9px 24px',
                borderRadius: 8,
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
            >
              Выбрать файлы
            </button>
          </div>

          {errors && errors.length > 0 && (
            <div style={{
              maxWidth: 360, borderRadius: 8, padding: '10px 14px',
              background: 'rgba(232,94,94,0.1)',
              border: '1px solid rgba(232,94,94,0.3)',
            }}>
              <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>
                Ошибки загрузки:
              </div>
              {errors.map((err, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{err}</div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            Обработка в браузере · Файлы не покидают ваш компьютер
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid var(--bg-active)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Загрузка изображений...</div>
    </div>
  );
}
