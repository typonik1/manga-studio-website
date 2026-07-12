/**
 * OCR via tesseract.js (free, runs fully in the browser).
 * Recognizes text blocks on an image and returns them with
 * normalized bounding boxes (0..1 relative to image size).
 */

import type { TranslateLang } from './translate';

export interface OcrLineBox {
  // normalized 0..1
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrParagraph {
  text: string;
  confidence: number;
  // normalized 0..1
  x: number;
  y: number;
  width: number;
  height: number;
  lineCount: number;
  lines: OcrLineBox[];
}

/** Map UI language codes to tesseract traineddata codes */
const OCR_LANGS: Record<TranslateLang, string> = {
  en: 'eng',
  ru: 'rus',
  ja: 'jpn',
  ko: 'kor',
  zh: 'chi_sim',
};

export async function recognizeParagraphs(
  imageSrc: string,
  lang: TranslateLang,
  onProgress?: (pct: number) => void
): Promise<OcrParagraph[]> {
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker(OCR_LANGS[lang], 1, {
    logger: m => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    const { data } = await worker.recognize(imageSrc, {}, { blocks: true });

    // Image dimensions for normalization
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('img load failed'));
      el.src = imageSrc;
    });
    const W = img.naturalWidth;
    const H = img.naturalHeight;

    const out: OcrParagraph[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        const text = (para.text ?? '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 2) continue;
        if (para.confidence < 35) continue; // skip garbage
        // Skip "paragraphs" that are just symbols/noise
        if (!/[a-zA-Zа-яА-ЯёЁ\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]{2,}/.test(text)) continue;

        const { x0, y0, x1, y1 } = para.bbox;
        const lines: OcrLineBox[] = (para.lines ?? []).map(l => ({
          x: l.bbox.x0 / W,
          y: l.bbox.y0 / H,
          width: (l.bbox.x1 - l.bbox.x0) / W,
          height: (l.bbox.y1 - l.bbox.y0) / H,
        }));
        out.push({
          text,
          confidence: para.confidence,
          x: x0 / W,
          y: y0 / H,
          width: (x1 - x0) / W,
          height: (y1 - y0) / H,
          lineCount: Math.max(1, para.lines?.length ?? 1),
          lines,
        });
      }
    }
    return out;
  } finally {
    await worker.terminate();
  }
}
