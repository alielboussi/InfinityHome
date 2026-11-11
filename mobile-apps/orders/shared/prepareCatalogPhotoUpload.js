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
  return import('expo-image-manipulator');
}

/** Shrink camera photos before AI upload. */
export async function prepareCatalogPhotoForUpload(source) {
  const input = resolvePhotoUri(source);
  if (!input) throw new Error('Photo is required.');

  const { manipulateAsync, SaveFormat } = await loadImageManipulator();
  const attempts = [
    { width: 880, compress: 0.58 },
    { width: 720, compress: 0.48 },
    { width: 560, compress: 0.38 },
  ];

  let lastBase64 = '';
  for (const { width, compress } of attempts) {
    const result = await manipulateAsync(
      input,
      [{ resize: { width } }],
      { compress, format: SaveFormat.JPEG, base64: true },
    );
    const base64 = String(result?.base64 || '').trim();
    if (!base64) continue;
    lastBase64 = base64;
    if (base64.length <= MAX_UPLOAD_BASE64_CHARS) {
      return `data:image/jpeg;base64,${base64}`;
    }
  }

  if (lastBase64) return `data:image/jpeg;base64,${lastBase64}`;
  throw new Error('Photo is too large. Retake closer to the product and try again.');
}
