import * as FileSystem from 'expo-file-system';

export async function uriToBase64(uri) {
  const raw = String(uri || '').trim();
  if (!raw) throw new Error('Image uri is required.');
  return FileSystem.readAsStringAsync(raw, {
    encoding: 'base64',
  });
}
