import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

export default function ProductionProductImagePreviewModal({
  visible,
  imageUrl,
  title = '',
  onClose,
}) {
  const { width, height } = useWindowDimensions();
  const maxW = Math.min(width - 32, 480);
  const maxH = Math.min(height * 0.72, 520);

  if (!imageUrl) return null;

  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close photo">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            {title ? (
              <Text style={styles.title} numberOfLines={2}>{title}</Text>
            ) : (
              <View style={styles.titleSpacer} />
            )}
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <MaterialCommunityIcons name="close" size={26} color={theme.text} />
            </Pressable>
          </View>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: maxW, height: maxH }}
            resizeMode="contain"
            accessibilityLabel={title ? `Product photo: ${title}` : 'Product photo'}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: theme.surfaceElevated || theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    maxWidth: '100%',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    marginBottom: 8,
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    lineHeight: 20,
  },
  titleSpacer: { flex: 1 },
  closeBtn: {
    padding: 4,
  },
});
