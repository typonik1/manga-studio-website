type ClipdropOperation = 'cleanup' | 'remove-background';

export class ClipdropClientError extends Error {}

async function runClipdrop(
  operation: ClipdropOperation,
  image: Blob,
  mask: Blob | null,
  signal?: AbortSignal,
): Promise<string> {
  const formData = new FormData();
  formData.append('image_file', image, 'image.png');
  if (mask) formData.append('mask_file', mask, 'mask.png');

  const response = await fetch(`/api/clipdrop/${operation}`, {
    method: 'POST',
    body: formData,
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new ClipdropClientError(payload?.error ?? 'Не удалось обработать изображение.');
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new ClipdropClientError('Сервер вернул неожиданный формат.');
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ClipdropClientError('Не удалось прочитать результат Clipdrop.'));
    reader.readAsDataURL(blob);
  });
}

export const cleanupWithClipdrop = (image: Blob, mask: Blob, signal?: AbortSignal) =>
  runClipdrop('cleanup', image, mask, signal);

export const removeBackgroundWithClipdrop = (image: Blob, signal?: AbortSignal) =>
  runClipdrop('remove-background', image, null, signal);
