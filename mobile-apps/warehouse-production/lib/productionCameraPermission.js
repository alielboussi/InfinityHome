import {
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

/**
 * Read current camera permission (no prompt).
 * @returns {Promise<import('expo-modules-core').PermissionResponse>}
 */
export async function readProductionCameraPermission() {
  try {
    return await getCameraPermissionsAsync();
  } catch {
    return await ImagePicker.getCameraPermissionsAsync();
  }
}

/**
 * Ask for camera access. Must be called from a user tap (Android).
 * Falls back to expo-image-picker if expo-camera request stalls.
 * @returns {Promise<import('expo-modules-core').PermissionResponse>}
 */
export async function askProductionCameraPermission() {
  const current = await readProductionCameraPermission();
  if (current.granted) return current;
  if (current.canAskAgain === false) return current;

  let fromCamera;
  try {
    fromCamera = await requestCameraPermissionsAsync();
  } catch {
    fromCamera = null;
  }
  if (fromCamera?.granted) return fromCamera;

  const fromPicker = await ImagePicker.requestCameraPermissionsAsync();
  if (fromPicker.granted) return fromPicker;

  return fromCamera || fromPicker;
}
