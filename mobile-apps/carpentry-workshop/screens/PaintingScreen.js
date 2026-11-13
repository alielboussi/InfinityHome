import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import ProductionQrScanModal from '../productionKiosk/components/ProductionQrScanModal';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import {
  fetchCarpentryFloor2Products,
  sendCarpentryProductToPainting,
} from '../services/carpentryApi';
import ProductionPressableHint from '../productionKiosk/lib/ProductionPressableHint';
import ProductionProductListRow, { productionProductRowPressableStyle } from '../shared/components/ProductionProductListRow';
import { theme } from '../shared/theme';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
  sanitizeWarehouseScannerInput,
} from '../shared/warehouseScanResolver';

const CARD_GAP = 12;
const productRowPressable = productionProductRowPressableStyle(CARD_GAP);

function floor2Qty(item) {
  return Math.max(0, Math.floor(Number(item?.floor2_qty ?? item?.quantity) || 0));
}

function resolveFloor2ProductImage(item) {
  return (
    resolveProductImageUrl(item?.floor2_image_url)
    || resolveProductImageUrl(item?.image_url)
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
    const sku = String(item?.family_sku || '').trim();
    if (sku) {
      if (sku.toLowerCase() === probeLower) return item;
      const storedKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(sku));
      for (const k of probeKeys) {
        if (k && storedKeys.has(k)) return item;
      }
    }
    const name = String(item?.name || '').trim();
    if (name && name.toLowerCase() === probeLower) return item;
  }
  return null;
}

