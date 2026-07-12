/**
 * Translation with quality priority:
 * 1. AI translation via our API route (Gemini through Vercel AI Gateway) —
 *    understands context, fixes OCR artifacts, natural colloquial phrasing.
 * 2. Google Translate free endpoint (unofficial, no key) as fallback.
 */

export type TranslateLang = 'en' | 'ru' | 'ja' | 'ko' | 'zh';

async function viaAI(text: string, from: TranslateLang, to: TranslateLang): Promise<string> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, from, to }),
  });
  if (!res.ok) throw new Error(`AI translate HTTP ${res.status}`);
  const json = (await res.json()) as { translation?: string };
  if (!json.translation) throw new Error('AI: пустой ответ');
  return json.translation;
}

/** Unofficial free Google Translate endpoint (same one Lingva proxies). */
async function viaGoogle(text: string, from: TranslateLang, to: TranslateLang): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}` +
    `&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const json = (await res.json()) as [Array<[string, string, ...unknown[]]>, ...unknown[]];
  const out = (json?.[0] ?? [])
    .map(seg => seg?.[0] ?? '')
    .join('')
    .trim();
  if (!out) throw new Error('Google: пустой ответ');
  return out;
}

// If the AI route fails once (e.g. gateway not configured), skip it
// for the rest of the session instead of adding latency to every block.
let aiUnavailable = false;

/** Translate text: AI first (best quality), Google free endpoint as fallback. */
export async function translateText(
  text: string,
  from: TranslateLang = 'en',
  to: TranslateLang = 'ru'
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (!aiUnavailable) {
    try {
      return await viaAI(trimmed, from, to);
    } catch {
      aiUnavailable = true;
    }
  }
  return await viaGoogle(trimmed, from, to);
}
