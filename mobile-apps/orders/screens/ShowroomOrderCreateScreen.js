import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import {
  createOrdersShowroomQuote,
  fetchOrdersShowroomFloor2,
} from '../services/ordersApi';

function productImage(p) {
  return String(p?.floor2_image_url || p?.image_url || '').trim();
}

export default function ShowroomOrderCreateScreen({
  navigation,
  allowed,
  accessHint,
  onRefreshAccess,
}) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const list = await fetchOrdersShowroomFloor2();
      setProducts(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('loadFailed', locale));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const sku = String(p.family_sku || '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [products, search]);

  const cartRoute = cart.length ? String(cart[0].route || '').toLowerCase() : '';

  const addLine = (product) => {
    const aid = String(product.assembly_id || '').trim();
    if (!aid) return;
    const maxQty = Math.max(0, Number(product.quantity) || 0);
    if (maxQty < 1) return;
    const route = String(product.workshop_route || 'carpentry').toLowerCase();
    if (cart.length && cartRoute && cartRoute !== route) {
      Alert.alert(
        tUi('showroomMixedWorkshopTitle', locale),
        tUi('showroomMixedWorkshopBody', locale),
      );
      return;
    }
    if (cart.some((c) => c.assembly_id === aid)) return;
    setCart((prev) => [...prev, {
      assembly_id: aid,
      name: product.name,
      route,
      maxQty,
      quantity: 1,
      image_url: productImage(product),
    }]);
  };

  const setLineQty = (aid, text) => {
    const n = Math.max(1, Math.floor(Number(text) || 1));
    setCart((prev) => prev.map((l) => (
      l.assembly_id === aid ? { ...l, quantity: Math.min(n, l.maxQty) } : l
    )));
  };

  const removeLine = (aid) => setCart((prev) => prev.filter((l) => l.assembly_id !== aid));

  const submit = async () => {
    if (!cart.length || busy) return;
    setBusy(true);
    try {
      const res = await createOrdersShowroomQuote(
        cart.map((l) => ({
          assembly_id: l.assembly_id,
          quantity: l.quantity,
          route: l.route,
        })),
      );
      const dept = res.route === 'carpentry' ? tUi('routeCarpentry', locale) : tUi('routeUpholstery', locale);
      Alert.alert(
        tUi('showroomCreatedTitle', locale),
        `${res.quote_number || ''}\n${tUi('showroomCreatedSent', locale)} ${dept}.`,
        [{
          text: tUi('close', locale),
          onPress: () => navigation.navigate('ShowroomOrders'),
        }],
      );
      setCart([]);
    } catch (e) {
      Alert.alert(tUi('loadFailed', locale), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OrdersScreenShell
      title={tUi('tileNewShowroomOrder', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      <Text style={[kiosk.hint, { marginBottom: 8 }]}>{tUi('showroomCreateIntro', locale)}</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={tUi('showroomFloor2Search', locale)}
        placeholderTextColor={theme.textDim}
        style={[kiosk.input, { marginBottom: 10 }]}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading && !products.length ? (
        <ActivityIndicator color={theme.primary} />
      ) : (
        <FlatList
          style={{ flex: 1, maxHeight: 280 }}
          data={filtered}
          keyExtractor={(item) => String(item.assembly_id)}
          ListEmptyComponent={<Text style={kiosk.hint}>{tUi('showroomFloor2Empty', locale)}</Text>}
          renderItem={({ item }) => {
            const inCart = cart.some((c) => c.assembly_id === item.assembly_id);
            const maxQty = Math.max(0, Number(item.quantity) || 0);
            const img = productImage(item);
            const route = item.workshop_route === 'upholstery'
              ? tUi('routeUpholstery', locale)
              : tUi('routeCarpentry', locale);
            return (
              <Pressable
                style={[kiosk.card, styles.pickRow, (maxQty < 1 || inCart) && styles.pickDisabled]}
                disabled={maxQty < 1 || inCart}
                onPress={() => addLine(item)}
              >
                {img ? <Image source={{ uri: img }} style={styles.thumb} resizeMode="cover" /> : null}
                <Text style={styles.pickName}>{item.name}</Text>
                <Text style={kiosk.hint}>
                  {tUi('showroomStockLabel', locale)}: {maxQty} · {route}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <Text style={[styles.cartTitle, { color: theme.text }]}>{tUi('showroomCartTitle', locale)}</Text>
      {!cart.length ? (
        <Text style={kiosk.hint}>{tUi('showroomCartEmpty', locale)}</Text>
      ) : (
        cart.map((line) => (
          <View key={line.assembly_id} style={[kiosk.card, styles.cartLine]}>
            {line.image_url ? (
              <Image source={{ uri: line.image_url }} style={styles.cartThumb} resizeMode="cover" />
            ) : null}
            <Text style={styles.pickName}>{line.name}</Text>
            <View style={styles.qtyRow}>
              <Text style={kiosk.hint}>{tUi('qty', locale)}</Text>
              <TextInput
                keyboardType="number-pad"
                value={String(line.quantity)}
                onChangeText={(t) => setLineQty(line.assembly_id, t)}
                style={[kiosk.input, styles.qtyInput]}
              />
              <Text style={kiosk.hint}>max {line.maxQty}</Text>
            </View>
            <Pressable onPress={() => removeLine(line.assembly_id)}>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>{tUi('remove', locale)}</Text>
            </Pressable>
          </View>
        ))
      )}

      <Pressable
        style={[kiosk.btn, styles.submitBtn, (!cart.length || busy) && styles.submitDisabled]}
        disabled={!cart.length || busy}
        onPress={submit}
      >
        <Text style={kiosk.btnText}>
          {busy ? tUi('saving', locale) : tUi('showroomCreateSubmit', locale)}
        </Text>
      </Pressable>
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  pickRow: { marginBottom: 8 },
  pickDisabled: { opacity: 0.45 },
  thumb: { width: '100%', height: 100, borderRadius: 8, marginBottom: 6, backgroundColor: '#e2e8f0' },
  pickName: { fontWeight: '700', fontSize: 15, color: theme.text },
  cartTitle: { fontWeight: '800', fontSize: 16, marginTop: 12, marginBottom: 6 },
  cartLine: { marginBottom: 8 },
  cartThumb: { width: 72, height: 72, borderRadius: 6, marginBottom: 6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 },
  qtyInput: { width: 64, minHeight: 40, textAlign: 'center' },
  submitBtn: { marginTop: 12, marginBottom: 24, backgroundColor: '#1565c0' },
  submitDisabled: { opacity: 0.5 },
});