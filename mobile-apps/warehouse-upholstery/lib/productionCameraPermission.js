import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

async function getExpoCameraPermission() {
  if (typeof Camera?.getCameraPermissionsAsync === 'function') {
    return Camera.getCameraPermissionsAsync();
  }
  return null;
}

async function requestExpoCameraPermission() {
  if (typeof Camera?.requestCameraPermissionsAsync === 'function') {
    return Camera.requestCameraPermissionsAsync();
  }
  return null;
}

/**
 * Read current camera permission (no prompt).
 * @returns {Promise<import('expo-modules-core').PermissionResponse>}
 */
export async function readProductionCameraPermission() {
  try {
    const fromCamera = await getExpoCameraPermission();
    if (fromCamera) return fromCamera;
  } catch {
    // fall through to image-picker
  }
  return ImagePicker.getCameraPermissionsAsync();
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
    fromCamera = await requestExpoCameraPermission();
  } catch {
    fromCamera = null;
  }
  if (fromCamera?.granted) return fromCamera;

  const fromPicker = await ImagePicker.requestCameraPermissionsAsync();
  if (fromPicker.granted) return fromPicker;

  return fromCamera || fromPicker;
}
