import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import CachedProductImage from './CachedProductImage';
import ProductImageLightbox from './ProductImageLightbox';
import { theme } from '../theme';

export default function ProductImagePreview({
  uri,
  title,
  placeholderText = 'No image yet',
  imageStyle,
  placeholderStyle,
  onLongPressReplace,
  hint,
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const openLightbox = () => {
    if (uri) setLightboxOpen(true);
  };

  const handleLongPress = () => {
    if (onLongPressReplace) onLongPressReplace();
  };

  return (
    <>
      <Pressable
        onPress={openLightbox}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={({ pressed }) => [pressed && uri && styles.pressed]}
        accessibilityRole="imagebutton"
        accessibilityLabel={uri ? 'Product image. Tap to enlarge, hold to replace.' : 'No product image. Hold to add one.'}
      >
        {uri ? (
          <CachedProductImage uri={uri} style={[styles.image, imageStyle]} />
        ) : (
          <View style={[styles.placeholder, placeholderStyle]}>
            <Text style={styles.placeholderText}>{placeholderText}</Text>
          </View>
        )}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </Pressable>

      <ProductImageLightbox
        visible={lightboxOpen}
        uri={uri}
        title={title}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 220,
    borderRadius: 10,
  },
  placeholder: {
    height: 220,
    borderRadius: 10,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: theme.muted },
  hint: {
    color: theme.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  pressed: { opacity: 0.88 },
});
