/** Подбор кегля и переносов так, чтобы перевод вписался в бабл, а не встал столбиком. */

export interface FitTextResult {
  fontSizePx: number;
  text: string;
  lines: string[];
  /** Во сколько раз пришлось расширить блок по горизонтали. */
  widthScale: number;
}

export interface FitTextOptions {
  boxWidthPx: number;
  boxHeightPx: number;
  fontFamily: string;
  lineHeight?: number;
  minFontSizePx?: number;
  maxFontSizePx?: number;
  /** Насколько можно раздать блок вширь: 1.4 = +40%. */
  maxWidthScale?: number;
  /** Насколько можно вылезти по высоте: 1.2 = +20%. */
  maxHeightScale?: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function ctx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) throw new Error('Canvas недоступен.');
  return measureCtx;
}

function measure(text: string, fontSizePx: number, fontFamily: string): number {
  const c = ctx();
  c.font = `${fontSizePx}px "${fontFamily}", sans-serif`;
  return c.measureText(text).width;
}

/** Ждём реальной загрузки шрифта — иначе замеры врут. */
export async function ensureFontLoaded(fontFamily: string, sizePx = 64): Promise<void> {
  try {
    await (document as any).fonts?.load(`${sizePx}px "${fontFamily}"`);
    await (document as any).fonts?.ready;
  } catch {
    /* шрифт недоступен — меряем системным */
  }
}

/** Слово шире строки рвём дефисом. Раньше такой случай ронял кегль до минимума. */
function splitLongWord(
  word: string,
  fontSizePx: number,
  fontFamily: string,
  maxWidthPx: number,
): string[] {
  const parts: string[] = [];
  let current = '';
  for (const char of word) {
    const candidate = current + char;
    if (current && measure(`${candidate}-`, fontSizePx, fontFamily) > maxWidthPx) {
      parts.push(`${current}-`);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [word];
}

function wrapWords(
  words: string[],
  fontSizePx: number,
  fontFamily: string,
  maxWidthPx: number,
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const pieces =
      measure(word, fontSizePx, fontFamily) > maxWidthPx
        ? splitLongWord(word, fontSizePx, fontFamily, maxWidthPx)
        : [word];

    pieces.forEach((piece, index) => {
      const forcedBreak = index < pieces.length - 1;
      const candidate = current ? `${current} ${piece}` : piece;
      if (!current || measure(candidate, fontSizePx, fontFamily) <= maxWidthPx) {
        current = candidate;
      } else {
        lines.push(current);
        current = piece;
      }
      if (forcedBreak) {
        lines.push(current);
        current = '';
      }
    });
  }
  if (current) lines.push(current);
  return lines;
}

function layout(text: string, fontSizePx: number, fontFamily: string, maxWidthPx: number): string[] {
  return text
    .split('\n')
    .flatMap((paragraph) =>
      wrapWords(paragraph.split(' ').filter(Boolean), fontSizePx, fontFamily, maxWidthPx),
    );
}

/** Сужаем строку, пока число строк не меняется — так блок выглядит «пирамидкой», как в манге. */
function balance(
  text: string,
  fontSizePx: number,
  fontFamily: string,
  maxWidthPx: number,
  lineCount: number,
): string[] | null {
  let best: string[] | null = null;
  for (let factor = 0.95; factor >= 0.6; factor -= 0.05) {
    const candidate = layout(text, fontSizePx, fontFamily, maxWidthPx * factor);
    if (candidate.length === lineCount) best = candidate;
    else if (candidate.length > lineCount) break;
  }
  return best;
}

/** Переносы строк из перевода сохраняем, лишние пробелы схлопываем. */
export function normalizeTypography(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\.\.\./g, '…')
    .replace(/(^|\s)-(\s)/g, '$1—$2')
    .trim();
}

export function fitTextToBox(rawText: string, options: FitTextOptions): FitTextResult {
  const text = normalizeTypography(rawText);
  const lineHeight = options.lineHeight ?? 1.15;
  const maxFont = Math.max(8, Math.round(options.maxFontSizePx ?? options.boxHeightPx));
  const minFont = Math.min(maxFont, Math.max(8, Math.round(options.minFontSizePx ?? 11)));
  const maxWidthScale = Math.max(1, options.maxWidthScale ?? 1.4);
  const heightLimit = options.boxHeightPx * Math.max(1, options.maxHeightScale ?? 1.2);

  if (!text) return { fontSizePx: minFont, text: '', lines: [], widthScale: 1 };

  const scales: number[] = [];
  for (let scale = 1; scale <= maxWidthScale + 1e-6; scale += 0.1) scales.push(Number(scale.toFixed(2)));

  // Кегль важнее ширины: берём самый крупный размер, который влезает хоть при какой-то ширине.
  for (let size = maxFont; size >= minFont; size--) {
    for (const scale of scales) {
      const widthPx = options.boxWidthPx * scale;
      const lines = layout(text, size, options.fontFamily, widthPx);
      if (lines.length * size * lineHeight > heightLimit) continue;
      const balanced = balance(text, size, options.fontFamily, widthPx, lines.length) ?? lines;
      return { fontSizePx: size, lines: balanced, text: balanced.join('\n'), widthScale: scale };
    }
  }

  const lines = layout(text, minFont, options.fontFamily, options.boxWidthPx * maxWidthScale);
  return { fontSizePx: minFont, lines, text: lines.join('\n'), widthScale: maxWidthScale };
}
