/** Подбор кегля и переносов так, чтобы перевод вписался в бабл. */

export interface FitTextResult {
  fontSizePx: number;
  text: string;
  lines: string[];
}

export interface FitTextOptions {
  boxWidthPx: number;
  boxHeightPx: number;
  fontFamily: string;
  lineHeight?: number;
  minFontSizePx?: number;
  maxFontSizePx?: number;
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

function wrap(words: string[], fontSizePx: number, fontFamily: string, maxWidthPx: number): string[] | null {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current && measure(word, fontSizePx, fontFamily) > maxWidthPx) return null;
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, fontSizePx, fontFamily) <= maxWidthPx) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Сужаем строку, пока число строк не меняется — так блок выглядит «пирамидкой», как в манге. */
function balance(
  words: string[],
  fontSizePx: number,
  fontFamily: string,
  maxWidthPx: number,
  lineCount: number,
): string[] | null {
  let best: string[] | null = null;
  for (let factor = 0.95; factor >= 0.6; factor -= 0.05) {
    const candidate = wrap(words, fontSizePx, fontFamily, maxWidthPx * factor);
    if (candidate && candidate.length === lineCount) best = candidate;
    else if (candidate && candidate.length > lineCount) break;
  }
  return best;
}

export function normalizeTypography(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/\.\.\./g, '…')
    .replace(/(^|\s)-(\s)/g, '$1—$2')
    .trim();
}

export function fitTextToBox(rawText: string, options: FitTextOptions): FitTextResult {
  const text = normalizeTypography(rawText);
  const lineHeight = options.lineHeight ?? 1.15;
  const maxFont = Math.max(6, Math.round(options.maxFontSizePx ?? options.boxHeightPx));
  const minFont = Math.max(6, Math.round(options.minFontSizePx ?? 9));
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return { fontSizePx: minFont, text, lines: [] };

  for (let size = maxFont; size >= minFont; size--) {
    const lines = wrap(words, size, options.fontFamily, options.boxWidthPx);
    if (!lines) continue;
    if (lines.length * size * lineHeight > options.boxHeightPx) continue;
    const balanced = balance(words, size, options.fontFamily, options.boxWidthPx, lines.length) ?? lines;
    return { fontSizePx: size, lines: balanced, text: balanced.join('\n') };
  }

  const fallback = wrap(words, minFont, options.fontFamily, options.boxWidthPx) ?? [text];
  return { fontSizePx: minFont, lines: fallback, text: fallback.join('\n') };
}
