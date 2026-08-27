import * as FileSystem from 'expo-file-system/legacy';

export async function uriToBase64(uri) {
  const raw = String(uri || '').trim();
  if (!raw) throw new Error('Image uri is required.');
  return FileSystem.readAsStringAsync(raw, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
