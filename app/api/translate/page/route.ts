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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageBlock extends Box {
  original: string;
  translation: string;
  kind: BlockKind;
  /** Весь бабл/плашка фона — в него вписываем перевод. Бокс выше — только буквы. */
  bubble?: Box;
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

/** Модели путают шкалу: отдают 0..1 или 0..1000. */
const scale = (value: number) => (Math.abs(value) > 1.5 ? value / 1000 : value);

/** Формат [ymin, xmin, ymax, xmax] (box_2d у Gemini). */
function boxFrom2d(value: unknown): Box | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const [yMin, xMin, yMax, xMax] = value.map(Number).map(scale);
  if (![yMin, xMin, yMax, xMax].every(Number.isFinite)) return null;
  return {
    x: clamp01(xMin),
    y: clamp01(yMin),
    width: clamp01(xMax - xMin),
    height: clamp01(yMax - yMin),
  };
}

/** Формат [x, y, width, height] или { x, y, width, height }. */
function boxFromXywh(value: unknown): Box | null {
  if (Array.isArray(value) && value.length === 4) {
    const [x, y, w, h] = value.map(Number).map(scale);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return { x: clamp01(x), y: clamp01(y), width: clamp01(w), height: clamp01(h) };
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const x = scale(Number(record.x));
    const y = scale(Number(record.y));
    const w = scale(Number(record.width ?? record.w));
    const h = scale(Number(record.height ?? record.h));
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return { x: clamp01(x), y: clamp01(y), width: clamp01(w), height: clamp01(h) };
  }
  return null;
}

const isUsableBox = (box: Box | null): box is Box => !!box && box.width > 0.005 && box.height > 0.005;

function readTextBox(source: Record<string, unknown>): Box | null {
  return boxFrom2d(source.box_2d ?? source.bbox_2d) ?? boxFromXywh(source.box ?? source.bbox);
}

function readBubbleBox(source: Record<string, unknown>): Box | null {
  return (
    boxFrom2d(source.bubble_2d) ??
    boxFromXywh(source.bubble ?? source.bubble_box ?? source.balloon ?? source.area)
  );
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
    const box = readTextBox(record);
    if (!translation || !isUsableBox(box)) continue;

    const bubbleCandidate = readBubbleBox(record);
    // Бабл должен быть не меньше текста, иначе это мусорный бокс.
    const bubble =
      isUsableBox(bubbleCandidate) &&
      bubbleCandidate.width >= box.width * 0.9 &&
      bubbleCandidate.height >= box.height * 0.9
        ? bubbleCandidate
        : undefined;

    const kind = String(record.kind ?? 'speech');
    out.push({
      original: String(record.original ?? '').trim(),
      translation,
      ...box,
      bubble,
      kind: (['speech', 'thought', 'narration', 'sfx'].includes(kind) ? kind : 'speech') as BlockKind,
    });
  }
  return out;
}

/**
 * Пустой результат — это не ошибка: страница может быть без текста.
 * Различаем «модель не ответила» (throw) и «блоков ноль» (пустой массив).
 */
async function runModel(
  model: string,
  instructions: string,
  dataUrl: string,
  signal?: AbortSignal,
): Promise<PageBlock[]> {
  const payload = await callRouterAi(
    {
      model,
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
    signal,
  );

  const raw = extractMessageText(payload);
  if (!raw) throw new RouterAiRequestError(502, 'Модель не вернула текст страницы.');
  return normalizeBlocks(parseLooseJson(raw));
}

const jsonBlocks = (blocks: PageBlock[]) =>
  Response.json({ blocks }, { headers: { 'Cache-Control': 'no-store' } });

/** Повторяем запасной моделью только на лимитах и сбоях провайдера. */
function isRetriable(error: unknown): boolean {
  return (
    error instanceof RouterAiRequestError &&
    (error.status === 429 || (error.status >= 500 && error.status < 600))
  );
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
      'Сначала мысленно пересчитай ВСЕ текстовые области на странице, потом верни их все до единой.',
      'На обычной странице их 5–20: реплики в баблах, мысли, шёпот мелким кеглем, закадровый текст в рамках, надписи на вывесках и одежде, звуки (sfx).',
      'Каждый бабл — ОТДЕЛЬНЫЙ объект. Не склеивай соседние баблы в один блок и не разбивай один бабл на строки. Ничего не пропускай, даже если текст мелкий, наклонный или частично перекрыт.',
      'Переводи страницу как единый диалог: одно обращение (ты/вы), одинаковые имена, характер речи и эмоции.',
      'Исправляй очевидные артефакты распознавания. Перевод — живой разговорный, без пояснений и кавычек.',
      glossary ? `Обязательный глоссарий имён и терминов: ${glossary}` : '',
      'Верни СТРОГО JSON без markdown в виде массива объектов в порядке чтения:',
      '[{"original":"...","translation":"...","kind":"speech|thought|narration|sfx","box":[x,y,width,height],"bubble":[x,y,width,height]}]',
      'box — нормализованные координаты 0..1: прямоугольник ПЛОТНО по буквам оригинала (по нему стирается старый текст).',
      'bubble — прямоугольник ВСЕЙ области фона: весь белый овал бабла, вся плашка, вся рамка закадрового текста. Он всегда больше box. Для sfx и надписей без бабла повтори box, увеличенный примерно на 20%.',
      'Порядок чтения: для японской манги справа налево и сверху вниз, для остального — слева направо.',
      'Если текста на странице нет вообще — верни пустой массив [].',
    ]
      .filter(Boolean)
      .join(' ');

    const canFallback = ROUTERAI_TEXT_MODEL_FALLBACK !== ROUTERAI_TEXT_MODEL;

    let primaryError: unknown = null;
    try {
      const blocks = await runModel(ROUTERAI_TEXT_MODEL, instructions, dataUrl, request.signal);
      // Основная модель справилась — второй запрос делаем только если она нашла ноль блоков.
      if (blocks.length > 0 || !canFallback) return jsonBlocks(blocks);
    } catch (error) {
      if (!isRetriable(error) || !canFallback) throw error;
      primaryError = error;
    }

    try {
      const blocks = await runModel(ROUTERAI_TEXT_MODEL_FALLBACK, instructions, dataUrl, request.signal);
      return jsonBlocks(blocks);
    } catch (fallbackError) {
      // Если основная модель отработала штатно и просто ничего не нашла —
      // это не ошибка сети, а пустая страница.
      if (!primaryError) return jsonBlocks([]);
      throw primaryError ?? fallbackError;
    }
  } catch (error) {
    return routerAiErrorResponse(error);
  }
}
