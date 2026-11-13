// @refresh reset — catalog BOM from storerooms → credit Warehouse Floor 2 WIP.
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  fetchCarpentryManufactureProducts,
  runCarpentryManufacture,
} from '../services/carpentryApi';
import { emitProductionRefresh } from '../lib/productionRefreshBus';
import ManufactureProductGridCard from '../shared/components/ManufactureProductGridCard';
import { theme } from '../shared/theme';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { pickManufactureFloor2ImageUrl } from '../../shared/manufactureFloor2Image';
import { formatAssemblyDimensions } from '../../shared/utils/warehouseAssemblySpecs';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
  sanitizeWarehouseScannerInput,
} from '../shared/warehouseScanResolver';

const CARD_GAP = 12;

function floor2Qty(item) {
  return Math.max(0, Math.floor(Number(item?.floor2_qty ?? item?.quantity) || 0));
}

function resolveManufactureProductImage(item) {
  const url = pickManufactureFloor2ImageUrl(item);
  return url ? resolveProductImageUrl(url) : '';
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
    const sku = String(item?.family_sku || item?.raw_sku || '').trim();
    if (sku) {
      if (sku.toLowerCase() === probeLower) return item;
      const storedKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(sku));
      for (const k of probeKeys) {
        if (k && storedKeys.has(k)) return item;
      }
    }
    const name = String(item?.name || item?.raw_name || '').trim();
    if (name && name.toLowerCase() === probeLower) return item;
    if (name && name.toLowerCase().includes(probeLower)) return item;
  }
  return null;
}

export default function ManufactureScreen({
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
      const list = await fetchCarpentryManufactureProducts();
      const sorted = (Array.isArray(list) ? list : [])
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
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
      loadList();
    }, [loadList]),
  );

  const catalogProducts = useMemo(() => (products || []).slice(), [products]);

  const filteredProducts = useMemo(() => {
    const raw = String(search || '').trim();
    if (!raw) return catalogProducts;
    const base = catalogProducts;
    const q = raw.toLowerCase();
    const qKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(raw));
    return base.filter((item) => {
      if (String(item.name || '').toLowerCase().includes(q)) return true;
      const sku = String(item.family_sku || '');
      if (sku.toLowerCase().includes(q)) return true;
      const storedKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(sku));
      for (const k of qKeys) {
        if (k && storedKeys.has(k)) return true;
      }
      return false;
    });
  }, [catalogProducts, search]);

  const hasSearch = Boolean(String(search || '').trim());

  const openQtyAdd = useCallback((item) => {
    if (busyId) return;
    setQtyDraft('1');
    setQtyModal({ item });
  }, [busyId]);

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
    if (!cleaned) {
      setQtyDraft('');
      return;
    }
    const n = Math.floor(Number(cleaned) || 0);
    setQtyDraft(String(Math.max(1, Math.min(999, n))));
  };

  const confirmAdd = async () => {
    if (!qtyModal?.item) return;
    const item = qtyModal.item;
    const assemblyId = String(item.id || item.assembly_id || item.raw_assembly_id || '');
    const rawNum = Math.floor(Number(qtyDraft) || 0);
    if (!Number.isFinite(rawNum) || rawNum < 1) {
      Alert.alert(tUi('manufactureAddStockTitle', locale), tUi('needQty', locale));
      return;
    }
    setQtyModal(null);
    setBusyId(assemblyId);
    try {
      await runCarpentryManufacture({
        assemblyId,
        productQty: rawNum,
      });
      emitProductionRefresh('manufacture');
      await loadList({ fromPull: true });
      Alert.alert(tUi('manufactureTitle', locale), tUi('manufactureJobOpened', locale));
    } catch (e) {
      Alert.alert(tUi('manufactureFailed', locale), e?.message || tUi('manufactureFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  const renderProductCard = ({ item }) => {
    const id = String(item.id || item.assembly_id || '');
    const qty = floor2Qty(item);
    const cardImage = resolveManufactureProductImage(item);
    const cardBusy = busyId === id;

    return (
      <View style={styles.gridItem}>
        <ManufactureProductGridCard
          imageUrl={cardImage || undefined}
          name={item.name}
          dimensions={formatAssemblyDimensions(item)}
          qty={qty}
          busy={cardBusy}
          disabled={Boolean(busyId)}
          onPress={() => openQtyAdd(item)}
        />
      </View>
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
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('manufactureIntro', locale)}</Text>
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
        numColumns={2}
        columnWrapperStyle={filteredProducts.length ? styles.gridRow : undefined}
        refreshing={refreshing}
        onRefresh={() => loadList({ fromPull: true })}
        contentContainerStyle={filteredProducts.length === 0 ? styles.listEmpty : styles.gridContent}
        renderItem={renderProductCard}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {hasSearch ? tUi('manufactureSearchNoMatch', locale) : tUi('manufactureEmpty', locale)}
            </Text>
          ) : null
        }
      />

      <Modal visible={Boolean(qtyModal)} transparent animationType="fade" onRequestClose={() => setQtyModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQtyModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{tUi('manufactureConfirmTitle', locale)}</Text>
            <Text style={styles.modalProductName}>{qtyModal?.item?.name || ''}</Text>
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
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  tabChipActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft || '#e0f2fe' },
  tabChipText: { fontWeight: '700', color: theme.textMuted },
  tabChipTextActive: { color: theme.primary },
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
  gridRow: { gap: CARD_GAP, marginBottom: CARD_GAP },
  gridItem: { flex: 1 },
  empty: { marginTop: 24 },
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
