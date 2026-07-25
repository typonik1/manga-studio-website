import { requireImageFile } from '@/lib/clipdrop/server';
import {
  callRouterAi,
  routerAiErrorResponse,
  RouterAiRequestError,
  ROUTERAI_TEXT_MODEL,
  ROUTERAI_TEXT_MODEL_FALLBACK,
} from '@/lib/routerai/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'русский',
  en: 'английский',
  ja: 'японский',
  ko: 'корейский',
  zh: 'китайский',
};

type BlockKind = 'speech' | 'thought' | 'narration' | 'sfx';

interface PageBlock {
  original: string;
  translation: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: BlockKind;
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || 'image/jpeg'};base64,${bytes.toString('base64')}`;
}

function extractMessageText(payload: unknown): string {
  const message = (payload as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(
        (part) =>
          typeof part === 'string'
            ? part
            : typeof part === 'object' && part && 'text' in part
              ? String((part as any).text ?? '')
              : '',
      )
      .join('')
      .trim();
  }
  return '';
}

function parseLooseJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Модели отдают бокс по-разному: [x,y,w,h] 0..1, 0..1000 или box_2d [ymin,xmin,ymax,xmax]. */
function readBox(source: Record<string, unknown>): { x: number; y: number; width: number; height: number } | null {
  const scale = (value: number) => (Math.abs(value) > 1.5 ? value / 1000 : value);

  const box2d = source.box_2d ?? source.bbox_2d;
  if (Array.isArray(box2d) && box2d.length === 4) {
    const [yMin, xMin, yMax, xMax] = box2d.map(Number).map(scale);
    return {
      x: clamp01(xMin),
      y: clamp01(yMin),
      width: clamp01(xMax - xMin),
      height: clamp01(yMax - yMin),
    };
  }

  const box = source.box ?? source.bbox;
  if (Array.isArray(box) && box.length === 4) {
    const [x, y, w, h] = box.map(Number).map(scale);
    return { x: clamp01(x), y: clamp01(y), width: clamp01(w), height: clamp01(h) };
  }
  if (box && typeof box === 'object') {
    const record = box as Record<string, unknown>;
    const x = scale(Number(record.x));
    const y = scale(Number(record.y));
    const w = scale(Number(record.width));
    const h = scale(Number(record.height));
    if ([x, y, w, h].every(Number.isFinite)) {
      return { x: clamp01(x), y: clamp01(y), width: clamp01(w), height: clamp01(h) };
    }
  }
  return null;
}

function normalizeBlocks(value: unknown): PageBlock[] {
  const list = Array.isArray(value)
    ? value
    : Array.isArray((value as { blocks?: unknown })?.blocks)
      ? (value as { blocks: unknown[] }).blocks
      : [];

  const out: PageBlock[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const translation = String(record.translation ?? '').trim();
    const box = readBox(record);
    if (!translation || !box || box.width <= 0.005 || box.height <= 0.005) continue;
    const kind = String(record.kind ?? 'speech');
    out.push({
      original: String(record.original ?? '').trim(),
      translation,
      ...box,
      kind: (['speech', 'thought', 'narration', 'sfx'].includes(kind) ? kind : 'speech') as BlockKind,
    });
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = requireImageFile(formData.get('image_file'), 'image_file');
    const sourceLang = String(formData.get('source_lang') ?? 'en').trim();
    const targetLang = String(formData.get('target_lang') ?? 'ru').trim();
    const glossary = String(formData.get('glossary') ?? '')
      .trim()
      .slice(0, 1500);
    const sourceName = LANGUAGE_NAMES[sourceLang] ?? sourceLang;
    const targetName = LANGUAGE_NAMES[targetLang] ?? targetLang;

    const dataUrl = await fileToDataUrl(image);

    const instructions = [
      `Ты профессиональный переводчик манги и комиксов (${sourceName} → ${targetName}).`,
      'Найди на странице ВСЕ текстовые блоки: реплики в баблах, мысли, закадровый текст, надписи и звуки.',
      'Переводи страницу как единый диалог: сохраняй одно обращение (ты/вы), одинаковые имена, характер речи и эмоции.',
      'Исправляй очевидные артефакты распознавания. Перевод — живой разговорный, без пояснений и кавычек.',
      glossary ? `Обязательный глоссарий имён и терминов: ${glossary}` : '',
      'Верни СТРОГО JSON без markdown в виде массива объектов в порядке чтения:',
      '[{"original":"...","translation":"...","kind":"speech|thought|narration|sfx","box":[x,y,width,height]}]',
      'box — нормализованные координаты 0..1 относительно всей страницы: x,y — левый верхний угол текстового блока, width/height — его размеры. Бокс должен плотно охватывать буквы, не весь бабл.',
    ]
      .filter(Boolean)
      .join(' ');

    // Try primary model first, then fallback
    let payload: unknown;
    try {
      payload = await callRouterAi(
        {
          model: ROUTERAI_TEXT_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: instructions },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          temperature: 0.2,
        },
        request.signal,
      );
    } catch (primaryError) {
      // If primary model fails, try fallback
      try {
        payload = await callRouterAi(
          {
            model: ROUTERAI_TEXT_MODEL_FALLBACK,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: instructions },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
            temperature: 0.2,
          },
          request.signal,
        );
      } catch {
        // If fallback also fails, throw original error
        throw primaryError;
      }
    }

    const raw = extractMessageText(payload);
    if (!raw) throw new RouterAiRequestError(502, 'Модель не вернула текст страницы.');

    const blocks = normalizeBlocks(parseLooseJson(raw));
    return Response.json({ blocks }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return routerAiErrorResponse(error);
  }
}
