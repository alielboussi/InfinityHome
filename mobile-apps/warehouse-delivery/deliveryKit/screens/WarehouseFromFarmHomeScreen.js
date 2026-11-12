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
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import ProductionQrScanModal from '../components/ProductionQrScanModal';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { mapFarmWarehouseSetupError, warehouseMobileRequest } from '../shared/warehouseMobileApi';
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

  const addToCart = useCallback(() => {
    if (!draftProduct) {
      Alert.alert(
        tUi('deliveryFarmAlertPickProduct', locale),
        tUi('deliveryFarmAlertPickProductBody', locale),
      );
      return;
    }
    const aid = String(draftProduct.assembly_id || draftProduct.id || '').trim();
    const qty = Math.max(1, Math.floor(Number(units) || 0));
    if (qty > maxUnits) {
      Alert.alert(
        tUi('deliveryFarmAlertInsufficient', locale),
        tUi('deliveryFarmAlertAvailable', locale).replace('{n}', String(maxUnits)),
      );
      return;
    }
    setCart((prev) => {
      const existing = prev.find((row) => row.assembly_id === aid);
      if (existing) {
        const nextQty = existing.quantity + qty;
        if (nextQty > maxUnits) {
          Alert.alert(
            tUi('deliveryFarmAlertInsufficient', locale),
            tUi('deliveryFarmAlertExceeds', locale).replace('{n}', String(maxUnits)),
          );
          return prev;
        }
        return prev.map((row) => (
          row.assembly_id === aid ? { ...row, quantity: nextQty } : row
        ));
      }
      return [...prev, {
        assembly_id: aid,
        name: draftProduct.name || aid,
        family_sku: draftProduct.family_sku || '',
        quantity: qty,
        max_qty: maxUnits,
      }];
    });
    setUnits('1');
    setDraftId('');
    setSearch('');
  }, [draftProduct, locale, maxUnits, units]);

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
    setDraftId(String(hit.assembly_id || hit.id || ''));
    setSearch(String(hit.family_sku || hit.name || ''));
  }, [locale]);

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
        {!loading && filtered.map((p) => {
          const id = String(p.assembly_id || p.id);
          const selected = draftId === id;
          const qty = Math.max(0, Number(p.farm_qty) || 0);
          return (
            <Pressable
              key={id}
              style={[kiosk.listRow, selected && styles.rowSelected]}
              onPress={() => setDraftId(id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={kiosk.listTitle}>{p.name || id}</Text>
                {p.family_sku ? <Text style={kiosk.listMeta}>{p.family_sku}</Text> : null}
                <Text style={kiosk.listMeta}>
                  {tUi('deliveryFarmOnHand', locale).replace('{n}', String(qty))}
                </Text>
              </View>
            </Pressable>
          );
        })}

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

        {cart.length > 0 ? (
          <View style={kiosk.card}>
            <Text style={[kiosk.title, { textAlign }]}>
              {tUi('deliveryFarmCartTitle', locale).replace('{n}', String(cartTotal))}
            </Text>
            {cart.map((line) => (
              <View key={line.assembly_id} style={styles.cartRow}>
                <Text style={{ flex: 1 }}>{line.name} × {line.quantity}</Text>
                <Pressable
                  onPress={() => setCart((prev) => prev.filter((r) => r.assembly_id !== line.assembly_id))}
                >
                  <Text style={{ color: theme.danger }}>{tUi('deliveryFarmRemove', locale)}</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={[kiosk.btnPrimaryBlock, { marginTop: 12 }]} onPress={goSignature}>
              <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliverySignatureTitle', locale)}</Text>
            </Pressable>
          </View>
        ) : null}
      </KioskSafeScroll>

      <ProductionQrScanModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={onScan}
        locale={locale}
        title={tUi('deliveryFarmScanTitle', locale)}
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
