import {
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
} from 'expo-camera';

export async function readCatalogCameraPermission() {
  return getCameraPermissionsAsync();
}

export async function askCatalogCameraPermission() {
  const current = await readCatalogCameraPermission();
  if (current.granted) return current;
  if (current.canAskAgain === false) return current;
  return requestCameraPermissionsAsync();
}
