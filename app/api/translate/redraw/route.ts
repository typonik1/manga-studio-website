import { requireImageFile } from '@/lib/clipdrop/server';
import {
  isRouterAiSafetyText,
  routerAiErrorResponse,
  RouterAiRequestError,
  ROUTERAI_IMAGE_MODEL,
} from '@/lib/routerai/server';

export const runtime = 'nodejs';
export const maxDuration = 90;

const ROUTERAI_BASE_URL = 'https://routerai.ru/api/v1';

// ---------------------------------------------------------------------------
// File size guard (client already downscales to ≤768 px, this is a backstop)
// ---------------------------------------------------------------------------
const MAX_INPUT_BYTES = 8 * 1024 * 1024; // 8 MB

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Return image bytes with the correct MIME type.
 *  src is the original URL/data-URL we resolved from — if it carries a mime, use it.
 */
function imageResponse(bytes: Buffer, srcMime?: string): Response {
  const contentType = srcMime?.startsWith('image/') ? srcMime : 'image/png';
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
  });
}

function upstreamErrorText(payload: unknown, raw: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 300);
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>).message === 'string'
      ) {
        return String((value as Record<string, unknown>).message).trim().slice(0, 300);
      }
    }
  }
  return raw.trim().slice(0, 300);
}

// ---------------------------------------------------------------------------
// Structural safety-refusal detection
//
// We intentionally do NOT run isRouterAiSafetyText() against the full raw body
// of a successful response:  the raw string may contain megabytes of base64
// where words like "refus", "policy", "unsafe" appear by chance, causing false
// rejections even though an image was returned and money was spent.
//
// We only check:
//  1. finish_reason === 'content_filter'
//  2. message.refusal is a non-empty string
//  3. No image was extracted AND message.content is a short text string that
//     contains safety keywords (i.e. the model replied with text instead of an image)
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

