import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

let cachedLogoDataUri = null;

/** Best Rest logo as data URI for A4 delivery note HTML (expo-print). */
export async function getDeliveryNoteCompanyLogoDataUri() {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  const moduleId = require('../assets/bestrest-logo.jpg');
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) return '';
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  cachedLogoDataUri = `data:image/jpeg;base64,${base64}`;
  return cachedLogoDataUri;
}
