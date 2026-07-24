import 'server-only';

const ROUTERAI_BASE_URL = 'https://routerai.ru/api/v1';
export const ROUTERAI_IMAGE_MODEL = process.env.ROUTERAI_IMAGE_MODEL || 'google/gemini-3.1-flash-lite-image';
export const ROUTERAI_TEXT_MODEL = process.env.ROUTERAI_TEXT_MODEL || 'google/gemini-3.5-flash-lite';

export class RouterAiRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'RouterAiRequestError';
  }
}

export function isRouterAiSafetyText(value: string) {
  const normalized = value.toLowerCase();
  return /safety|unsafe|policy|refus|cannot assist|can't help|не могу помочь|отказ/.test(normalized);
}

function upstreamMessage(status: number, body: string) {
  if (isRouterAiSafetyText(body)) return 'Модель отклонила этот фрагмент. Используйте локальное замывание.';
  if (status === 401 || status === 403) return 'Ключ RouterAI недействителен.';
  if (status === 402) return 'В RouterAI закончились средства.';
  if (status === 429) return 'Слишком много запросов к RouterAI. Попробуйте позже.';
  if (status >= 500) return 'RouterAI временно недоступен. Попробуйте позже.';
  return 'RouterAI не смог обработать фрагмент.';
}

export async function callRouterAi(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const apiKey = process.env.ROUTERAI_API_KEY;
  if (!apiKey) throw new RouterAiRequestError(503, 'ROUTERAI_API_KEY не настроен.');

  const response = await fetch(`${ROUTERAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal,
  });

  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    // Some upstream failures are plain text or HTML.
  }

  if (!response.ok) {
    // Error bodies are plain JSON/text, never base64 — safe to run keyword check here.
    const detail = typeof payload === 'object' && payload !== null
      ? JSON.stringify(payload).slice(0, 300)
      : raw.slice(0, 300);
    throw new RouterAiRequestError(response.status, upstreamMessage(response.status, detail));
  }

  // NOTE: do NOT call isRouterAiSafetyText(raw) on a successful response.
  // The raw string may contain megabytes of base64 image data where substrings
  // like "refus", "policy", "unsafe" appear by chance, causing false rejections
  // even when money was already spent and an image was returned.

  return payload;
}

export function routerAiErrorResponse(error: unknown): Response {
  if (error instanceof RouterAiRequestError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return Response.json({ error: 'Запрос отменён.' }, { status: 499, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json(
    { error: 'Внутренняя ошибка RouterAI.' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}
