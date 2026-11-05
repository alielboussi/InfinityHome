import * as FileSystem from 'expo-file-system';

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

async function loadImageManipulator() {
  try {
    return await import('expo-image-manipulator');
  } catch {
    throw new Error(
      'Photo compression module is missing. Reinstall the Production app from the latest build.',
    );
  }
}

/** Camera URIs (content:// on Android) must be copied before manipulateAsync. */
async function normalizeCameraPhotoUri(uri) {
  const trimmed = String(uri || '').trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('file://') && !trimmed.includes('content://')) {
    return trimmed;
  }
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return trimmed;
  const dest = `${cacheDir}production-upload-${Date.now()}.jpg`;
  try {
    await FileSystem.copyAsync({ from: trimmed, to: dest });
    return dest.startsWith('file://') ? dest : `file://${dest}`;
  } catch {
    return trimmed;
  }
}

/**
 * Shrink camera photos before upload (faster AI retouch, avoids 413 Request Entity Too Large).
 * @param {string|{ uri?: string, base64?: string, dataUri?: string, mimeType?: string }} source
 * @returns {Promise<string>} data:image/jpeg;base64,...
 */
export async function prepareProductionPhotoForUpload(source) {
  let input = resolvePhotoUri(source);
  if (!input) {
    throw new Error('Photo is required.');
  }
  input = await normalizeCameraPhotoUri(input);

  const { manipulateAsync, SaveFormat } = await loadImageManipulator();

  const attempts = [
    { width: 720, compress: 0.52 },
    { width: 640, compress: 0.44 },
    { width: 520, compress: 0.36 },
  ];

  let lastBase64 = '';
  for (const { width, compress } of attempts) {
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

  if (lastBase64) {
    return `data:image/jpeg;base64,${lastBase64}`;
  }

  throw new Error(
    'Photo is too large to upload. Retake closer to the seating item or update the app and try again.',
  );
}
