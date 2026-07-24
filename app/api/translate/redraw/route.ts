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
const MAX_LONG_SIDE = 768;

// ---------------------------------------------------------------------------
// Image dimension helpers
// ---------------------------------------------------------------------------

interface ImageDimensions {
  width: number;
  height: number;
}

function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof && offset + 7 < bytes.length) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function readWebpDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  if (bytes.toString('ascii', 12, 16) === 'VP8X') {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resize input image so long side ≤ 768 px (each generation costs ~3.5 ₽)
// ---------------------------------------------------------------------------

async function resizeToDataUrl(
  bytes: Buffer,
  mimeType: string,
): Promise<{ dataUrl: string; dimensions: ImageDimensions | null }> {
  const dimensions =
    readPngDimensions(bytes) ?? readJpegDimensions(bytes) ?? readWebpDimensions(bytes);

  let finalBytes = bytes;
  if (dimensions && Math.max(dimensions.width, dimensions.height) > MAX_LONG_SIDE) {
    try {
      // sharp is available in Next.js Node runtime
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sharp = require('sharp') as typeof import('sharp');
      finalBytes = await sharp(bytes)
        .resize(MAX_LONG_SIDE, MAX_LONG_SIDE, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      // sharp not installed — send original; log but do not fail
      console.warn('[redraw] sharp not available, sending original-size image');
    }
  }

  return {
    dataUrl: `data:${mimeType || 'image/png'};base64,${finalBytes.toString('base64')}`,
    dimensions,
  };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function pngResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}

function upstreamMessage(payload: unknown, raw: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>).message === 'string'
      ) {
        return String((value as Record<string, unknown>).message).trim();
      }
    }
  }
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Image extraction — all known OpenAI-compatible response shapes
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

/** Resolve a URL string (data: or https:) to raw bytes. */
async function resolveImageString(src: string): Promise<Buffer> {
  if (src.startsWith('data:')) {
    const match = src.match(/base64,([A-Za-z0-9+/=\s]+)/);
    if (!match) throw new RouterAiRequestError(502, 'data URL не содержит base64-данных.');
    return Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  }
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { cache: 'no-store' });
    if (!res.ok) throw new RouterAiRequestError(502, 'Не удалось скачать изображение от RouterAI.');
    return Buffer.from(await res.arrayBuffer());
  }
  throw new RouterAiRequestError(502, 'Неизвестный формат URL изображения от RouterAI.');
}

async function extractImageBytes(message: AnyRecord): Promise<Buffer | null> {
  // 1. message.images[0]
  const images = message.images;
  if (Array.isArray(images) && images.length > 0) {
    const img = images[0] as AnyRecord;

    // 1a. images[0].image_url.url  (data URL or https URL)
    const imageUrl = img.image_url as AnyRecord | undefined;
    if (typeof imageUrl?.url === 'string' && imageUrl.url) {
      return resolveImageString(imageUrl.url);
    }

    // 1b. images[0].url
    if (typeof img.url === 'string' && img.url) {
      return resolveImageString(img.url);
    }

    // 1c. images[0].b64_json
    if (typeof img.b64_json === 'string' && img.b64_json.trim()) {
      return Buffer.from(img.b64_json.replace(/\s/g, ''), 'base64');
    }
  }

  // 2. message.content as array — elements with type image_url / output_image / image
  if (Array.isArray(message.content)) {
    for (const part of message.content as AnyRecord[]) {
      const type = part.type as string | undefined;

      if (type === 'image_url') {
        const iu = part.image_url as AnyRecord | undefined;
        if (typeof iu?.url === 'string' && iu.url) return resolveImageString(iu.url);
      }

      if (type === 'output_image' || type === 'image') {
        if (typeof part.url === 'string' && part.url) return resolveImageString(part.url);
        if (typeof part.b64_json === 'string' && part.b64_json.trim()) {
          return Buffer.from(part.b64_json.replace(/\s/g, ''), 'base64');
        }
        // Some routers nest inside image_url
        const iu2 = part.image_url as AnyRecord | undefined;
        if (typeof iu2?.url === 'string' && iu2.url) return resolveImageString(iu2.url);
      }
    }
  }

  // 3. message.content as string containing an inline data:image/…;base64,… URL
  if (typeof message.content === 'string') {
    const match = message.content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=\s]+)/);
    if (match) {
      return Buffer.from(match[1].replace(/\s/g, ''), 'base64');
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

    const bytes = Buffer.from(await image.arrayBuffer());
    const { dataUrl } = await resizeToDataUrl(bytes, image.type);

    // --- POST to chat/completions (NOT /images/generations) ---
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
        max_tokens: 2048,
      }),
      cache: 'no-store',
    });

    const raw = await response.text();
    let payload: unknown = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { /* preserve raw error below */ }

    if (!response.ok) {
      console.error('[redraw] upstream error', { status: response.status, body: raw.slice(0, 500) });
      const detail = upstreamMessage(payload, raw);
      if (isRouterAiSafetyText(detail)) {
        throw new RouterAiRequestError(response.status, 'Image-модель отклонила фрагмент. Перевести через OCR + шрифт?');
      }
      throw new RouterAiRequestError(response.status, detail || 'RouterAI не смог обработать изображение.');
    }

    // --- Log response shape for diagnostics (base64 strings truncated) ---
    const message = (payload as { choices?: Array<{ message?: unknown }> } | null)?.choices?.[0]?.message;
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

    // --- Extract image from all known shapes ---
    const imageBytes = await extractImageBytes(message as AnyRecord);

    if (!imageBytes) {
      // Build a safe summary of message shape (no base64 blobs)
      const safeShape = JSON.stringify(
        message,
        (k, v) =>
          typeof v === 'string' && v.length > 80
            ? v.slice(0, 80) + `…[${v.length}]`
            : v,
      );
      console.error('[redraw] no image found in message. shape:', safeShape);
      return Response.json(
        { error: 'Модель не вернула изображение.', messageShape: JSON.parse(safeShape) },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return pngResponse(imageBytes);
  } catch (error) {
    return routerAiErrorResponse(error);
  }
}
