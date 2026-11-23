import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DeliveryFarmQtyAddModal from '../components/DeliveryFarmQtyAddModal';
import DeliveryWarehouseProductGrid from '../components/DeliveryWarehouseProductGrid';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import ProductionQrScanModal from '../components/ProductionQrScanModal';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { mapFarmWarehouseSetupError, warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { theme } from '../shared/theme';
import { kioskFooterBottomPad } from '../lib/kioskLayout';

const FARM = {
  bar: '#047857',
  chip: '#064e3b',
  chipText: '#6ee7b7',
  border: '#047857',
};

function normalizeScan(value) {
  return String(value || '')
    .trim()
    .replace(/[\x00-\x1f\x7f]/g, '')
    .toLowerCase();
}

function matchProductByScan(products, raw) {
  const key = normalizeScan(raw);
  if (!key) return null;
  return (products || []).find((p) => {
    const sku = normalizeScan(p.family_sku || p.sku);
    const id = normalizeScan(p.assembly_id || p.id);
    return (sku && sku === key) || (id && id === key);
  }) || null;
}

export default function WarehouseFromFarmHomeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [sessionOpening, setSessionOpening] = useState(false);
  const [cart, setCart] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanQtyProduct, setScanQtyProduct] = useState(null);
  const [creditDestination, setCreditDestination] = useState('');
  const [farmLocations, setFarmLocations] = useState([]);
  const [farmLocationId, setFarmLocationId] = useState('');
  const [farmLocationName, setFarmLocationName] = useState('');
  const productsRef = useRef(products);
  productsRef.current = products;

  const loadFarm = useCallback(async (requestedFarmId = '') => {
    setLoading(true);
    setError('');
    try {
      const catalog = await warehouseMobileRequest('farm-return-catalog', {
        farm_location_id: requestedFarmId || undefined,
      });
      const locs = Array.isArray(catalog?.farm_locations) ? catalog.farm_locations : [];
      const selectedId = String(catalog?.farm_location_id || requestedFarmId || locs[0]?.id || '');
      const selectedName = String(
        catalog?.farm_location_name
        || locs.find((l) => String(l.id) === selectedId)?.name
        || '',
      ).trim();
      setFarmLocations(locs);
      setFarmLocationId(selectedId);
      setFarmLocationName(selectedName);
      setProducts(Array.isArray(catalog?.products) ? catalog.products : []);
      setCart([]);
      setSessionOpening(true);
      try {
        const res = await warehouseMobileRequest('farm-return-session-open', {
          farm_location_id: selectedId || undefined,
        });
        setSessionId(String(res?.session_id || ''));
        setTransferRef(String(res?.transfer_ref || ''));
      } finally {
        setSessionOpening(false);
      }
    } catch (e) {
      setError(mapFarmWarehouseSetupError(
        e?.message || tUi('deliveryFarmCatalogFailed', locale),
        locale,
        tUi,
      ));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadFarm('');
  }, [loadFarm]);

  const cartQtyById = useMemo(() => {
    const map = {};
    for (const row of cart) {
      map[String(row.assembly_id)] = Math.max(0, Math.floor(Number(row.quantity) || 0));
    }
    return map;
  }, [cart]);

  const remainingQty = useCallback((product) => {
    const aid = String(product?.assembly_id || product?.id || '').trim();
    const farm = Math.max(0, Math.floor(Number(product?.farm_qty) || 0));
    const used = Math.max(0, Math.floor(Number(cartQtyById[aid]) || 0));
    return Math.max(0, farm - used);
  }, [cartQtyById]);

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    const list = [...(products || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    if (!q) return list;
    return list.filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const sku = String(p.family_sku || '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [products, search]);

  const addProductToCart = useCallback((product, qtyRaw) => {
    if (!product) {
      Alert.alert(
        tUi('deliveryFarmAlertPickProduct', locale),
        tUi('deliveryFarmAlertPickProductBody', locale),
      );
      return false;
    }
    const aid = String(product.assembly_id || product.id || '').trim();
    const farmMax = Math.max(0, Math.floor(Number(product.farm_qty) || 0));
    const used = Math.max(0, Math.floor(Number(cartQtyById[aid]) || 0));
    const max = Math.max(0, farmMax - used);
    const qty = Math.max(1, Math.floor(Number(qtyRaw) || 0));
    if (farmMax < 1 || max < 1) {
      Alert.alert(
        tUi('deliveryFarmAlertInsufficient', locale),
        tUi('deliveryFarmAlertAvailable', locale).replace('{n}', String(farmMax)),
      );
      return false;
    }
    if (qty > max) {
      Alert.alert(
        tUi('deliveryFarmAlertInsufficient', locale),
        tUi('deliveryFarmAlertAvailable', locale).replace('{n}', String(max)),
      );
      return false;
    }
    setCart((prev) => {
      const existing = prev.find((row) => row.assembly_id === aid);
      if (existing) {
        const nextQty = existing.quantity + qty;
        if (nextQty > farmMax) {
          Alert.alert(
            tUi('deliveryFarmAlertInsufficient', locale),
            tUi('deliveryFarmAlertExceeds', locale).replace('{n}', String(farmMax)),
          );
          return prev;
        }
        return prev.map((row) => (
          row.assembly_id === aid ? { ...row, quantity: nextQty } : row
        ));
      }
      return [...prev, {
        assembly_id: aid,
        name: product.name || aid,
        family_sku: product.family_sku || '',
        quantity: qty,
        max_qty: farmMax,
      }];
    });
    return true;
  }, [cartQtyById, locale]);

  const onScan = useCallback((value) => {
    const hit = matchProductByScan(productsRef.current, value);
    setScanOpen(false);
    if (!hit) {
      Alert.alert(
        tUi('deliveryFarmAlertNoMatch', locale),
        tUi('deliveryFarmAlertNoMatchBody', locale),
      );
      return;
    }
    const farmQty = Math.max(0, Number(hit.farm_qty) || 0);
    if (farmQty < 1) {
      Alert.alert(
        tUi('deliveryFarmAlertInsufficient', locale),
        tUi('deliveryFarmAlertAvailable', locale).replace('{n}', '0'),
      );
      return;
    }
    setScanQtyProduct(hit);
  }, [locale]);

  const onScanQtyConfirm = useCallback((qtyRaw) => {
    if (addProductToCart(scanQtyProduct, qtyRaw)) {
      setScanQtyProduct(null);
      setSearch('');
    }
  }, [addProductToCart, scanQtyProduct]);

  const goSignature = () => {
    if (!sessionId || !cart.length) {
      Alert.alert(
        tUi('deliveryFarmAlertEmptyCart', locale),
        tUi('deliveryFarmAlertEmptyCartBody', locale),
      );
      return;
    }
    if (creditDestination !== 'floor2' && creditDestination !== 'kitwe') {
      Alert.alert(
        tUi('deliveryFarmDestTitle', locale),
        tUi('deliveryFarmDestRequired', locale),
      );
      return;
    }
    const over = cart.find((line) => {
      const product = (products || []).find((p) => String(p.assembly_id || p.id) === String(line.assembly_id));
      const farmMax = Math.max(0, Math.floor(Number(product?.farm_qty ?? line.max_qty) || 0));
      return Math.floor(Number(line.quantity) || 0) > farmMax || farmMax < 1;
    });
    if (over) {
      Alert.alert(
        tUi('deliveryFarmAlertInsufficient', locale),
        tUi('deliveryFarmAlertExceeds', locale).replace(
          '{n}',
          String(Math.max(0, Math.floor(Number(
            (products || []).find((p) => String(p.assembly_id || p.id) === String(over.assembly_id))?.farm_qty
            ?? over.max_qty,
          ) || 0))),
        ),
      );
      return;
    }
    const shareGroups = cart.map((line) => ({
      assembly_name: line.name,
      units: line.quantity,
      lines: [],
    }));
    const lines = cart.map((line) => ({
      assembly_id: line.assembly_id,
      name: line.name,
      family_sku: line.family_sku,
      quantity: line.quantity,
    }));
    navigation.navigate('WarehouseFromFarmSignature', {
      sessionId,
      transferRef,
      lines,
      shareGroups,
      creditDestination,
      farmLocationId,
      farmLocationName,
    });
  };

  const cartTotal = cart.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

  const gridProducts = useMemo(
    () => (filtered || []).filter((p) => Math.max(0, Number(p.farm_qty) || 0) > 0),
    [filtered],
  );

  const onGridSelect = useCallback((p) => {
    if (remainingQty(p) < 1) {
      Alert.alert(
        tUi('deliveryFarmAlertInsufficient', locale),
        tUi('deliveryFarmAlertAvailable', locale).replace('{n}', String(Math.max(0, Number(p.farm_qty) || 0))),
      );
      return;
    }
    setScanQtyProduct(p);
  }, [locale, remainingQty]);

  const gridImageUrl = useCallback(
    (p) => resolveProductImageUrl(p?.floor2_image_url || p?.image_url || ''),
    [],
  );

  const gridQtyLabel = useCallback((p) => {
    const remain = remainingQty(p);
    const farm = Math.max(0, Number(p.farm_qty) || 0);
    return tUi('deliveryFarmOnHand', locale).replace('{n}', String(remain === farm ? farm : remain));
  }, [locale, remainingQty]);

  const gridSku = useCallback((p) => String(p?.family_sku || p?.sku || '').trim(), []);
  const gridDisabled = useCallback((p) => remainingQty(p) < 1, [remainingQty]);

  const listHeader = useMemo(() => (
    <>
      <ProductionKioskTopBar
        title={tUi('dashFarmDeliveries', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      {route?.params?.hideBack ? null : (
        <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
      )}
      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
      <View style={styles.heroCard}>
        {sessionOpening ? (
          <Text style={[styles.meta, { textAlign }]}>{tUi('deliveryFarmOpeningSession', locale)}</Text>
        ) : (
          <Text style={[styles.transferRef, { textAlign }]}>{transferRef || '—'}</Text>
        )}
        <Text style={[styles.meta, { textAlign }]}>
          {tUi('deliveryFarmFromFixed', locale).replace(
            '{name}',
            farmLocationName || tUi('deliveryFarmSourceTitle', locale),
          )}
        </Text>
        {farmLocations.length > 1 ? (
          <View style={styles.destRow}>
            {farmLocations.map((loc) => {
              const on = String(loc.id) === String(farmLocationId);
              return (
                <Pressable
                  key={loc.id}
                  style={[styles.destChip, on ? styles.destChipOn : null]}
                  onPress={() => {
                    if (on) return;
                    void loadFarm(String(loc.id));
                  }}
                >
                  <Text style={[styles.destChipText, on ? styles.destChipTextOn : null]}>
                    {loc.name || tUi('deliveryFarmSourceTitle', locale)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <Text style={[styles.destLabel, { textAlign }]}>
          {tUi('deliveryFarmDestTitle', locale)}
        </Text>
        <View style={styles.destRow}>
          <Pressable
            style={[
              styles.destChip,
              creditDestination === 'floor2' ? styles.destChipOn : null,
            ]}
            onPress={() => setCreditDestination('floor2')}
          >
            <Text style={[
              styles.destChipText,
              creditDestination === 'floor2' ? styles.destChipTextOn : null,
            ]}
            >
              {tUi('deliveryFarmDestFloor2', locale)}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.destChip,
              creditDestination === 'kitwe' ? styles.destChipOn : null,
            ]}
            onPress={() => setCreditDestination('kitwe')}
          >
            <Text style={[
              styles.destChipText,
              creditDestination === 'kitwe' ? styles.destChipTextOn : null,
            ]}
            >
              {tUi('deliveryFarmDestKitwe', locale)}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={[kiosk.field, styles.searchRow]}>
        <TextInput
          style={[kiosk.input, { flex: 1, textAlign }]}
          placeholder={tUi('deliveryFarmSearchPlaceholder', locale)}
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={styles.scanBtn}
          onPress={() => setScanOpen(true)}
          accessibilityLabel={tUi('deliveryFarmScanA11y', locale)}
        >
          <MaterialCommunityIcons name="barcode-scan" size={26} color="#fff" />
        </Pressable>
      </View>

      {loading ? (
        <Text style={{ textAlign, color: theme.textMuted }}>{tUi('loading', locale)}</Text>
      ) : null}
      {!loading && gridProducts.length === 0 ? (
        <Text style={[kiosk.metaLine, { textAlign }]}>{tUi('deliveryFarmNoProducts', locale)}</Text>
      ) : null}
    </>
  ), [
    creditDestination,
    error,
    farmLocationId,
    farmLocationName,
    farmLocations,
    gridProducts.length,
    loading,
    loadFarm,
    locale,
    navigation,
    route?.params?.hideBack,
    search,
    sessionOpening,
    textAlign,
    toggleLocale,
    transferRef,
  ]);

  const listFooter = useMemo(() => (
    <>
      <Text style={[styles.sectionTitle, { textAlign }]}>
        {tUi('deliveryFarmCartTitle', locale).replace('{n}', String(cartTotal))}
      </Text>
      {!cart.length ? (
        <Text style={[kiosk.metaLine, { textAlign, marginBottom: 8 }]}>
          {tUi('deliveryCartEmpty', locale)}
        </Text>
      ) : null}
      {cart.map((line) => (
        <View key={line.assembly_id} style={kiosk.cartCard}>
          <View style={kiosk.cartProductHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[kiosk.cartProductTitle, { textAlign }]} numberOfLines={3}>
                {line.name || line.assembly_id}
              </Text>
              {line.family_sku ? (
                <Text style={[kiosk.cartMeta, { textAlign }]} numberOfLines={1}>
                  {line.family_sku}
                </Text>
              ) : null}
              <Text style={[kiosk.cartMeta, { textAlign }]}>
                {tUi('deliveryQtyShort', locale).replace('{n}', String(line.quantity))}
              </Text>
            </View>
            <Pressable
              onPress={() => setCart((prev) => prev.filter((r) => r.assembly_id !== line.assembly_id))}
              hitSlop={8}
            >
              <Text style={styles.removeText}>{tUi('deliveryFarmRemove', locale)}</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {cart.length > 0 ? (
        <Pressable style={styles.continueBtn} onPress={goSignature}>
          <Text style={styles.continueBtnText}>{tUi('deliveryFarmContinue', locale)}</Text>
        </Pressable>
      ) : null}
    </>
  ), [
    cart,
    cartTotal,
    creditDestination,
    goSignature,
    locale,
    textAlign,
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <DeliveryWarehouseProductGrid
        items={gridProducts}
        selectedId=""
        onSelect={onGridSelect}
        getImageUrl={gridImageUrl}
        getQtyLabel={gridQtyLabel}
        getSku={gridSku}
        isItemDisabled={gridDisabled}
        extraData={cartQtyById}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={[
          styles.wrap,
          {
            paddingTop: insets.top + 8,
            paddingBottom: kioskFooterBottomPad(insets) + 24,
          },
        ]}
      />

      <ProductionQrScanModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={onScan}
        locale={locale}
        title={tUi('deliveryFarmScanTitle', locale)}
      />

      <DeliveryFarmQtyAddModal
        visible={Boolean(scanQtyProduct)}
        locale={locale}
        textAlign={textAlign}
        productName={scanQtyProduct?.name || ''}
        productSku={scanQtyProduct?.family_sku || ''}
        maxQty={scanQtyProduct ? remainingQty(scanQtyProduct) : 0}
        onClose={() => setScanQtyProduct(null)}
        onConfirm={onScanQtyConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: 16 },
  heroCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FARM.border,
    padding: 16,
    marginBottom: 12,
  },
  transferRef: { fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 4 },
  meta: { fontSize: 14, fontWeight: '600', color: theme.textSecondary, marginBottom: 4 },
  destLabel: { fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 12, marginBottom: 4 },
  destRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  destChip: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: FARM.bar,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: FARM.chip,
    justifyContent: 'center',
  },
  destChipOn: { backgroundColor: FARM.bar, borderColor: FARM.bar },
  destChipText: { textAlign: 'center', fontWeight: '800', color: FARM.chipText, fontSize: 15 },
  destChipTextOn: { color: '#fff' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: FARM.bar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: theme.text, marginTop: 12, marginBottom: 8 },
  removeText: { color: '#b91c1c', fontWeight: '800', fontSize: 14 },
  continueBtn: {
    marginTop: 12,
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: FARM.bar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
