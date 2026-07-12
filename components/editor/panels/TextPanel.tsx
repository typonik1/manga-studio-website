'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { uid } from '@/utils/imageUtils';
import { saveCustomFont } from '@/utils/fonts';
import { translateText, type TranslateLang } from '@/utils/translate';
import type { TextObject } from '@/types';
import { MANGA_FONTS, TEXT_PRESETS } from '@/types';
import { PanelRow, PanelSlider, PanelLabel, PanelSection } from './PanelComponents';

export function TextPanel() {
  const {
    textSettings, updateTextSettings, addText, activeDocIndex, documents,
    selectedObject, updateText, customFonts, addCustomFont, bumpFontsVersion,
  } = useStore();
  const customFontRef = useRef<HTMLInputElement>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [langFrom, setLangFrom] = useState<TranslateLang>('en');
  const [langTo, setLangTo] = useState<TranslateLang>('ru');

  const hasDoc = activeDocIndex >= 0;
  const activeDoc = hasDoc ? documents[activeDocIndex] : null;
  const selectedText = selectedObject?.type === 'text' && activeDoc
    ? activeDoc.texts.find(t => t.id === selectedObject.id)
    : null;

  function handleAddText() {
    if (!activeDoc) return;
    const text: TextObject = {
      id: uid(),
      text: 'Текст',
      fontFamily: textSettings.fontFamily,
      fontSize: textSettings.fontSize,
      fill: textSettings.fill,
      stroke: textSettings.stroke,
      strokeWidth: textSettings.strokeWidth,
      shadowColor: textSettings.shadowColor,
      shadowBlur: textSettings.shadowBlur,
      lineHeight: textSettings.lineHeight,
      align: textSettings.align,
      width: textSettings.width,
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      visible: true,
    };
    addText(text);
  }

  function applyPreset(key: string) {
    const preset = TEXT_PRESETS[key];
    updateTextSettings({ ...preset });
  }

  function handleCustomFont(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const buffer = ev.target?.result as ArrayBuffer;
        const fontName = file.name.replace(/\.[^.]+$/, '');
        // Registers the font AND saves it to IndexedDB so it survives reloads
        await saveCustomFont(fontName, buffer);
        addCustomFont(fontName);
        bumpFontsVersion();
        updateTextSettings({ fontFamily: fontName });
      } catch {
        alert('Не удалось загрузить шрифт. Проверьте файл.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function handleTranslate() {
    if (!selectedText || !selectedText.text.trim()) return;
    setIsTranslating(true);
    setTranslateError(null);
    try {
      const translated = await translateText(selectedText.text, langFrom, langTo);
      updateText(selectedText.id, { text: translated });
    } catch {
      setTranslateError('Не удалось перевести. Попробуйте позже.');
    } finally {
      setIsTranslating(false);
    }
  }

  const allFonts = [...MANGA_FONTS, ...customFonts.filter(f => !MANGA_FONTS.includes(f))];

  const settings = selectedText ? {
    fontFamily: selectedText.fontFamily,
    fontSize: selectedText.fontSize,
    fill: selectedText.fill,
    stroke: selectedText.stroke,
    strokeWidth: selectedText.strokeWidth,
    shadowColor: selectedText.shadowColor,
    shadowBlur: selectedText.shadowBlur,
    lineHeight: selectedText.lineHeight,
    align: selectedText.align,
    width: selectedText.width,
  } : textSettings;

  function update(updates: Partial<typeof textSettings>) {
    if (selectedText) {
      updateText(selectedText.id, updates);
    } else {
      updateTextSettings(updates);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="section-label">Текст</div>

      {/* Presets */}
      <PanelSection title="Пресеты">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {Object.keys(TEXT_PRESETS).map(key => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              style={{
                padding: '5px 6px',
                fontSize: 11,
                borderRadius: 6,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-panel-raised)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {key}
            </button>
          ))}
        </div>
      </PanelSection>

      <div className="divider" />

      {selectedText && (
        <>
          <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: -4 }}>
            Редактирование выбранного
          </div>
          <div>
            <PanelLabel>Содержимое</PanelLabel>
            <textarea
              value={selectedText.text}
              onChange={e => updateText(selectedText.id, { text: e.target.value })}
              rows={3}
              style={{
                width: '100%',
                resize: 'vertical',
                background: 'var(--bg-panel-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 12,
                padding: '6px 8px',
                fontFamily: 'inherit',
                lineHeight: 1.4,
              }}
            />
          </div>

          {/* Auto-translate */}
          <div>
            <PanelLabel>Автоперевод</PanelLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <select
                value={langFrom}
                onChange={e => setLangFrom(e.target.value as TranslateLang)}
                style={{ flex: 1, fontSize: 11 }}
              >
                <option value="en">EN</option>
                <option value="ru">RU</option>
                <option value="ja">JA</option>
                <option value="ko">KO</option>
                <option value="zh">ZH</option>
              </select>
              <button
                onClick={() => { const f = langFrom; setLangFrom(langTo); setLangTo(f); }}
                title="Поменять направление"
                style={{
                  padding: '4px 6px', fontSize: 12, borderRadius: 5,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-panel-raised)',
                  color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
                }}
              >
                ⇄
              </button>
              <select
                value={langTo}
                onChange={e => setLangTo(e.target.value as TranslateLang)}
                style={{ flex: 1, fontSize: 11 }}
              >
                <option value="ru">RU</option>
                <option value="en">EN</option>
                <option value="ja">JA</option>
                <option value="ko">KO</option>
                <option value="zh">ZH</option>
              </select>
            </div>
            <button
              onClick={handleTranslate}
              disabled={isTranslating || !selectedText.text.trim()}
              style={{
                marginTop: 4, width: '100%', padding: '6px 8px', fontSize: 12,
                borderRadius: 6, border: '1px solid var(--accent)',
                background: 'transparent',
                color: isTranslating ? 'var(--text-muted)' : 'var(--accent)',
                cursor: isTranslating ? 'wait' : 'pointer', fontWeight: 600,
              }}
            >
              {isTranslating ? 'Переводим…' : `Перевести ${langFrom.toUpperCase()} → ${langTo.toUpperCase()}`}
            </button>
            {translateError && (
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--danger)' }}>
                {translateError}
              </div>
            )}
          </div>
        </>
      )}

      {/* Font */}
      <div>
        <PanelLabel>Шрифт</PanelLabel>
        <select value={settings.fontFamily} onChange={e => update({ fontFamily: e.target.value })}>
          {allFonts.map(f => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}{customFonts.includes(f) && !MANGA_FONTS.includes(f) ? ' (свой)' : ''}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => customFontRef.current?.click()}
        style={{
          padding: '5px 8px', fontSize: 11, borderRadius: 6,
          border: '1px dashed var(--border-default)',
          background: 'var(--bg-panel-raised)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}
      >
        Загрузить шрифт (.ttf/.otf)
      </button>
      <input ref={customFontRef} type="file" accept=".ttf,.otf" onChange={handleCustomFont} style={{ display: 'none' }} />

      {/* Colors */}
      <PanelRow label="Цвет текста">
        <input
          type="color"
          value={settings.fill}
          onChange={e => update({ fill: e.target.value })}
          style={{ width: 36, height: 28 }}
        />
      </PanelRow>
      <PanelRow label="Обводка">
        <input
          type="color"
          value={settings.stroke || '#000000'}
          onChange={e => update({ stroke: e.target.value })}
          style={{ width: 36, height: 28 }}
        />
        <input
          type="number"
          value={settings.strokeWidth}
          min={0}
          max={20}
          onChange={e => update({ strokeWidth: Number(e.target.value) })}
          style={{ width: 44 }}
        />
      </PanelRow>
      <PanelRow label="Тень">
        <input
          type="color"
          value={settings.shadowColor === 'transparent' ? '#000000' : settings.shadowColor}
          onChange={e => update({ shadowColor: e.target.value })}
          style={{ width: 36, height: 28 }}
        />
      </PanelRow>

      <PanelSlider
        label={`Свечение тени ${settings.shadowBlur}px`}
        value={settings.shadowBlur}
        min={0}
        max={40}
        onChange={v => update({ shadowBlur: v })}
      />

      <PanelSlider
        label={`Размер`}
        value={Math.round(settings.fontSize * 1000)}
        min={10}
        max={250}
        onChange={v => update({ fontSize: v / 1000 })}
      />
      <PanelSlider
        label={`Межстрочный ${settings.lineHeight.toFixed(1)}`}
        value={Math.round(settings.lineHeight * 10)}
        min={8}
        max={30}
        onChange={v => update({ lineHeight: v / 10 })}
      />

      {/* Alignment */}
      <div>
        <PanelLabel>Выравнивание</PanelLabel>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['left', 'center', 'right'] as const).map(a => (
            <button
              key={a}
              onClick={() => update({ align: a })}
              title={a === 'left' ? 'Влево' : a === 'center' ? 'По центру' : 'Вправо'}
              style={{
                flex: 1, padding: '5px', borderRadius: 6,
                border: '1px solid var(--border-default)',
                background: settings.align === a ? 'var(--accent-dim)' : 'var(--bg-panel-raised)',
                color: settings.align === a ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 14,
              }}
            >
              {a === 'left' ? '⬅' : a === 'center' ? '⬌' : '➡'}
            </button>
          ))}
        </div>
      </div>

      <div className="divider" />

      <button
        onClick={handleAddText}
        disabled={!hasDoc}
        style={{
          padding: '7px 10px', borderRadius: 6, fontWeight: 600, fontSize: 13,
          border: 'none',
          background: hasDoc ? 'var(--accent)' : 'var(--bg-active)',
          color: hasDoc ? '#fff' : 'var(--text-muted)',
          cursor: hasDoc ? 'pointer' : 'not-allowed',
        }}
      >
        + Добавить текст (T)
      </button>
    </div>
  );
}
