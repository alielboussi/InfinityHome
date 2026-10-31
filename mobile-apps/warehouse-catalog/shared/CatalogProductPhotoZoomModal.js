import { useCallback, useMemo, useState } from 'react';
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

const MAX_MANUAL_SCALE = 4;

export default function CatalogProductPhotoZoomModal({
  visible,
  uri,
  title,
  onClose,
}) {
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
  const [manualScale, setManualScale] = useState(1);

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
      windowHeight - edgePadding.top - edgePadding.bottom - 120,
    );
    return { width: maxW, height: Math.min(maxH, maxW * 1.05) };
  }, [windowWidth, windowHeight, edgePadding.top, edgePadding.bottom]);

  const displaySize = useMemo(
    () => ({
      width: baseSize.width * manualScale,
      height: baseSize.height * manualScale,
    }),
    [baseSize.height, baseSize.width, manualScale],
  );

  const handleClose = useCallback(() => {
    setManualScale(1);
    onClose?.();
  }, [onClose]);

  const nudgeZoom = useCallback((delta) => {
    setManualScale((prev) => {
      const next = Math.min(MAX_MANUAL_SCALE, Math.max(1, Number((prev + delta).toFixed(2))));
      return next;
    });
  }, []);

  const resetZoom = useCallback(() => setManualScale(1), []);

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
        <View style={styles.zoomToolbar}>
          <Pressable
            style={styles.zoomBtn}
            onPress={() => nudgeZoom(-0.5)}
            accessibilityLabel="Zoom out"
          >
            <MaterialCommunityIcons name="minus" size={22} color="#e2e8f0" />
          </Pressable>
          <Pressable
            style={styles.zoomBtn}
            onPress={resetZoom}
            accessibilityLabel="Reset zoom"
          >
            <Text style={styles.zoomResetText}>{Math.round(manualScale * 100)}%</Text>
          </Pressable>
          <Pressable
            style={styles.zoomBtn}
            onPress={() => nudgeZoom(0.5)}
            accessibilityLabel="Zoom in"
          >
            <MaterialCommunityIcons name="plus" size={22} color="#e2e8f0" />
          </Pressable>
        </View>
        <Text style={styles.hint}>Pinch to zoom, or use + / −</Text>
        <ScrollView
          key={uri}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          bouncesZoom
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Image
            source={{ uri }}
            style={[displaySize, styles.image]}
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
  zoomToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  zoomBtn: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(51, 65, 85, 0.85)',
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomResetText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
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
