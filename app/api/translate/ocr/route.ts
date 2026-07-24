import { requireImageFile } from '@/lib/clipdrop/server';
import { callRouterAi, routerAiErrorResponse, RouterAiRequestError } from '@/lib/routerai/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'русский',
  en: 'английский',
  ja: 'японский',
  ko: 'корейский',
  zh: 'китайский',
};

function fileToDataUrl(file: File): Promise<string> {
  return file.arrayBuffer().then(buffer => {
    const bytes = Buffer.from(buffer);
    return `data:${file.type};base64,${bytes.toString('base64')}`;
  });
}

function extractMessageText(payload: unknown): string {
  const message = (payload as { choices?: Array<{ message?: { content?: unknown } }> } | null)
    ?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null && 'text' in part) return String(part.text ?? '');
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

function parseTranslation(raw: string): { original: string; translation: string } {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { original?: unknown; translation?: unknown };
    return {
      original: typeof parsed.original === 'string' ? parsed.original.trim() : '',
      translation: typeof parsed.translation === 'string' ? parsed.translation.trim() : '',
    };
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { original?: unknown; translation?: unknown };
        return {
          original: typeof parsed.original === 'string' ? parsed.original.trim() : '',
          translation: typeof parsed.translation === 'string' ? parsed.translation.trim() : '',
        };
      } catch {
        // Fall through to the raw model response.
      }
    }
  }
  return { original: '', translation: cleaned };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = requireImageFile(formData.get('image_file'), 'image_file');
    const targetLang = String(formData.get('target_lang') ?? 'ru').trim() || 'ru';
    const targetName = LANGUAGE_NAMES[targetLang] ?? targetLang;
    const dataUrl = await fileToDataUrl(image);
    const payload = await callRouterAi({
      model: 'google/gemini-3.5-flash-lite',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Распознай весь текст на этом фрагменте манги и переведи на ${targetName}. Верни СТРОГО JSON без markdown: {"original": "...", "translation": "..."}. Перевод должен быть естественным разговорным, подходящим для манги.`,
          },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      temperature: 0.2,
    });
    const raw = extractMessageText(payload);
    if (!raw) throw new RouterAiRequestError(502, 'Модель отклонила этот фрагмент. Используйте локальное замывание.');
    return Response.json(parseTranslation(raw), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return routerAiErrorResponse(error);
  }
}
