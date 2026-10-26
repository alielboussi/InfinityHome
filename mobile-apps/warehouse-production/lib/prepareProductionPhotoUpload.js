import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** Keep JSON body under Vercel's ~4.5MB limit (room for other fields). */
const MAX_UPLOAD_BASE64_CHARS = 2_400_000;

function resolvePhotoUri(source) {
  if (!source) return '';
  if (typeof source === 'string') return source.trim();
  const uri = String(source.uri || source.dataUri || '').trim();
  if (uri) return uri;
  const base64 = String(source.base64 || '').trim();
  if (!base64) return '';
  const mime = String(source.mimeType || 'image/jpeg').toLowerCase();
  return `data:${mime};base64,${base64}`;
}

/**
 * Shrink camera photos before upload (faster AI retouch, avoids 413 Request Entity Too Large).
 * @param {string|{ uri?: string, base64?: string, dataUri?: string, mimeType?: string }} source
 * @returns {Promise<string>} data:image/jpeg;base64,...
 */
export async function prepareProductionPhotoForUpload(source) {
  const input = resolvePhotoUri(source);
  if (!input) {
    throw new Error('Photo is required.');
  }

  const widths = [960, 800, 640, 512];
  const qualities = [0.62, 0.52, 0.42, 0.35];

  let lastBase64 = '';
  for (const width of widths) {
    for (const compress of qualities) {
      const result = await manipulateAsync(
        input,
        [{ resize: { width } }],
        {
          compress,
          format: SaveFormat.JPEG,
          base64: true,
        },
      );
      const base64 = String(result?.base64 || '').trim();
      if (!base64) continue;
      lastBase64 = base64;
      if (base64.length <= MAX_UPLOAD_BASE64_CHARS) {
        return `data:image/jpeg;base64,${base64}`;
      }
    }
  }

  if (lastBase64 && lastBase64.length <= MAX_UPLOAD_BASE64_CHARS) {
    return `data:image/jpeg;base64,${lastBase64}`;
  }

  throw new Error(
    'Photo is too large to upload. Retake closer to the seating item or update the app and try again.',
  );
}
