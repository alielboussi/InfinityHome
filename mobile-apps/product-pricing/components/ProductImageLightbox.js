import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import CachedProductImage from './CachedProductImage';
import { theme } from '../theme';

export default function ProductImageLightbox({ visible, uri, title, onClose }) {
  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.closeTap} onPress={onClose} accessibilityLabel="Close image" />
        <View style={styles.content} pointerEvents="box-none">
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <CachedProductImage uri={uri} style={styles.image} contentFit="contain" />
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    padding: 16,
  },
  closeTap: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    zIndex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  image: {
    width: '100%',
    flex: 1,
    maxHeight: '78%',
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.border,
  },
  closeButtonText: {
    color: '#052018',
    fontWeight: '800',
  },
});
