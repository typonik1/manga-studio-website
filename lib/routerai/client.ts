export class RouterAiClientError extends Error {}

export const IMAGE_MODEL_ESTIMATED_COST_USD = Number(process.env.NEXT_PUBLIC_ROUTERAI_IMAGE_COST_USD) || 0.02;
let imageCalls = 0;

export function getImageUsage() {
  return { calls: imageCalls, estimatedCostUsd: imageCalls * IMAGE_MODEL_ESTIMATED_COST_USD };
}

function imageFilename(blob: Blob, basename: string) {
  if (blob.type === 'image/jpeg') return `${basename}.jpg`;
  if (blob.type === 'image/webp') return `${basename}.webp`;
  return `${basename}.png`;
}

async function readError(response: Response, fallback: string) {
  if (response.status === 413) return 'Фрагмент слишком большой. Уменьшите выделение.';
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error ?? fallback;
}

export async function ocrTranslate(
  image: Blob,
  targetLang: string,
  signal?: AbortSignal,
): Promise<{ original: string; translation: string }> {
  const formData = new FormData();
  formData.append('image_file', image, imageFilename(image, 'bubble'));
  formData.append('target_lang', targetLang);
  const response = await fetch('/api/translate/ocr', { method: 'POST', body: formData, signal });
  if (!response.ok) throw new RouterAiClientError(await readError(response, 'Не удалось обработать фрагмент.'));
  const payload = await response.json() as { original?: unknown; translation?: unknown };
  return {
    original: typeof payload.original === 'string' ? payload.original : '',
    translation: typeof payload.translation === 'string' ? payload.translation : '',
  };
}

export async function redrawRegion(image: Blob, prompt: string, signal?: AbortSignal, options?: { seed?: number }): Promise<string> {
  imageCalls += 1;
  const formData = new FormData();
  formData.append('image_file', image, imageFilename(image, 'region'));
  formData.append('prompt', prompt);
  if (Number.isFinite(options?.seed)) formData.append('seed', String(Math.trunc(options!.seed!)));
  const response = await fetch('/api/translate/redraw', { method: 'POST', body: formData, signal });
  if (!response.ok) throw new RouterAiClientError(await readError(response, 'Не удалось обработать фрагмент.'));
  const result = await response.blob();
  if (!result.type.startsWith('image/')) throw new RouterAiClientError('Сервер вернул неожиданный формат изображения.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new RouterAiClientError('Не удалось прочитать результат RouterAI.'));
    reader.readAsDataURL(result);
  });
}