export default function PaintingScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
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
      const list = await fetchCarpentryFloor2Products();
      const sorted = (Array.isArray(list) ? list : [])
        .slice()
        .filter((item) => floor2Qty(item) > 0)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      setProducts(sorted);
    } catch (e) {
      setError(e?.message || tUi('finishingLoadFailed', locale));
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

  const filteredProducts = useMemo(() => {
    const raw = String(search || '').trim();
    const inStock = products.filter((item) => floor2Qty(item) > 0);
    if (!raw) return inStock;
    const q = raw.toLowerCase();
    const qKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(raw));
    return inStock.filter((item) => {
      if (String(item.name || '').toLowerCase().includes(q)) return true;
      const sku = String(item.family_sku || '');
      if (sku.toLowerCase().includes(q)) return true;
      const storedKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(sku));
      for (const k of qKeys) {
        if (k && storedKeys.has(k)) return true;
      }
      return false;
    });
  }, [products, search]);

  const hasSearch = Boolean(String(search || '').trim());

  const openQtySend = useCallback((item) => {
    if (busyId) return;
    const max = floor2Qty(item);
    if (max < 1) {
      Alert.alert(tUi('paintingConfirmTitle', locale), tUi('finishingNoStock', locale));
      return;
    }
    setQtyDraft('1');
    setQtyModal({ item, max });
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
      openQtySend(matched);
    }
  }, [openQtySend]);

  const handleQtyTextChange = (txt) => {
    const cleaned = String(txt || '').replace(/[^0-9]/g, '');
    if (!cleaned) {
      setQtyDraft('');
      return;
    }
    const max = qtyModal?.max ?? 1;
    const n = Math.floor(Number(cleaned) || 0);
    if (n > max) {
      setQtyDraft(String(max));
      return;
    }
    setQtyDraft(String(n));
  };

  const confirmSend = async () => {
    if (!qtyModal?.item) return;
    const max = qtyModal.max;
    const rawNum = Math.floor(Number(qtyDraft) || 0);
    if (!Number.isFinite(rawNum) || rawNum < 1) {
      Alert.alert(tUi('paintingConfirmTitle', locale), tUi('needQty', locale));
      return;
    }
    if (rawNum > max) {
      Alert.alert(
        tUi('paintingConfirmTitle', locale),
        tUi('paintingQtyExceedsStock', locale).replace('{max}', String(max)),
      );
      return;
    }
    const item = qtyModal.item;
    const assemblyId = String(item.id || item.assembly_id || '');
    setQtyModal(null);
    setBusyId(assemblyId);
    try {
      await sendCarpentryProductToPainting({ assemblyId, productQty: rawNum });
      setProducts((prev) =>
        prev.map((row) => {
          const rid = String(row.id || row.assembly_id || '');
          if (rid !== assemblyId) return row;
          const nextQty = Math.max(0, floor2Qty(row) - rawNum);
          return { ...row, floor2_qty: nextQty, quantity: nextQty };
        }),
      );
      Alert.alert(tUi('paintingConfirmTitle', locale), tUi('paintingDone', locale));
      await loadList();
    } catch (e) {
      Alert.alert(tUi('paintingFailed', locale), e?.message || tUi('paintingFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  const renderProductCard = ({ item }) => {
    const id = String(item.id || item.assembly_id || '');
    const qty = floor2Qty(item);
    const cardImage = resolveFloor2ProductImage(item);
    const cardBusy = busyId === id;
    const sku = String(item.family_sku || '').trim();

    return (
      <ProductionPressableHint
        hintKey="dashTileHint_painting"
        locale={locale}
        textAlign={textAlign}
        disabled={Boolean(busyId)}
        onPress={() => openQtySend(item)}
        style={({ pressed }) => [
          productRowPressable.row,
          pressed && productRowPressable.rowPressed,
          cardBusy && productRowPressable.rowBusy,
        ]}
      >
        <ProductionProductListRow
          imageUrl={cardImage || undefined}
          name={item.name}
          sku={sku}
          subtitle={tUi('paintingAvailableQty', locale).replace('{qty}', String(qty))}
          busy={cardBusy}
        />
      </ProductionPressableHint>
    );
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
        title={tUi('paintingTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('paintingIntro', locale)}</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={[kiosk.input, styles.searchInput, { textAlign: 'left' }]}
          placeholder={tUi('paintingSearch', locale)}
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
          <Text style={styles.scanBtnText}>{tUi('paintingScanBtn', locale)}</Text>
        </Pressable>
      </View>
      {hasSearch && !loading && filteredProducts.length === 0 && !error ? (
        <Text style={[kiosk.searchHint, { textAlign }]}>{tUi('paintingSearchNoMatch', locale)}</Text>
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
              {tUi('finishingEmpty', locale)}
            </Text>
          ) : null
        }
      />

      <Modal visible={Boolean(qtyModal)} transparent animationType="fade" onRequestClose={() => setQtyModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQtyModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{tUi('paintingConfirmTitle', locale)}</Text>
            {(() => {
              const modalImage = qtyModal?.item ? resolveFloor2ProductImage(qtyModal.item) : '';
              return modalImage ? (
                <Image source={{ uri: modalImage }} style={styles.modalThumb} resizeMode="contain" />
              ) : null;
            })()}
            <Text style={styles.modalProductName}>{qtyModal?.item?.name || ''}</Text>
            <Text style={styles.modalSub}>
              {tUi('paintingConfirmBody', locale)
                .replace('{name}', qtyModal?.item?.name || '')
                .replace('{qty}', qtyDraft || '0')
                .replace('{max}', String(qtyModal?.max ?? 0))}
            </Text>
            <Text style={styles.modalLabel}>
              {tUi('paintingQtyLabel', locale).replace('{max}', String(qtyModal?.max ?? 0))}
            </Text>
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
                keyboardType="number-pad"
                value={qtyDraft}
                onChangeText={handleQtyTextChange}
              />
              <Pressable
                style={styles.stepBtn}
                onPress={() => {
                  const max = qtyModal?.max ?? 1;
                  const cur = Math.max(0, Math.floor(Number(qtyDraft) || 0));
                  setQtyDraft(String(Math.min(max, cur + 1)));
                }}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={[kiosk.btn, styles.modalBtn]} onPress={() => setQtyModal(null)}>
                <Text style={kiosk.btnText}>{tUi('cancel', locale)}</Text>
              </Pressable>
              <Pressable style={[kiosk.btn, kiosk.btnPrimary, styles.modalBtn]} onPress={confirmSend}>
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
  scanBtnPressed: {
    opacity: 0.85,
  },
  scanBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  list: { flex: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  gridContent: { paddingBottom: 24 },
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
  modalThumb: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: theme.border,
  },
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
  stepBtnText: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
  },
  qtyInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1 },
});
