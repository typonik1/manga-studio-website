/**
 * Free translation using the MyMemory API (no API key required).
 * https://mymemory.translated.net/doc/spec.php
 * Fallback: Lingva (a free Google Translate front-end).
 */

export type TranslateLang = 'en' | 'ru' | 'ja' | 'ko' | 'zh';

interface MyMemoryResponse {
  responseStatus: number;
  responseData?: { translatedText?: string };
}

async function viaMyMemory(text: string, from: TranslateLang, to: TranslateLang): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const json = (await res.json()) as MyMemoryResponse;
  const out = json.responseData?.translatedText;
  if (json.responseStatus !== 200 || !out) throw new Error('MyMemory: пустой ответ');
  return out;
}

interface LingvaResponse {
  translation?: string;
}

async function viaLingva(text: string, from: TranslateLang, to: TranslateLang): Promise<string> {
  const url = `https://lingva.ml/api/v1/${from}/${to}/${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Lingva HTTP ${res.status}`);
  const json = (await res.json()) as LingvaResponse;
  if (!json.translation) throw new Error('Lingva: пустой ответ');
  return json.translation;
}

/** Translate text; tries MyMemory first, falls back to Lingva. */
export async function translateText(
  text: string,
  from: TranslateLang = 'en',
  to: TranslateLang = 'ru'
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  // MyMemory limit is 500 bytes per request — split long text by lines
  if (trimmed.length > 450) {
    const lines = trimmed.split('\n');
    const out: string[] = [];
    for (const line of lines) {
      out.push(line.trim() ? await translateText(line, from, to) : line);
    }
    return out.join('\n');
  }
  try {
    return await viaMyMemory(trimmed, from, to);
  } catch {
    return await viaLingva(trimmed, from, to);
  }
}
