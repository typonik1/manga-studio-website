'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { uid } from '@/utils/imageUtils';
import { saveCustomFont, hasCustomFont, deleteCustomFont } from '@/utils/fonts';
import { translateText, type TranslateLang } from '@/utils/translate';
import type { TextObject } from '@/types';
import { DEFAULT_ANIME_FONT, MANGA_FONTS, TEXT_PRESETS } from '@/types';
import { PanelRow, PanelSlider, PanelLabel, PanelSection } from './PanelComponents';
import { clampOcrBox } from '@/utils/coordinates';
import { TEXT_PRESET_LABELS } from '@/lib/strings.ru';
import { toast } from '@/hooks/use-toast';

export function TextPanel() {
  const {
    textSettings, updateTextSettings, addText, activeDocIndex, documents,
    selectedObject, updateText, customFonts, addCustomFont, removeCustomFont, bumpFontsVersion,
    addStroke, restorePageSourceText, setActiveTool, translationFontFamily,
  } = useStore();
  const customFontRef = useRef<HTMLInputElement>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [langFrom, setLangFrom] = useState<TranslateLang>('en');
  const [langTo, setLangTo] = useState<TranslateLang>('ru');
  const [pageStatus, setPageStatus] = useState<string | null>(null);
  const [pageProgress, setPageProgress] = useState(0);
  const [translatedBlocks, setTranslatedBlocks] = useState<number | null>(null);
  const [isPageTranslating, setIsPageTranslating] = useState(false);

  const hasDoc = activeDocIndex >= 0;
  const activeDoc = hasDoc ? documents[activeDocIndex] : null;
  const selectedText = selectedObject?.type === 'text' && activeDoc
    ? activeDoc.texts.find(t => t.id === selectedObject.id)
    : null;
  const canRestoreSourceText = activeDoc?.texts.some(text => text.translationBatchId && text.sourceText && text.isTranslated) ?? false;

  function handleRestoreSourceText() {
    restorePageSourceText();
    setTranslatedBlocks(0);
    setPageProgress(0);
    setPageStatus('Перевод отменён · показан исходный текст так, как его распознала AI-модель.');
  }

  function handleActivateTextTool() {
    setActiveTool('text');
  }

  function applyPreset(key: string) {
    const preset = TEXT_PRESETS[key];
    updateTextSettings({ ...preset });
  }

  async function handleCustomFont(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fontName = file.name.replace(/\.[^.]+$/, '').trim();
    if (!fontName) {
      alert('Не удалось определить имя шрифта из файла.');
      return;
    }
    // Дубликаты имён: перезаписываем только после подтверждения.
    const isDuplicate = customFonts.includes(fontName) || await hasCustomFont(fontName);
    if (isDuplicate) {
      if (!window.confirm(`Шрифт «${fontName}» уже загружен. Заменить его новым файлом?`)) return;
    } else if (MANGA_FONTS.includes(fontName)) {
      if (!window.confirm(`Имя «${fontName}» совпадает со встроенным шрифтом — загруженный файл заменит его при отображении. Продолжить?`)) return;
    }
    try {
      const buffer = await file.arrayBuffer();
      // Registers the font AND saves it to IndexedDB so it survives reloads
      await saveCustomFont(fontName, buffer);
      addCustomFont(fontName);
      bumpFontsVersion();
      updateTextSettings({ fontFamily: fontName });
    } catch {
      alert('Не удалось загрузить шрифт. Проверьте файл (.ttf/.otf/.woff/.woff2).');
    }
  }

  async function handleDeleteCustomFont(name: string) {
    if (!window.confirm(`Удалить шрифт «${name}»? Он исчезнет из списка и из сохранённых шрифтов.`)) return;
    // Удаляем из IndexedDB и дерегистрируем из текущей сессии
    await deleteCustomFont(name);
    removeCustomFont(name);

    const state = useStore.getState();
    // Если удалили дефолтный шрифт перевода — возвращаем встроенный
    if (state.translationFontFamily === name) {
      state.setTranslationFontFamily(DEFAULT_ANIME_FONT);
    } else if (state.textSettings.fontFamily === name) {
      state.updateTextSettings({ fontFamily: state.translationFontFamily });
    }
    // Тексты в открытых документах не должны ссылаться на удалённый шрифт
    const available = [...MANGA_FONTS, ...useStore.getState().customFonts];
    const missing = useStore.getState().replaceMissingFonts(available);
    if (missing.length > 0) {
      toast({
        title: 'Шрифт удалён',
        description: `Тексты, использовавшие «${name}», переключены на шрифт по умолчанию.`,
      });
    }
    bumpFontsVersion();
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

  /**
   * Page auto-translate via AI vision model:
   * 1. Send full page to /api/translate/page
   * 2. Замываем ТОЛЬКО буквы оригинала (с небольшим запасом)
   * 3. Перевод вписываем в бабл, а не в узкий бокс букв
   */
  async function handlePageTranslate() {
    if (!activeDoc || isPageTranslating) return;
    setIsPageTranslating(true);
    setTranslatedBlocks(null);
    setPageProgress(20);
    setPageStatus('AI распознаёт и переводит страницу…');
    try {
      const { translatePageWithAi } = await import('@/utils/pageTranslate');
      const src = activeDoc.cleanup.committed ?? activeDoc.originalSrc;
      const blocks = await translatePageWithAi(src, langFrom, langTo);
      if (blocks.length === 0) {
        setPageProgress(0);
        setTranslatedBlocks(0);
        setPageStatus('Текст не найден. Проверьте исходный язык или попробуйте более чёткое изображение.');
        return;
      }

      setPageProgress(60);
      setPageStatus(`Размещаем перевод · блоков: ${blocks.length}`);

      const { fitTextToBox, ensureFontLoaded } = await import('@/utils/textFit');
      const fontFamily = useStore.getState().translationFontFamily;
      await ensureFontLoaded(fontFamily);

      const W = activeDoc.width;
      const H = activeDoc.height;
      const translationBatchId = uid();
      const LINE_HEIGHT = 1.15;
      const INSET = 0.08; // поля внутри бабла, чтобы текст не липнул к контуру

      let placed = 0;

      blocks.forEach((block) => {
        const textBox = clampOcrBox(block);
        if (!textBox) return;

        // 1) Замывка строго по буквам оригинала + небольшой запас на хвосты глифов
        const wipe =
          clampOcrBox({
            x: textBox.x - textBox.width * 0.04,
            y: textBox.y - textBox.height * 0.1,
            width: textBox.width * 1.08,
            height: textBox.height * 1.2,
          }) ?? textBox;
        const rows = Math.max(1, Math.ceil(wipe.height / 0.03));
        const size = (wipe.height * H) / rows;
        const capX = size / 2 / W;
        for (let row = 0; row < rows; row++) {
          let x0 = wipe.x + capX;
          let x1 = wipe.x + wipe.width - capX;
          if (x1 < x0) x0 = x1 = wipe.x + wipe.width / 2;
          const yc = wipe.y + (size / H) * (row + 0.5);
          addStroke({
            id: uid(),
            points: [x0, yc, x1, yc],
            size: size / H,
            color: block.background,
            opacity: 1,
            hardness: 1,
          });
        }

        // 2) Область под перевод — весь бабл. Если модель его не дала,
        // расширяем бокс букв: русский длиннее английского примерно на 30%.
        const area =
          (block.bubble ? clampOcrBox(block.bubble) : null) ??
          clampOcrBox({
            x: textBox.x - textBox.width * 0.15,
            y: textBox.y - textBox.height * 0.12,
            width: textBox.width * 1.3,
            height: textBox.height * 1.24,
          }) ??
          textBox;

        const innerWidth = Math.max(0.03, area.width * (1 - INSET * 2));
        const innerHeight = Math.max(0.02, area.height * (1 - INSET * 2));

        const fitted = fitTextToBox(block.translation, {
          boxWidthPx: innerWidth * W,
          boxHeightPx: innerHeight * H,
          fontFamily,
          lineHeight: LINE_HEIGHT,
          maxFontSizePx: Math.max(14, innerHeight * H),
          // Ниже 11px на странице читать невозможно — лучше слегка вылезти за бабл
          minFontSizePx: Math.max(11, Math.round(H * 0.012)),
          maxWidthScale: block.bubble ? 1.15 : 1.45,
          maxHeightScale: 1.2,
        });
        if (fitted.lines.length === 0) return;

        const widthNorm = Math.min(1, innerWidth * fitted.widthScale);
        const textHeight = (fitted.lines.length * fitted.fontSizePx * LINE_HEIGHT) / H;
        const centerX = area.x + area.width / 2;
        const centerY = area.y + area.height / 2;

        addText({
          id: uid(),
          text: fitted.text,
          fontFamily,
          fontSize: fitted.fontSizePx / H,
          fill: '#000000',
          stroke: '',
          strokeWidth: 0,
          shadowColor: '#000000',
          shadowBlur: 0,
          lineHeight: LINE_HEIGHT,
          align: 'center',
          width: widthNorm,
          x: Math.max(0, Math.min(1 - widthNorm, centerX - widthNorm / 2)),
          y: Math.max(0, Math.min(1 - textHeight, centerY - textHeight / 2)),
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          visible: true,
          sourceText: block.original,
          translationBatchId,
          isTranslated: true,
        });
        placed += 1;
      });

      setPageProgress(100);
      setTranslatedBlocks(placed);
      setPageStatus(`Готово · переведено блоков: ${placed}`);
    } catch {
      setPageProgress(0);
      setTranslatedBlocks(null);
      setPageStatus('Не удалось обработать страницу. Проверьте соединение и повторите попытку.');
    } finally {
      setIsPageTranslating(false);
    }
  }

  const userFonts = customFonts.filter(f => !MANGA_FONTS.includes(f));

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

      {/* Page auto-translate (OCR + translate + overlay) */}
      <div className="editor-card editor-card-accent" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Автоперевод страницы</div>
          <div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.5, color: 'var(--text-secondary)' }}>Распознает реплики, скроет оригинал и добавит редактируемый перевод.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label className="sr-only" htmlFor="translate-from">Исходный язык</label>
          <select
            id="translate-from"
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
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
          <label className="sr-only" htmlFor="translate-to">Язык перевода</label>
          <select
            id="translate-to"
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
        <button className="ui-button ui-button-primary" onClick={handlePageTranslate} disabled={!hasDoc || isPageTranslating} style={{ width: '100%' }}>
          {isPageTranslating ? 'Обрабатываем страницу…' : translatedBlocks !== null ? 'Повторить автоперевод' : 'Распознать и перевести'}
        </button>
        {canRestoreSourceText && !isPageTranslating && (
          <button className="ui-button ui-button-secondary" onClick={handleRestoreSourceText} style={{ width: '100%' }}>
            Отменить перевод и показать оригинал
          </button>
        )}
        {isPageTranslating && <div className="editor-progress" role="progressbar" aria-label="Прогресс автоперевода" aria-valuenow={pageProgress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pageProgress}%` }} /></div>}
        {pageStatus && (
          <div className="editor-status" role={isPageTranslating ? 'status' : translatedBlocks === null ? 'alert' : 'status'} data-tone={translatedBlocks && translatedBlocks > 0 ? 'success' : undefined}>
            <span aria-hidden="true">{translatedBlocks && translatedBlocks > 0 ? '✓' : isPageTranslating ? '○' : 'i'}</span>
            <span>{pageStatus}</span>
          </div>
        )}
      </div>

      <div className="divider" />

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
              {TEXT_PRESET_LABELS[key] ?? key}
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
          <optgroup label="Встроенные">
            {MANGA_FONTS.map(f => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}{f === DEFAULT_ANIME_FONT ? ' (встроенный)' : ''}{f === translationFontFamily ? ' — по умолчанию' : ''}
              </option>
            ))}
          </optgroup>
          {userFonts.length > 0 && (
            <optgroup label="Мои шрифты">
              {userFonts.map(f => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}{f === translationFontFamily ? ' — по умолчанию' : ''}
                </option>
              ))}
            </optgroup>
          )}
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
        Загрузить шрифт (.ttf/.otf/.woff/.woff2)
      </button>
      <input ref={customFontRef} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleCustomFont} style={{ display: 'none' }} />

      {/* Мои шрифты: сохранены в браузере (IndexedDB), переживают перезагрузку */}
      {customFonts.length > 0 && (
        <div>
          <PanelLabel>Мои шрифты</PanelLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {customFonts.map(f => (
              <div
                key={f}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 4px 4px 8px', borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-panel-raised)',
                }}
              >
                <span
                  style={{
                    flex: 1, fontSize: 12, color: 'var(--text-primary)',
                    fontFamily: `"${f}"`,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {f}
                </span>
                {f === translationFontFamily && (
                  <span style={{ fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>по умолчанию</span>
                )}
                <button
                  onClick={() => handleDeleteCustomFont(f)}
                  title={`Удалить шрифт «${f}»`}
                  aria-label={`Удалить шрифт «${f}»`}
                  style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 5,
                    border: 'none', background: 'transparent',
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Draft text — shown even without a selected object */}
      <div>
        <PanelLabel>Текст для вставки</PanelLabel>
        <textarea
          value={textSettings.draftText}
          onChange={e => updateTextSettings({ draftText: e.target.value })}
          placeholder="Введите текст, затем кликните на холст"
          rows={3}
          onWheel={e => e.stopPropagation()}
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
            boxSizing: 'border-box',
          }}
        />
      </div>

      <button
        onClick={handleActivateTextTool}
        disabled={!hasDoc}
        style={{
          padding: '7px 10px', borderRadius: 6, fontWeight: 600, fontSize: 13,
          border: 'none',
          background: hasDoc ? 'var(--accent)' : 'var(--bg-active)',
          color: hasDoc ? '#fff' : 'var(--text-muted)',
          cursor: hasDoc ? 'pointer' : 'not-allowed',
        }}
      >
        Разместить текст (T)
      </button>
    </div>
  );
}
