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

/* ------------------------------------------------------------------
 * Геометрия: модели путают и масштаб (0..1 / 0..100 / 0..1000),
 * и порядок чисел ([x,y,w,h] против gemini-шного [ymin,xmin,ymax,xmax]).
 * Разбираем бокс целиком и выбираем ту трактовку, которая реально
 * помещается на странице, — иначе замывка ляжет мимо текста.
 * ------------------------------------------------------------------ */

type Quad = [number, number, number, number];
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Возможные шкалы: 0..1, 0..1000 (box_2d у Gemini), 0..100 (проценты). */
function quadCandidates(raw: unknown): Quad[] {
  if (!Array.isArray(raw) || raw.length !== 4) return [];
  const values = raw.map(Number);
  if (!values.every(Number.isFinite)) return [];
  const max = Math.max(...values.map(Math.abs));
  // Делитель не угадываем: пробуем все разумные и берём тот, что даёт
  // бокс, реально помещающийся на странице. 1000 идёт первым — это
  // родная шкала vision-моделей, проценты встречаются намного реже.
  const divisors = max <= 1.5 ? [1] : max <= 100 ? [1000, 100] : [1000];
  return divisors.map((divisor) => values.map((value) => value / divisor) as Quad);
}

const rectFromXywh = ([x, y, width, height]: Quad): Box => ({ x, y, width, height });
const rectFromLtrb = ([yMin, xMin, yMax, xMax]: Quad): Box => ({
  x: xMin,
  y: yMin,
  width: xMax - xMin,
  height: yMax - yMin,
});

/** Текстовый блок не может быть отрицательным, вылезать за лист или занимать его целиком. */
function isPlausibleBox(box: Box | null): box is Box {
  if (!box) return false;
  const { x, y, width, height } = box;
  if (![x, y, width, height].every(Number.isFinite)) return false;
  if (width <= 0.005 || height <= 0.005) return false;
  if (x < -0.02 || y < -0.02) return false;
  if (x + width > 1.02 || y + height > 1.02) return false;
  if (width * height > 0.6) return false;
  return true;
}

/** preferred — трактовка по имени поля (box_2d → ltrb, box → xywh). */
function boxFromArray(value: unknown, preferred: 'xywh' | 'ltrb'): Box | null {
  for (const quad of quadCandidates(value)) {
    const ordered =
      preferred === 'ltrb'
        ? [rectFromLtrb(quad), rectFromXywh(quad)]
        : [rectFromXywh(quad), rectFromLtrb(quad)];
    const hit = ordered.find(isPlausibleBox);
    if (hit) return hit;
  }
  return null;
}

function boxFromObject(value: unknown): Box | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const raw = Number(record[key]);
      if (Number.isFinite(raw)) return raw;
    }
    return NaN;
  };
  const x = pick('x', 'left', 'x1', 'xmin');
  const y = pick('y', 'top', 'y1', 'ymin');
  const width = pick('width', 'w');
  const height = pick('height', 'h');
  const x2 = pick('x2', 'right', 'xmax');
  const y2 = pick('y2', 'bottom', 'ymax');
  const quad: number[] | null =
    Number.isFinite(width) && Number.isFinite(height)
      ? [x, y, width, height]
      : Number.isFinite(x2) && Number.isFinite(y2)
        ? [x, y, x2 - x, y2 - y]
        : null;
  if (!quad || !quad.every(Number.isFinite)) return null;
  for (const candidate of quadCandidates(quad)) {
    const box = rectFromXywh(candidate);
    if (isPlausibleBox(box)) return box;
  }
  return null;
}

function readBoxValue(value: unknown, preferred: 'xywh' | 'ltrb'): Box | null {
  return boxFromObject(value) ?? boxFromArray(value, preferred);
}

function readTextBox(source: Record<string, unknown>): Box | null {
  return (
    readBoxValue(source.box_2d ?? source.bbox_2d, 'ltrb') ??
    readBoxValue(source.box ?? source.bbox, 'xywh')
  );
}

function readBubbleBox(source: Record<string, unknown>): Box | null {
  return (
    readBoxValue(source.bubble_2d, 'ltrb') ??
    readBoxValue(source.bubble ?? source.bubble_box ?? source.balloon ?? source.area, 'xywh')
  );
}

function clampBox(box: Box): Box {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  return {
    x,
    y,
    width: Math.min(1 - x, Math.max(0.005, box.width)),
    height: Math.min(1 - y, Math.max(0.005, box.height)),
  };
}

/** Бабл обязан накрывать свои же буквы, иначе это координаты от другого блока. */
function coversMost(outer: Box, inner: Box): boolean {
  const overlapX = Math.max(
    0,
    Math.min(outer.x + outer.width, inner.x + inner.width) - Math.max(outer.x, inner.x),
  );
  const overlapY = Math.max(
    0,
    Math.min(outer.y + outer.height, inner.y + inner.height) - Math.max(outer.y, inner.y),
  );
  return overlapX * overlapY >= inner.width * inner.height * 0.7;
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
    const rawBox = readTextBox(record);
    if (!translation || !isPlausibleBox(rawBox)) continue;
    const box = clampBox(rawBox);

    const bubbleCandidate = readBubbleBox(record);
    // Бабл берём только если он правдоподобен, заметно больше букв
    // и действительно их накрывает. Иначе клиент сам расширит бокс.
    const bubble =
      isPlausibleBox(bubbleCandidate) &&
      bubbleCandidate.width * bubbleCandidate.height >= box.width * box.height * 1.15 &&
      coversMost(bubbleCandidate, box)
        ? clampBox(bubbleCandidate)
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
      '[{"original":"...","translation":"...","kind":"speech|thought|narration|sfx","box":{"x":0.0,"y":0.0,"width":0.0,"height":0.0},"bubble":{"x":0.0,"y":0.0,"width":0.0,"height":0.0}}]',
      'Координаты ОБЯЗАТЕЛЬНО объектом с ключами x, y, width, height — не массивом и не в порядке ymin/xmin/ymax/xmax.',
      'x и y — левый верхний угол, доли ширины и высоты страницы от 0 до 1. width и height — размеры, тоже доли от 0 до 1. Проверь, что x + width ≤ 1 и y + height ≤ 1.',
      'box — прямоугольник ПЛОТНО по буквам оригинала: по нему стирается старый текст, поэтому он должен совпадать с текстом до нескольких пикселей.',
      'bubble — прямоугольник ВСЕЙ области фона: весь белый овал бабла, вся плашка, вся рамка закадрового текста. Он всегда больше box и полностью его содержит. Для sfx и надписей без бабла повтори box, увеличенный примерно на 20%.',
      'Один блок — один бабл: box никогда не занимает половину страницы.',
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
