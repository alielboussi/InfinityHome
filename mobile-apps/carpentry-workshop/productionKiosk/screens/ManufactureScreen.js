// @refresh reset — Upholster raw WIP on Floor 2 (BOM + raw deduct → finished stock).
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import ProductionQrScanModal from '../components/ProductionQrScanModal';
import { kiosk } from '../components/kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import {
  fetchUpholsteryManufactureProducts,
  runUpholsteryManufacture,
  invalidateUpholsteryManufactureListCache,
} from '../services/productionApi';
import ProductionPressableHint from '../lib/ProductionPressableHint';
import { theme } from '../shared/theme';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
  sanitizeWarehouseScannerInput,
} from '../shared/warehouseScanResolver';

const CARD_MIN_SIZE = PixelRatio.roundToNearestPixel((8 * 160) / 2.54 / PixelRatio.get());
const CARD_GAP = 12;

function floor2Qty(item) {
  return Math.max(0, Math.floor(Number(item?.floor2_qty ?? item?.quantity) || 0));
}

function resolveFloor2ProductImage(item) {
  return (
    resolveProductImageUrl(item?.floor2_image_url)
    || resolveProductImageUrl(item?.image_url)
    || resolveProductImageUrl(item?.family_image_url)
    || ''
  );
}

function extractPhotoQrSku(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/[?&]sku=([^&\s#]+)/i);
  if (match) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return String(match[1]).trim();
    }
  }
  return '';
}

function findMatchingFloor2ProductByScan(products, rawScan) {
  const cleaned = sanitizeWarehouseScannerInput(rawScan);
  if (!cleaned) return null;
  const photoSku = extractPhotoQrSku(cleaned);
  const probe = photoSku || cleaned;
  const probeKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(probe));
  const probeLower = probe.toLowerCase();

  for (const item of products || []) {
    const sku = String(item?.family_sku || item?.raw_sku || item?.finished_sku || '').trim();
    if (sku) {
      if (sku.toLowerCase() === probeLower) return item;
      const storedKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(sku));
      for (const k of probeKeys) {
        if (k && storedKeys.has(k)) return item;
      }
    }
    const name = String(item?.raw_name || item?.name || item?.finished_name || '').trim();
    if (name && name.toLowerCase() === probeLower) return item;
    if (name && name.toLowerCase().includes(probeLower)) return item;
  }
  return null;
}

