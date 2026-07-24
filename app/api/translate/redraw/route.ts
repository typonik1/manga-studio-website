import { requireImageFile } from '@/lib/clipdrop/server';
import { callRouterAi, routerAiErrorResponse, RouterAiRequestError, ROUTERAI_IMAGE_MODEL } from '@/lib/routerai/server';

export const runtime = 'nodejs';
export const maxDuration = 90;

function fileToDataUrl(file: File): Promise<string> {
  return file.arrayBuffer().then(buffer => {
    const bytes = Buffer.from(buffer);
    return `data:${file.type};base64,${bytes.toString('base64')}`;
  });
}

function findDataUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const match = value.match(/data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+/i);
    return match?.[0] ?? null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDataUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) {
      const found = findDataUrl(item);
      if (found) return found;
    }
  }
  return null;
}

function dataUrlToResponse(dataUrl: string): Response {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw new RouterAiRequestError(502, 'Модель вернула изображение в неподдерживаемом формате.');
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': match[1].toLowerCase(),
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = requireImageFile(formData.get('image_file'), 'image_file');
    const prompt = String(formData.get('prompt') ?? '').trim();
    const seedValue = Number(formData.get('seed'));
    if (!prompt) return Response.json({ error: 'Укажите, что нужно перерисовать.' }, { status: 400 });
    if (prompt.length > 2000) return Response.json({ error: 'Промпт слишком длинный.' }, { status: 400 });

    const payload = await callRouterAi({
      model: ROUTERAI_IMAGE_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: await fileToDataUrl(image) } },
        ],
      }],
      modalities: ['image', 'text'],
      max_tokens: 2048,
      temperature: 0.4,
      ...(Number.isFinite(seedValue) ? { seed: Math.trunc(seedValue) } : {}),
    });
    const message = (payload as { choices?: Array<{ message?: unknown }> } | null)?.choices?.[0]?.message;
    const dataUrl = findDataUrl((message as { images?: unknown; content?: unknown } | null)?.images)
      ?? findDataUrl((message as { content?: unknown } | null)?.content);
    if (!dataUrl) throw new RouterAiRequestError(502, 'Модель не вернула изображение.');
    return dataUrlToResponse(dataUrl);
  } catch (error) {
    return routerAiErrorResponse(error);
  }
}
