import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

const blurhash = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export default function CachedProductImage({
  uri,
  style,
  contentFit = 'cover',
  onError,
  recyclingKey,
}) {
  if (!uri) return null;

  const resolvedRecyclingKey = recyclingKey == null || recyclingKey === ''
    ? undefined
    : String(recyclingKey);

  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      contentFit={contentFit}
      cachePolicy="disk"
      transition={120}
      placeholder={{ blurhash }}
      recyclingKey={resolvedRecyclingKey}
      onError={onError}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
});
