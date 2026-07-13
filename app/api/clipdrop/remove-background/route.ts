import { callClipdrop, clipdropErrorResponse, requireImageFile } from '@/lib/clipdrop/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const input = await request.formData();
    const image = requireImageFile(input.get('image_file'), 'Изображение');
    const upstream = new FormData();
    upstream.append('image_file', image, image.name || 'image.png');
    return await callClipdrop('/remove-background/v1', upstream, request.signal);
  } catch (error) {
    return clipdropErrorResponse(error);
  }
}
