import * as ImagePicker from 'expo-image-picker';

/**
 * Opens the device camera (required). Returns JPEG base64 without the data-uri prefix.
 * @returns {Promise<string|null>} null when the user cancels
 */
export async function captureRequiredProductionPhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera permission is required to photograph the seating item.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
    base64: true,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];
  const base64 = String(asset.base64 || '').trim();
  if (!base64) {
    throw new Error('Could not read the photo from the camera.');
  }
  const mime = String(asset.mimeType || 'image/jpeg').toLowerCase();
  return `data:${mime};base64,${base64}`;
}
