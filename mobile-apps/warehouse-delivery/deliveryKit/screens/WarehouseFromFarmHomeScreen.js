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
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
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
      setError(e?.message || 'فشل فتح جلسة النقل');
    } finally {
      setSessionOpening(false);
    }
  }, []);

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
        if (!cancelled) setError(e?.message || 'فشل تحميل منتجات المزرعة');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openSession]);

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
      Alert.alert('اختر منتجاً', 'اختر من القائمة أو امسح الرمز.');
      return;
    }
    const aid = String(draftProduct.assembly_id || draftProduct.id || '').trim();
    const qty = Math.max(1, Math.floor(Number(units) || 0));
    if (qty > maxUnits) {
      Alert.alert('كمية غير كافية', `المتاح في المزرعة: ${maxUnits}`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((row) => row.assembly_id === aid);
      if (existing) {
        const nextQty = existing.quantity + qty;
        if (nextQty > maxUnits) {
          Alert.alert('كمية غير كافية', `يتجاوز المخزون في المزرعة (${maxUnits})`);
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
  }, [draftProduct, maxUnits, units]);

  const onScan = useCallback((value) => {
    const hit = matchProductByScan(productsRef.current, value);
    setScanOpen(false);
    if (!hit) {
      Alert.alert('لا يوجد تطابق', 'لا يوجد منتج في المزرعة لهذا المسح.');
      return;
    }
    setDraftId(String(hit.assembly_id || hit.id || ''));
    setSearch(String(hit.family_sku || hit.name || ''));
  }, []);

  const goSignature = () => {
    if (!sessionId || !cart.length) {
      Alert.alert('السلة فارغة', 'أضف منتجاً واحداً على الأقل.');
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
          title="الإرسال إلى المستودع"
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
        <View style={kiosk.card}>
          {sessionOpening ? (
            <Text style={[kiosk.metaLine, { textAlign }]}>جاري فتح النقل…</Text>
          ) : (
            <Text style={[kiosk.heroNumber, { textAlign }]}>{transferRef || '—'}</Text>
          )}
          <Text style={[kiosk.metaLine, { textAlign }]}>
            اختر منتجات المزرعة (كمية أكبر من صفر). تُنقل إلى مستودع الطابق 2 عند الإرسال.
          </Text>
        </View>

        <View style={[kiosk.field, styles.searchRow]}>
          <TextInput
            style={[kiosk.input, { flex: 1, textAlign }]}
            placeholder="بحث بالاسم أو SKU…"
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={kiosk.btnIcon} onPress={() => setScanOpen(true)} accessibilityLabel="Scan barcode">
            <MaterialCommunityIcons name="barcode-scan" size={26} color={theme.primary} />
          </Pressable>
        </View>

        {loading ? <Text style={{ textAlign, color: theme.textMuted }}>جاري التحميل…</Text> : null}
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
                <Text style={kiosk.listMeta}>المزرعة: {qty}</Text>
              </View>
            </Pressable>
          );
        })}

        {draftProduct ? (
          <View style={kiosk.card}>
            <Text style={[kiosk.label, { textAlign }]}>الكمية</Text>
            <TextInput
              style={[kiosk.input, { textAlign }]}
              keyboardType="number-pad"
              value={units}
              onChangeText={setUnits}
            />
            <Text style={[kiosk.metaLine, { textAlign }]}>
              الحد الأقصى {maxUnits} من المزرعة
            </Text>
            <Pressable style={kiosk.btnPrimaryBlock} onPress={addToCart}>
              <Text style={kiosk.btnPrimaryBlockText}>إضافة إلى السلة</Text>
            </Pressable>
          </View>
        ) : null}

        {cart.length > 0 ? (
          <View style={kiosk.card}>
            <Text style={[kiosk.title, { textAlign }]}>السلة ({cartTotal})</Text>
            {cart.map((line) => (
              <View key={line.assembly_id} style={styles.cartRow}>
                <Text style={{ flex: 1 }}>{line.name} × {line.quantity}</Text>
                <Pressable
                  onPress={() => setCart((prev) => prev.filter((r) => r.assembly_id !== line.assembly_id))}
                >
                  <Text style={{ color: theme.danger }}>إزالة</Text>
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
        title="مسح SKU (Code 128)"
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
