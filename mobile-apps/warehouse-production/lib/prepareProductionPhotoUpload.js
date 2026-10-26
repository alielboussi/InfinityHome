/**
 * Shrink camera photos before upload (faster AI retouch, avoids API body limits).
 * @param {string} dataUri
 * @returns {Promise<string>}
 */
export async function prepareProductionPhotoForUpload(dataUri) {
  const raw = String(dataUri || '').trim();
  if (!raw) return raw;

  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(
      raw,
      [{ resize: { width: 1280 } }],
      {
        compress: 0.72,
        format: SaveFormat.JPEG,
        base64: true,
      },
    );
    if (result?.base64) {
      return `data:image/jpeg;base64,${result.base64}`;
    }
  } catch {
    // Fall back to the camera output when manipulator is unavailable.
  }
  return raw;
}
