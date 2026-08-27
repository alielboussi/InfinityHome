import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export async function pickProductImageFromLibrary() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to upload a product image.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

export async function takeProductPhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow camera access to take a product photo.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

export function promptVisualSearchPhoto({ onPicked }) {
  Alert.alert(
    'Search by photo',
    'Take or import a photo to find similar catalog items',
    [
      {
        text: 'Choose photo',
        onPress: async () => {
          const uri = await pickProductImageFromLibrary();
          if (uri) onPicked(uri);
        },
      },
      {
        text: 'Take photo',
        onPress: async () => {
          const uri = await takeProductPhoto();
          if (uri) onPicked(uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
}

export function promptReplaceProductImage({ onPicked }) {
  Alert.alert(
    'Replace image',
    'Choose a new product photo',
    [
      {
        text: 'Choose photo',
        onPress: async () => {
          const uri = await pickProductImageFromLibrary();
          if (uri) onPicked(uri);
        },
      },
      {
        text: 'Take photo',
        onPress: async () => {
          const uri = await takeProductPhoto();
          if (uri) onPicked(uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
}
