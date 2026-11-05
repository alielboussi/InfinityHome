/**
 * Build catalog upload data URI from expo-camera takePictureAsync result.
 * @param {{ base64?: string, uri?: string, mimeType?: string }} photo
 * @returns {string|null}
 */
export function toProductionPhotoDataUri(photo) {
  const base64 = String(photo?.base64 || '').trim();
  if (!base64) return null;
  const mime = String(photo?.mimeType || 'image/jpeg').toLowerCase();
  return `data:${mime};base64,${base64}`;
}
