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
import DeliveryFarmQtyAddModal from '../components/DeliveryFarmQtyAddModal';
import DeliveryWarehouseProductGrid from '../components/DeliveryWarehouseProductGrid';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import ProductionQrScanModal from '../components/ProductionQrScanModal';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { mapFarmWarehouseSetupError, warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { resolveProductImageUrl } from '../shared/lusakaStock/formatPrice';
import { theme } from '../shared/theme';

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

export default function WarehouseFromFarmHomeScreen({ navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [sessionOpening, setSessionOpening] = useState(false);
  const [cart, setCart] = useState([]);
  const [draftId, setDraftId] = useState('');
  const [units, setUnits] = useState('1');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanQtyProduct, setScanQtyProduct] = useState(null);
  const productsRef = useRef(products);
  productsRef.current = products;

  const openSession = useCallback(async () => {
    setSessionOpening(true);
    try {
      const res = await warehouseMobileRequest('farm-return-session-open', {});
      setSessionId(String(res?.session_id || ''));
      setTransferRef(String(res?.transfer_ref || ''));
    } catch (e) {
      setError(mapFarmWarehouseSetupError(
        e?.message || tUi('deliveryFarmSessionFailed', locale),
        locale,
        tUi,
      ));
    } finally {
      setSessionOpening(false);
    }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const catalog = await warehouseMobileRequest('farm-return-catalog', {});
        await openSession();
        if (cancelled) return;
        setProducts(Array.isArray(catalog?.products) ? catalog.products : []);
      } catch (e) {
        if (!cancelled) {
          setError(mapFarmWarehouseSetupError(
            e?.message || tUi('deliveryFarmCatalogFailed', locale),
            locale,
            tUi,
          ));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openSession, locale]);

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    const list = products || [];
    if (!q) return list.slice(0, 40);
    return list.filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const sku = String(p.family_sku || '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    }).slice(0, 40);
  }, [products, search]);

  const draftProduct = useMemo(
    () => (products || []).find((p) => String(p.assembly_id || p.id) === String(draftId)) || null,
    [products, draftId],
  );
  const maxUnits = Math.max(0, Math.floor(Number(draftProduct?.farm_qty) || 0));

  const addProductToCart = useCallback((product, qtyRaw) => {
    if (!product) {
      Alert.alert(
        tUi('deliveryFarmAlertPickProduct', locale),
        tUi('deliveryFarmAlertPickProductBody', locale),
      );
      return false;
    }
    const aid = String(product.assembly_id || product.id || '').trim();
    const max = Math.max(0, Math.floor(Number(product.farm_qty) || 0));
    const qty = Math.max(1, Math.floor(Number(qtyRaw) || 0));
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
        if (nextQty > max) {
          Alert.alert(
            tUi('deliveryFarmAlertInsufficient', locale),
            tUi('deliveryFarmAlertExceeds', locale).replace('{n}', String(max)),
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
        max_qty: max,
      }];
    });
    return true;
  }, [locale]);

  const addToCart = useCallback(() => {
    if (addProductToCart(draftProduct, units)) {
      setUnits('1');
      setDraftId('');
      setSearch('');
    }
  }, [addProductToCart, draftProduct, units]);

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
      setDraftId('');
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
    });
  };

  const cartTotal = cart.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

  return (
    <>
      <KioskSafeScroll contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <ProductionKioskTopBar
          title={tUi('deliveryFarmToWarehouseTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
        {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
        <View style={kiosk.card}>
          {sessionOpening ? (
            <Text style={[kiosk.metaLine, { textAlign }]}>{tUi('deliveryFarmOpeningSession', locale)}</Text>
          ) : (
            <Text style={[kiosk.heroNumber, { textAlign }]}>{transferRef || '—'}</Text>
          )}
          <Text style={[kiosk.metaLine, { textAlign }]}>
            {tUi('deliveryFarmReturnHint', locale)}
          </Text>
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
            style={kiosk.btnIcon}
            onPress={() => setScanOpen(true)}
            accessibilityLabel={tUi('deliveryFarmScanA11y', locale)}
          >
            <MaterialCommunityIcons name="barcode-scan" size={26} color={theme.primary} />
          </Pressable>
        </View>

        {loading ? (
          <Text style={{ textAlign, color: theme.textMuted }}>{tUi('loading', locale)}</Text>
        ) : null}
        {!loading && filtered.length > 0 ? (
          <DeliveryWarehouseProductGrid
            items={filtered.filter((p) => Math.max(0, Number(p.farm_qty) || 0) > 0)}
            selectedId={draftId}
            onSelect={(p) => setDraftId(String(p.assembly_id || p.id))}
            getImageUrl={(p) => resolveProductImageUrl(p?.floor2_image_url || p?.image_url || '')}
            getQtyLabel={(p) => {
              const qty = Math.max(0, Number(p.farm_qty) || 0);
              return tUi('deliveryFarmOnHand', locale).replace('{n}', String(qty));
            }}
          />
        ) : null}
        {!loading && filtered.length === 0 ? (
          <Text style={[kiosk.metaLine, { textAlign }]}>{tUi('deliveryFarmNoProducts', locale)}</Text>
        ) : null}

        {draftProduct ? (
          <View style={kiosk.card}>
            <Text style={[kiosk.label, { textAlign }]}>{tUi('deliveryFarmQtyLabel', locale)}</Text>
            <TextInput
              style={[kiosk.input, { textAlign }]}
              keyboardType="number-pad"
              value={units}
              onChangeText={setUnits}
            />
            <Text style={[kiosk.metaLine, { textAlign }]}>
              {tUi('deliveryFarmQtyMax', locale).replace('{n}', String(maxUnits))}
            </Text>
            <Pressable style={kiosk.btnPrimaryBlock} onPress={addToCart}>
              <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryFarmAddToCart', locale)}</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[kiosk.sectionTitle, { textAlign }]}>
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
                <Text style={kiosk.cartRemoveText}>{tUi('deliveryFarmRemove', locale)}</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {cart.length > 0 ? (
          <Pressable style={[kiosk.btnPrimaryBlock, { marginTop: 4 }]} onPress={goSignature}>
            <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliverySignatureTitle', locale)}</Text>
          </Pressable>
        ) : null}
      </KioskSafeScroll>

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
        maxQty={Math.max(0, Number(scanQtyProduct?.farm_qty) || 0)}
        onClose={() => setScanQtyProduct(null)}
        onConfirm={onScanQtyConfirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 24 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowSelected: { borderColor: theme.primary, borderWidth: 1 },
  cartRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
});
