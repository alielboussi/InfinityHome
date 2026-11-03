import sharp from 'sharp';

/** Warehouse catalog import — EXIF upright + max dimension only (no AI, no auto-trim). */
export async function jpegBufferFromCatalogDirectUpload(imageBase64) {
  const trimmed = String(imageBase64 || '').trim();
  if (!trimmed) throw new Error('Product photo is required.');
  const payload = trimmed.includes(',') ? trimmed.split(',').pop() : trimmed;
  const buffer = Buffer.from(payload, 'base64');
  if (!buffer.length) throw new Error('Invalid photo data.');
  return sharp(buffer)
    .rotate()
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
