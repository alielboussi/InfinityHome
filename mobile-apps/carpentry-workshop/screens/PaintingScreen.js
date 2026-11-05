import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import {
  fetchCarpentryFinishingProducts,
  sendCarpentryProductToPainting,
} from '../services/carpentryApi';
import ProductionPressableHint from '../productionKiosk/components/ProductionPressableHint';
import { theme } from '../shared/theme';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { extractProductionBaseName } from '../productionKiosk/lib/productionItemName';

const CARD_MIN_SIZE = PixelRatio.roundToNearestPixel((8 * 160) / 2.54 / PixelRatio.get());
const CARD_GAP = 12;

function floor2Qty(item) {
  return Math.max(0, Math.floor(Number(item?.floor2_qty) || 0));
}

function groupFloor2Products(products) {
  const map = new Map();
  (products || []).forEach((item) => {
    const rawName = String(item?.name || '').trim();
    const familyBase = extractProductionBaseName(rawName) || rawName || String(item.id);
    const key = familyBase.toLowerCase();
    if (!map.has(key)) map.set(key, { familyBase, items: [] });
    map.get(key).items.push(item);
  });
  return [...map.entries()].map(([key, { familyBase, items }]) => {
    const sorted = [...items].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const totalFloor2 = sorted.reduce((sum, row) => sum + floor2Qty(row), 0);
    const imageUrl = resolveProductImageUrl(sorted.find((r) => r.image_url)?.image_url || '');
    return { key, displayName: familyBase, items: sorted, totalFloor2, imageUrl };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export default function PaintingScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [inlayGroup, setInlayGroup] = useState(null);
  const [qtyModal, setQtyModal] = useState(null);
  const [qtyDraft, setQtyDraft] = useState('1');

  const groups = useMemo(() => groupFloor2Products(products), [products]);

  const loadList = useCallback(async () => {
    if (!allowed) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const list = await fetchCarpentryFinishingProducts();
      setProducts(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('finishingLoadFailed', locale));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(
    useCallback(() => {
      loadList();
    }, [loadList]),
  );

  const openQtySend = (item) => {
    const max = floor2Qty(item);
    if (max < 1) {
      Alert.alert(tUi('paintingConfirmTitle', locale), tUi('finishingNoStock', locale));
      return;
    }
    setQtyDraft('1');
    setQtyModal({ item, max });
  };

  const confirmSend = async () => {
    if (!qtyModal?.item) return;
    const max = qtyModal.max;
    const qty = Math.max(1, Math.floor(Number(qtyDraft) || 1));
    if (qty > max) {
      Alert.alert(tUi('paintingConfirmTitle', locale), tUi('finishingNoStock', locale));
      return;
    }
    const item = qtyModal.item;
    const assemblyId = String(item.id);
    setQtyModal(null);
    setBusyId(assemblyId);
    try {
      await sendCarpentryProductToPainting({ assemblyId, productQty: qty });
      Alert.alert(tUi('paintingConfirmTitle', locale), tUi('paintingDone', locale));
      await loadList();
    } catch (e) {
      Alert.alert(tUi('paintingFailed', locale), e?.message || tUi('paintingFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  const onCardPress = (group) => {
    if (group.items.length === 1) {
      openQtySend(group.items[0]);
    } else {
      setInlayGroup(group);
    }
  };

  if (!allowed) {
    return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 32), styles.flex]}>
        <ProductionKioskTopBar
          title={tUi('paintingTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
        <Text style={kiosk.noticeErr}>{tUi('accessDenied', locale)}</Text>
        {accessHint ? <Text style={[kiosk.hint, { textAlign }]}>{accessHint}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[kiosk.screen, styles.flex, kioskScreenEdgesSafe(insets, 16)]}>
      <ProductionKioskTopBar
        title={tUi('paintingTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('paintingIntro', locale)}</Text>
      {loading && products.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={groups}
        keyExtractor={(g) => g.key}
        refreshing={loading}
        onRefresh={loadList}
        contentContainerStyle={groups.length === 0 ? styles.listEmpty : styles.gridContent}
        renderItem={({ item: group }) => {
          const multi = group.items.length > 1;
          const cardBusy = group.items.some((row) => busyId === String(row.id));
          return (
            <ProductionPressableHint
              hintKey="dashTileHint_painting"
              locale={locale}
              textAlign={textAlign}
              disabled={Boolean(busyId)}
              onPress={() => onCardPress(group)}
              style={({ pressed }) => [
                styles.tile,
                !multi && pressed && styles.tilePressed,
                cardBusy && styles.tileBusy,
              ]}
            >
              {group.imageUrl ? (
                <Image source={{ uri: group.imageUrl }} style={styles.tileImage} resizeMode="cover" />
              ) : (
                <View style={styles.tileImagePlaceholder} />
              )}
              <View style={styles.tileOverlay} />
              <View style={styles.tileNameBar}>
                <Text style={styles.tileName} numberOfLines={2}>{group.displayName}</Text>
                <Text style={styles.tileQty}>
                  {tUi('finishingFloor2Qty', locale).replace('{qty}', String(group.totalFloor2))}
                </Text>
              </View>
              {multi ? (
                <Pressable
                  style={styles.inlayBtn}
                  onPress={() => setInlayGroup(group)}
                  hitSlop={12}
                >
                  <MaterialCommunityIcons name="layers-triple" size={22} color="#fff" />
                </Pressable>
              ) : null}
              {cardBusy ? (
                <ActivityIndicator color={theme.primary} size="small" style={styles.tileSpinner} />
              ) : null}
            </ProductionPressableHint>
          );
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('finishingEmpty', locale)}
            </Text>
          ) : null
        }
      />

      <Modal visible={Boolean(inlayGroup)} transparent animationType="fade" onRequestClose={() => setInlayGroup(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setInlayGroup(null)}>
          <Pressable style={styles.inlayCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{inlayGroup?.displayName}</Text>
            <ScrollView style={styles.inlayScroll}>
              {(inlayGroup?.items || []).map((item) => (
                <Pressable
                  key={String(item.id)}
                  style={styles.inlayRow}
                  onPress={() => {
                    setInlayGroup(null);
                    openQtySend(item);
                  }}
                >
                  <Text style={styles.inlayProductName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.inlayQtyRight}>
                    {tUi('finishingFloor2Qty', locale).replace('{qty}', String(floor2Qty(item)))}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={[kiosk.btn, { marginTop: 12 }]} onPress={() => setInlayGroup(null)}>
              <Text style={kiosk.btnText}>{tUi('cancel', locale)}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(qtyModal)} transparent animationType="fade" onRequestClose={() => setQtyModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQtyModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{tUi('paintingConfirmTitle', locale)}</Text>
            <Text style={styles.modalSub}>
              {tUi('paintingConfirmBody', locale)
                .replace('{name}', qtyModal?.item?.name || '')
                .replace('{qty}', qtyDraft)}
            </Text>
            <Text style={styles.modalSub}>{tUi('paintingQtyLabel', locale)}</Text>
            <TextInput
              style={[kiosk.input, { textAlign: 'center' }]}
              keyboardType="number-pad"
              value={qtyDraft}
              onChangeText={setQtyDraft}
            />
            <View style={styles.modalActions}>
              <Pressable style={[kiosk.btn, styles.modalBtn]} onPress={() => setQtyModal(null)}>
                <Text style={kiosk.btnText}>{tUi('cancel', locale)}</Text>
              </Pressable>
              <Pressable style={[kiosk.btn, styles.modalBtn]} onPress={confirmSend}>
                <Text style={kiosk.btnText}>{tUi('confirm', locale)}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { marginBottom: 8 },
  list: { flex: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  gridContent: { paddingBottom: 24 },
  empty: { marginTop: 24 },
  tile: {
    width: '100%',
    aspectRatio: 1,
    minHeight: CARD_MIN_SIZE,
    marginBottom: CARD_GAP,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    overflow: 'hidden',
  },
  tileImage: { ...StyleSheet.absoluteFillObject },
  tileImagePlaceholder: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.surface },
  tileOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  tilePressed: { opacity: 0.92, borderColor: theme.primary },
  tileBusy: { opacity: 0.65 },
  tileNameBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, zIndex: 1 },
  tileName: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  tileQty: { fontSize: 14, fontWeight: '600', color: '#e2e8f0', textAlign: 'center', marginTop: 4 },
  inlayBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    backgroundColor: theme.primary,
    borderRadius: 14,
    padding: 10,
  },
  tileSpinner: { position: 'absolute', bottom: 12, alignSelf: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.surfaceElevated,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
  },
  inlayCard: {
    backgroundColor: theme.surfaceElevated,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, color: theme.text },
  modalSub: { fontSize: 14, color: theme.textMuted, marginBottom: 8 },
  inlayScroll: { maxHeight: 360 },
  inlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  inlayProductName: { flex: 1, fontSize: 16, fontWeight: '600', color: theme.text },
  inlayQtyRight: { fontSize: 15, fontWeight: '700', color: theme.textSecondary },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1 },
});
