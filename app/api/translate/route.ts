import { generateText } from 'ai';

export const maxDuration = 30;

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
};

export async function POST(req: Request) {
  try {
    const { text, from, to } = (await req.json()) as {
      text?: string;
      from?: string;
      to?: string;
    };

    if (!text || typeof text !== 'string' || !text.trim()) {
      return Response.json({ error: 'Пустой текст' }, { status: 400 });
    }
    if (text.length > 5000) {
      return Response.json({ error: 'Слишком длинный текст' }, { status: 400 });
    }

    const fromName = LANG_NAMES[from ?? 'en'] ?? 'English';
    const toName = LANG_NAMES[to ?? 'ru'] ?? 'Russian';

    const { text: translated } = await generateText({
      model: 'google/gemini-3.5-flash',
      instructions:
        `You are a professional manga/comic translator. Translate the given ${fromName} text into natural, colloquial ${toName}. ` +
        `The text comes from OCR of a comic speech bubble, so it may contain recognition artifacts: ` +
        `fix obvious OCR errors (missing apostrophes, wrong letters, broken words) before translating. ` +
        `Keep the tone and emotion of the original (casual speech, exclamations, slang). ` +
        `Reply with ONLY the translation - no explanations, no quotes, no notes.`,
      prompt: text,
    });

    const out = translated.trim();
    if (!out) {
      return Response.json({ error: 'Пустой ответ модели' }, { status: 502 });
    }

    return Response.json({ translation: out });
  } catch (err) {
    console.log('[v0] Translate API error:', err);
    return Response.json({ error: 'Ошибка перевода' }, { status: 500 });
  }
}
