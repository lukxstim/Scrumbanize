/**
 * Profile pictures (US-21c) are made small in the browser before they are uploaded: a centered square, 256 × 256,
 * as WebP (PNG where a browser cannot write WebP). So a photo straight from a phone works, and the server needs no
 * image library.
 */

export const AVATAR_SIZE = 256;
/** Pictures larger than this are refused before they are even read. */
export const MAX_PICTURE_BYTES = 20 * 1024 * 1024;

/** The largest centered square of a width × height picture. */
export function squareCrop(width: number, height: number): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size };
}

export async function shrinkPicture(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('not_an_image');
  if (file.size > MAX_PICTURE_BYTES) throw new Error('too_large');
  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, size } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))), 'image/webp', 0.9),
    );
  } finally {
    bitmap.close();
  }
}
