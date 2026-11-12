import { useCallback, useMemo } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function CatalogProductPhotoZoomModal({
  visible,
  uri,
  title,
  onClose,
}) {
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

  const edgePadding = useMemo(() => {
    const top = Platform.OS === 'android'
      ? (StatusBar.currentHeight || 0) + 8
      : 16;
    return { top, bottom: 16 };
  }, []);

  const baseSize = useMemo(() => {
    const maxW = Math.max(240, windowWidth - 32);
    const maxH = Math.max(
      240,
      windowHeight - edgePadding.top - edgePadding.bottom - 72,
    );
    return { width: maxW, height: Math.min(maxH, maxW * 1.05) };
  }, [windowWidth, windowHeight, edgePadding.top, edgePadding.bottom]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: edgePadding.top, paddingBottom: edgePadding.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {title || 'Product photo'}
          </Text>
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            style={styles.closeBtn}
          >
            <MaterialCommunityIcons name="close" size={26} color="#f8fafc" />
          </Pressable>
        </View>
        <Text style={styles.hint}>Pinch to zoom</Text>
        <ScrollView
          key={uri}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          bouncesZoom
          pinchGestureEnabled
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Image
            source={{ uri }}
            style={[baseSize, styles.image]}
            resizeMode="contain"
            accessibilityLabel={title || 'Product photo'}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  headerTitle: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  closeBtn: {
    padding: 4,
  },
  hint: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  image: {
    backgroundColor: '#0f172a',
  },
});