function isSafetyRefusal(message: AnyRecord, finishReason: unknown, imageFound: boolean): boolean {
  // Image already extracted → return it regardless of any safety signals.
  // The generation already cost money; discarding the result would be wasteful.
  if (imageFound) return false;

  // 1. Explicit content_filter signal (only relevant when no image)
  if (finishReason === 'content_filter') return true;

  // 2. OpenAI-style refusal field (only relevant when no image)
  if (typeof message.refusal === 'string' && message.refusal.trim()) return true;

  // 3. Model replied with a short text refusal instead of an image
  if (typeof message.content === 'string') {
    const contentText = message.content.trim();
    // Only flag if it's a short text reply (not a partial base64 blob)
    if (contentText.length < 2000 && isRouterAiSafetyText(contentText)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Image extraction — all known OpenAI-compatible response shapes, in order
// ---------------------------------------------------------------------------

/** Extract MIME type from a data URL, e.g. "data:image/webp;base64,..." → "image/webp" */
function mimeFromDataUrl(src: string): string | undefined {
  const m = src.match(/^data:(image\/[^;,]+)/);
  return m?.[1];
}

/** Resolve a URL string (data: or https:) to raw bytes, with optional MIME hint. */
async function resolveImageString(
  src: string,
  signal?: AbortSignal,
): Promise<{ bytes: Buffer; mime?: string }> {
  if (src.startsWith('data:')) {
    const match = src.match(/base64,([A-Za-z0-9+/=\s]+)/);
    if (!match) throw new RouterAiRequestError(502, 'data URL не содержит base64-данных.');
    return { bytes: Buffer.from(match[1].replace(/\s/g, ''), 'base64'), mime: mimeFromDataUrl(src) };
  }
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { cache: 'no-store', signal });
    if (!res.ok) throw new RouterAiRequestError(502, 'Не удалось скачать изображение от RouterAI.');
    const mime = res.headers.get('content-type')?.split(';')[0].trim();
    return { bytes: Buffer.from(await res.arrayBuffer()), mime };
  }
  throw new RouterAiRequestError(502, 'Неизвестный формат URL изображения от RouterAI.');
}

interface ExtractedImage {
  bytes: Buffer;
  mime?: string;
}

async function extractImage(message: AnyRecord, signal?: AbortSignal): Promise<ExtractedImage | null> {
  // 1. message.images[0]
  const images = message.images;
  if (Array.isArray(images) && images.length > 0) {
    const img = images[0] as AnyRecord;

    // 1a. images[0].image_url.url  (data URL or https URL)
    const imageUrl = img.image_url as AnyRecord | undefined;
    if (typeof imageUrl?.url === 'string' && imageUrl.url) {
      return resolveImageString(imageUrl.url, signal);
    }

    // 1b. images[0].url
    if (typeof img.url === 'string' && img.url) {
      return resolveImageString(img.url, signal);
    }

    // 1c. images[0].b64_json
    if (typeof img.b64_json === 'string' && img.b64_json.trim()) {
      return { bytes: Buffer.from(img.b64_json.replace(/\s/g, ''), 'base64') };
    }
  }

  // 2. message.content as array — elements with type image_url / output_image / image
  if (Array.isArray(message.content)) {
    for (const part of message.content as AnyRecord[]) {
      const type = part.type as string | undefined;

      if (type === 'image_url') {
        const iu = part.image_url as AnyRecord | undefined;
        if (typeof iu?.url === 'string' && iu.url) return resolveImageString(iu.url, signal);
      }

      if (type === 'output_image' || type === 'image') {
        if (typeof part.url === 'string' && part.url) return resolveImageString(part.url, signal);
        if (typeof part.b64_json === 'string' && part.b64_json.trim()) {
          return { bytes: Buffer.from(part.b64_json.replace(/\s/g, ''), 'base64') };
        }
        // Some routers nest inside image_url
        const iu2 = part.image_url as AnyRecord | undefined;
        if (typeof iu2?.url === 'string' && iu2.url) return resolveImageString(iu2.url, signal);
      }
    }
  }

  // 3. message.content as string containing an inline data:image/…;base64,… URL
  if (typeof message.content === 'string') {
    const dataUrlMatch = message.content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+)/);
    if (dataUrlMatch) {
      return resolveImageString(dataUrlMatch[1], signal);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route handler  —  POST /api/translate/redraw
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ROUTERAI_API_KEY;
    if (!apiKey) throw new RouterAiRequestError(503, 'ROUTERAI_API_KEY не настроен.');

    const formData = await request.formData();
    const image = requireImageFile(formData.get('image_file'), 'image_file');
    const prompt = String(formData.get('prompt') ?? '').trim();
    if (!prompt) return Response.json({ error: 'Укажите, что нужно перерисовать.' }, { status: 400 });
    if (prompt.length > 2000) return Response.json({ error: 'Промпт слишком длинный.' }, { status: 400 });

    // File size backstop (client-side resize should keep this well below 3 MB)
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length > MAX_INPUT_BYTES) {
      return Response.json({ error: `Изображение слишком большое (${(bytes.length / 1024 / 1024).toFixed(1)} МБ > 8 МБ).` }, { status: 413 });
    }

    const dataUrl = `data:${image.type || 'image/jpeg'};base64,${bytes.toString('base64')}`;

    // Propagate abort signal so cancelled requests don't keep billing us
    const signal = request.signal;

    const response = await fetch(`${ROUTERAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ROUTERAI_IMAGE_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: prompt },
            ],
          },
        ],
        max_tokens: 4096,
      }),
      cache: 'no-store',
      signal,
    });

    const raw = await response.text();
    let payload: unknown = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { /* preserve raw error below */ }

    if (!response.ok) {
      // Error bodies are plain JSON/text, never base64 — keyword check is safe here
      console.error('[redraw] upstream error', { status: response.status, body: raw.slice(0, 500) });
      const detail = upstreamErrorText(payload, raw);
      if (isRouterAiSafetyText(detail)) {
        throw new RouterAiRequestError(response.status, 'Image-модель отклонила фрагмент. Перевести через OCR + шрифт?');
      }
      throw new RouterAiRequestError(response.status, detail || 'RouterAI не смог обработать изображение.');
    }

    // --- Log response shape for diagnostics (base64 truncated to avoid log spam) ---
    const choice = (payload as { choices?: Array<{ message?: unknown; finish_reason?: unknown }> } | null)?.choices?.[0];
    const message = choice?.message;
    const finishReason = choice?.finish_reason;

    console.log(
      '[redraw] response shape',
      JSON.stringify(
        message,
        (k, v) =>
          typeof v === 'string' && v.length > 100
            ? v.slice(0, 100) + `…[${v.length}]`
            : v,
        2,
      ),
    );

    if (!message || typeof message !== 'object') {
      throw new RouterAiRequestError(502, 'Ответ RouterAI не содержит message.');
    }

    const msg = message as AnyRecord;

    // --- Extract image from all known shapes ---
    const extracted = await extractImage(msg, signal);

    // --- Structural safety check (only runs when no image was found) ---
    if (isSafetyRefusal(msg, finishReason, extracted !== null)) {
      throw new RouterAiRequestError(451, 'Image-модель отклонила фрагмент. Перевести через OCR + шрифт?');
    }

    if (!extracted) {
      // Specific message when the response was simply cut off by the token limit
      if (finishReason === 'length') {
        console.error('[redraw] response truncated by token limit (finish_reason=length)');
        throw new RouterAiRequestError(502, 'Ответ модели обрезан лимитом токенов — изображение не получено. Попробуйте уменьшить выделение.');
      }

      // Log shape without base64 for debugging; do NOT include in response body
      const safeShape = JSON.stringify(
        msg,
        (k, v) =>
          typeof v === 'string' && v.length > 80
            ? v.slice(0, 80) + `…[${v.length}]`
            : v,
      );
      console.error('[redraw] no image found in message. shape:', safeShape);
      return Response.json(
        { error: 'Модель не вернула изображение.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return imageResponse(extracted.bytes, extracted.mime);
  } catch (error) {
    return routerAiErrorResponse(error);
  }
}