export default function ManufactureScreen({
  route,
  navigation,
  allowed,
  accessHint,
  onRefreshAccess,
}) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]);
  const productsRef = useRef([]);
  productsRef.current = products;
  const [search, setSearch] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [qtyModal, setQtyModal] = useState(null);
  const [qtyDraft, setQtyDraft] = useState('1');

  const loadList = useCallback(async ({ fromPull = false } = {}) => {
    if (!allowed) {
      setProducts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const hasCached = productsRef.current.length > 0;
    if (!hasCached) setLoading(true);
    else if (fromPull) setRefreshing(true);
    setError('');
    try {
      const list = await fetchUpholsteryManufactureProducts({ force: fromPull });
      const sorted = (Array.isArray(list) ? list : [])
        .slice()
        .sort((a, b) => String(a.raw_name || a.name || '').localeCompare(String(b.raw_name || b.name || '')));
      setProducts(sorted);
    } catch (e) {
      setError(e?.message || tUi('manufactureLoadFailed', locale));
      if (!hasCached) setProducts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allowed, locale]);

  useFocusEffect(
    useCallback(() => {
      loadList({ fromPull: false });
      if (route?.params?.openScan) {
        setScanOpen(true);
        navigation.setParams({ openScan: false });
      }
    }, [loadList, route?.params?.openScan, navigation]),
  );

  const inStockProducts = useMemo(
    () => (products || []).filter((item) => floor2Qty(item) > 0),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const raw = String(search || '').trim();
    if (!raw) return inStockProducts;
    const q = raw.toLowerCase();
    const qKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(raw));
    return inStockProducts.filter((item) => {
      const label = String(item.raw_name || item.name || item.finished_name || '');
      if (label.toLowerCase().includes(q)) return true;
      const sku = String(item.raw_sku || item.family_sku || item.finished_sku || '');
      if (sku.toLowerCase().includes(q)) return true;
      const storedKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(sku));
      for (const k of qKeys) {
        if (k && storedKeys.has(k)) return true;
      }
      return false;
    });
  }, [inStockProducts, search]);

  const hasSearch = Boolean(String(search || '').trim());

  const openQtyAdd = useCallback((item) => {
    if (busyId) return;
    const max = floor2Qty(item);
    if (max < 1) {
      Alert.alert(tUi('manufactureTitle', locale), tUi('paintingNoneAvailable', locale));
      return;
    }
    setQtyDraft('1');
    setQtyModal({ item });
  }, [busyId, locale]);

  const handleBarcodeScanned = useCallback((scannedValue) => {
    setScanOpen(false);
    const cleaned = sanitizeWarehouseScannerInput(scannedValue);
    if (!cleaned) return;
    const photoSku = extractPhotoQrSku(cleaned);
    const queryValue = photoSku || cleaned;
    setSearch(queryValue);

    const matched = findMatchingFloor2ProductByScan(productsRef.current, scannedValue);
    if (matched) {
      openQtyAdd(matched);
    } else {
      Alert.alert(tUi('manufactureTitle', locale), tUi('manufactureSearchNoMatch', locale));
    }
  }, [locale, openQtyAdd]);

  const handleQtyTextChange = (txt) => {
    const cleaned = String(txt || '').replace(/[^0-9]/g, '');
    const max = qtyModal?.item ? floor2Qty(qtyModal.item) : 999;
    if (!cleaned) {
      setQtyDraft('');
      return;
    }
    const n = Math.floor(Number(cleaned) || 0);
    setQtyDraft(String(Math.max(1, Math.min(max, n))));
  };

  const confirmAdd = async () => {
    if (!qtyModal?.item) return;
    const item = qtyModal.item;
    const rawAssemblyId = String(item.raw_assembly_id || item.id || item.assembly_id || '');
    const max = floor2Qty(item);
    const rawNum = Math.floor(Number(qtyDraft) || 0);
    if (!Number.isFinite(rawNum) || rawNum < 1) {
      Alert.alert(tUi('manufactureDeductTitle', locale), tUi('needQty', locale));
      return;
    }
    if (rawNum > max) {
      Alert.alert(
        tUi('manufactureDeductTitle', locale),
        tUi('paintingQtyExceedsAvailable', locale).replace('{max}', String(max)),
      );
      return;
    }
    setQtyModal(null);
    setBusyId(rawAssemblyId);
    try {
      await runUpholsteryManufacture({
        rawAssemblyId,
        productQty: rawNum,
      });
      invalidateUpholsteryManufactureListCache();
      await loadList({ fromPull: true });
      Alert.alert(tUi('manufactureTitle', locale), tUi('manufactureDone', locale));
    } catch (e) {
      Alert.alert(tUi('manufactureFailed', locale), e?.message || tUi('manufactureFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  const renderProductCard = ({ item }) => {
    const id = String(item.raw_assembly_id || item.id || item.assembly_id || '');
    const qty = floor2Qty(item);
    const displayName = String(item.raw_name || item.name || item.finished_name || '');
    const cardImage = resolveFloor2ProductImage(item);
    const cardBusy = busyId === id;

    return (
      <ProductionPressableHint
        hintKey="dashTileHint_manufacture"
        locale={locale}
        textAlign={textAlign}
        disabled={Boolean(busyId)}
        onPress={() => openQtyAdd(item)}
        style={({ pressed }) => [
          styles.tile,
          pressed && styles.tilePressed,
          cardBusy && styles.tileBusy,
        ]}
      >
        {cardImage ? (
          <Image
            source={{ uri: cardImage }}
            style={styles.tileImage}
            resizeMode="cover"
            resizeMethod="resize"
            fadeDuration={0}
          />
        ) : (
          <View style={styles.tileImagePlaceholder} />
        )}
        <View style={styles.tileOverlay} />
        {!cardImage ? (
          <View style={styles.tileNoImageCenter} pointerEvents="none">
            <MaterialCommunityIcons name="image-off-outline" size={48} color={theme.textMuted} />
          </View>
        ) : null}
        <View style={styles.qtyBadge} pointerEvents="none">
          <MaterialCommunityIcons name="package-variant-closed" size={20} color="#fff" />
          <Text style={styles.qtyBadgeText}>{String(qty)}</Text>
        </View>
        <View style={styles.tileNameBar}>
          <Text style={styles.tileName}>{displayName}</Text>
          <Text style={styles.tileQty}>
            {tUi('manufactureQtyLabel', locale).replace('{qty}', String(qty))}
          </Text>
        </View>
        {cardBusy ? (
          <ActivityIndicator color={theme.primary} size="small" style={styles.tileSpinner} />
        ) : null}
      </ProductionPressableHint>
    );
  };

  if (!allowed) {
    return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 32), styles.flex]}>
        <ProductionKioskTopBar
          title={tUi('manufactureTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
        <Text style={kiosk.noticeErr}>{tUi('accessDenied', locale)}</Text>
        {accessHint ? <Text style={[kiosk.hint, { textAlign }]}>{accessHint}</Text> : null}
        {typeof onRefreshAccess === 'function' ? (
          <Pressable style={[kiosk.btn, { marginTop: 16 }]} onPress={() => onRefreshAccess({ background: false })}>
            <Text style={kiosk.btnText}>{tUi('retryAccess', locale)}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[kiosk.screen, styles.flex, kioskScreenEdgesSafe(insets, 16)]}>
      <ProductionKioskTopBar
        title={tUi('manufactureTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('manufactureIntroFloor2', locale)}</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={[kiosk.input, styles.searchInput, { textAlign: 'left' }]}
          placeholder={tUi('manufactureSearch', locale)}
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <Pressable
          style={({ pressed }) => [styles.scanBtn, pressed && styles.scanBtnPressed]}
          onPress={() => setScanOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={tUi('stockQrTitle', locale)}
        >
          <MaterialCommunityIcons name="barcode-scan" size={22} color="#ffffff" />
          <Text style={styles.scanBtnText}>{tUi('manufactureScanBtn', locale)}</Text>
        </Pressable>
      </View>
      {hasSearch && !loading && filteredProducts.length === 0 && !error ? (
        <Text style={[kiosk.searchHint, { textAlign }]}>{tUi('manufactureSearchNoMatch', locale)}</Text>
      ) : null}
      {loading && products.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={filteredProducts}
        keyExtractor={(item) => String(item.id || item.assembly_id)}
        refreshing={refreshing}
        onRefresh={() => loadList({ fromPull: true })}
        contentContainerStyle={filteredProducts.length === 0 ? styles.listEmpty : styles.gridContent}
        renderItem={renderProductCard}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          !loading && !error && !hasSearch ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi(products.length ? 'manufactureEmptyNoStock' : 'manufactureUpholsteryEmpty', locale)}
            </Text>
          ) : null
        }
      />

      <Modal visible={Boolean(qtyModal)} transparent animationType="fade" onRequestClose={() => setQtyModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQtyModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{tUi('manufactureDeductTitle', locale)}</Text>
            <Text style={styles.modalProductName}>
              {qtyModal?.item?.raw_name || qtyModal?.item?.name || qtyModal?.item?.finished_name || ''}
            </Text>
            <Text style={styles.modalSub}>
              {tUi('manufactureQtyLabel', locale).replace('{qty}', String(floor2Qty(qtyModal?.item)))}
            </Text>
            <Text style={styles.modalLabel}>{tUi('needQty', locale)}</Text>
            <View style={styles.qtyStepperRow}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => {
                  const cur = Math.max(1, Math.floor(Number(qtyDraft) || 1));
                  setQtyDraft(String(Math.max(1, cur - 1)));
                }}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <TextInput
                style={[kiosk.input, styles.qtyInput]}
                value={qtyDraft}
                onChangeText={handleQtyTextChange}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Pressable
                style={styles.stepBtn}
                onPress={() => {
                  const cur = Math.max(1, Math.floor(Number(qtyDraft) || 1));
                  setQtyDraft(String(Math.min(999, cur + 1)));
                }}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={[kiosk.btn, styles.modalBtn]} onPress={() => setQtyModal(null)}>
                <Text style={kiosk.btnText}>{tUi('cancel', locale)}</Text>
              </Pressable>
              <Pressable style={[kiosk.btn, kiosk.btnPrimary, styles.modalBtn]} onPress={confirmAdd}>
                <Text style={[kiosk.btnText, kiosk.btnPrimaryText]}>{tUi('confirm', locale)}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ProductionQrScanModal
        visible={scanOpen}
        locale={locale}
        onClose={() => setScanOpen(false)}
        onScan={handleBarcodeScanned}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { marginBottom: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginBottom: 0,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.primary,
    borderRadius: theme.radiusSm,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  scanBtnPressed: { opacity: 0.85 },
  scanBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
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
  tileImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  tileImagePlaceholder: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.surface },
  tileOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.38)' },
  tileNoImageCenter: { ...StyleSheet.absoluteFillObject, top: 56, justifyContent: 'center', alignItems: 'center' },
  tilePressed: { opacity: 0.92, borderColor: theme.primary },
  tileBusy: { opacity: 0.65 },
  tileNameBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    zIndex: 1,
  },
  tileName: { fontSize: 19, fontWeight: '800', color: '#ffffff', textAlign: 'center', lineHeight: 24 },
  tileQty: { fontSize: 15, fontWeight: '700', color: '#38bdf8', textAlign: 'center', marginTop: 4 },
  qtyBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  qtyBadgeText: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  tileSpinner: { position: 'absolute', bottom: 12, alignSelf: 'center', zIndex: 3 },
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
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6, color: theme.text },
  modalProductName: { fontSize: 17, fontWeight: '700', marginBottom: 6, color: theme.primary },
  modalSub: { fontSize: 14, color: theme.textMuted, marginBottom: 10 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  qtyStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 4,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: theme.text, fontSize: 24, fontWeight: '800' },
  qtyInput: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1 },
});
