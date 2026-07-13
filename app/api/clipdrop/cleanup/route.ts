import { callClipdrop, clipdropErrorResponse, requireImageFile } from '@/lib/clipdrop/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const input = await request.formData();
    const image = requireImageFile(input.get('image_file'), 'Изображение');
    const mask = requireImageFile(input.get('mask_file'), 'Маска');
    const upstream = new FormData();
    upstream.append('image_file', image, image.name || 'image.png');
    upstream.append('mask_file', mask, mask.name || 'mask.png');
    return await callClipdrop('/cleanup/v1', upstream, request.signal);
  } catch (error) {
    return clipdropErrorResponse(error);
  }
}
