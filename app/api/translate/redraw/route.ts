import { requireImageFile } from '@/lib/clipdrop/server';
import {
  isRouterAiSafetyText,
  routerAiErrorResponse,
  RouterAiRequestError,
  ROUTERAI_IMAGE_MODEL,
} from '@/lib/routerai/server';

export const runtime = 'nodejs';
export const maxDuration = 90;

const ROUTERAI_IMAGES_URL = 'https://routerai.ru/api/v1/images/generations';
const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'] as const;

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

function aspectRatioFor(dimensions: ImageDimensions | null): string {
  if (!dimensions?.width || !dimensions.height) return '1:1';
  const ratio = dimensions.width / dimensions.height;
  return ASPECT_RATIOS.reduce((closest, candidate) => {
    const [w, h] = candidate.split(':').map(Number);
    const distance = Math.abs(Math.log(ratio / (w / h)));
    return distance < closest.distance ? { value: candidate, distance } : closest;
  }, { value: '1:1', distance: Number.POSITIVE_INFINITY }).value;
}

async function fileAsDataUrl(file: File): Promise<{ dataUrl: string; dimensions: ImageDimensions | null }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const dimensions = readPngDimensions(bytes) ?? readJpegDimensions(bytes) ?? readWebpDimensions(bytes);
  return {
    dataUrl: `data:${file.type || 'image/png'};base64,${bytes.toString('base64')}`,
    dimensions,
  };
}

function upstreamMessage(payload: unknown, raw: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).message === 'string') {
        return String((value as Record<string, unknown>).message).trim();
      }
    }
  }
  return raw.trim();
}

function pngResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}

async function generatedImageResponse(payload: unknown): Promise<Response> {
  const item = (payload as { data?: Array<{ b64_json?: unknown; url?: unknown }> } | null)?.data?.[0];
  if (!item) throw new RouterAiRequestError(502, 'Модель не вернула изображение.');
  if (typeof item.b64_json === 'string' && item.b64_json.trim()) {
    return pngResponse(Buffer.from(item.b64_json.replace(/\s/g, ''), 'base64'));
  }
  if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
    const imageResponse = await fetch(item.url, { cache: 'no-store' });
    if (!imageResponse.ok) throw new RouterAiRequestError(502, 'Не удалось скачать изображение от RouterAI.');
    return pngResponse(Buffer.from(await imageResponse.arrayBuffer()));
  }
  throw new RouterAiRequestError(502, 'Модель вернула изображение в неподдерживаемом формате.');
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ROUTERAI_API_KEY;
    if (!apiKey) throw new RouterAiRequestError(503, 'ROUTERAI_API_KEY не настроен.');
    const formData = await request.formData();
    const image = requireImageFile(formData.get('image_file'), 'image_file');
    const prompt = String(formData.get('prompt') ?? '').trim();
    if (!prompt) return Response.json({ error: 'Укажите, что нужно перерисовать.' }, { status: 400 });
    if (prompt.length > 2000) return Response.json({ error: 'Промпт слишком длинный.' }, { status: 400 });
    const input = await fileAsDataUrl(image);
    const response = await fetch(ROUTERAI_IMAGES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ROUTERAI_IMAGE_MODEL,
        prompt,
        n: 1,
        aspect_ratio: aspectRatioFor(input.dimensions),
        input_references: [{ type: 'image_url', image_url: { url: input.dataUrl } }],
      }),
      cache: 'no-store',
    });
    const raw = await response.text();
    let payload: unknown = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { /* preserve raw error below */ }
    if (!response.ok) {
      console.error('[RouterAI native image error]', { status: response.status, body: raw });
      const detail = upstreamMessage(payload, raw);
      if (isRouterAiSafetyText(detail)) {
        throw new RouterAiRequestError(response.status, 'Image-модель отклонила фрагмент. Перевести через OCR + шрифт?');
      }
      throw new RouterAiRequestError(response.status, detail || 'RouterAI не смог обработать изображение.');
    }
    return generatedImageResponse(payload);
  } catch (error) {
    return routerAiErrorResponse(error);
  }
}
