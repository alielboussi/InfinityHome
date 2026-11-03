import * as ImagePicker from 'expo-image-picker';

/**
 * Pick a processed catalog image from the device gallery (no camera AI flow).
 * Lives under app lib/ (not shared/) so Metro resolves expo-image-picker from the app root.
 * @returns {Promise<{ uri: string } | null>}
 */
export async function pickCatalogProductPhotoFromLibrary() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo library access is required to import a product image.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return { uri: result.assets[0].uri };
}
