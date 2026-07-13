import 'server-only';

const CLIPDROP_BASE_URL = 'https://clipdrop-api.co';
export const MAX_CLIPDROP_FILE_SIZE = 30 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export class ClipdropRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requireImageFile(value: FormDataEntryValue | null, label: string): File {
  if (!(value instanceof File) || value.size === 0) {
    throw new ClipdropRequestError(400, `${label} не передано.`);
  }
  if (!ALLOWED_IMAGE_TYPES.has(value.type)) {
    throw new ClipdropRequestError(415, `${label}: поддерживаются PNG, JPEG и WebP.`);
  }
  if (value.size > MAX_CLIPDROP_FILE_SIZE) {
    throw new ClipdropRequestError(413, `${label} превышает лимит 30 МБ.`);
  }
  return value;
}

function upstreamMessage(status: number): string {
  if (status === 400) return 'Clipdrop отклонил изображение или маску.';
  if (status === 401 || status === 403) return 'Ключ Clipdrop недействителен или не имеет доступа.';
  if (status === 402) return 'На аккаунте Clipdrop закончились кредиты.';
  if (status === 429) return 'Слишком много запросов к Clipdrop. Попробуйте позже.';
  if (status >= 500) return 'Clipdrop временно недоступен. Попробуйте позже.';
  return 'Не удалось обработать изображение в Clipdrop.';
}

export async function callClipdrop(
  endpoint: '/cleanup/v1' | '/remove-background/v1',
  formData: FormData,
  signal: AbortSignal,
): Promise<Response> {
  const apiKey = process.env.CLIPDROP_API_KEY;
  if (!apiKey) throw new ClipdropRequestError(503, 'CLIPDROP_API_KEY не настроен.');

  const response = await fetch(`${CLIPDROP_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: formData,
    cache: 'no-store',
    signal,
  });

  if (!response.ok) throw new ClipdropRequestError(response.status, upstreamMessage(response.status));
  const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
  if (!contentType.startsWith('image/')) {
    throw new ClipdropRequestError(502, 'Clipdrop вернул неожиданный формат ответа.');
  }
  return new Response(response.body, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
  });
}

export function clipdropErrorResponse(error: unknown): Response {
  if (error instanceof ClipdropRequestError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return Response.json({ error: 'Запрос отменён.' }, { status: 499 });
  }
  return Response.json({ error: 'Внутренняя ошибка обработки изображения.' }, { status: 500 });
}
