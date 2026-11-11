import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import {
  fetchOrdersCustomers,
  fetchOrdersProducts,
  saveOrdersQuote,
  setOrdersQuoteRoute,
  sendOrdersQuoteProduction,
} from '../services/ordersApi';

export default function NewOrderScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [customer, setCustomer] = useState(null);
  const [custQ, setCustQ] = useState('');
  const [prodQ, setProdQ] = useState('');
  const [lines, setLines] = useState([]);
  const [route, setRoute] = useState('carpentry');

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const [c, p] = await Promise.all([fetchOrdersCustomers(), fetchOrdersProducts()]);
      setCustomers(c.customers || []);
      setProducts(p.products || []);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const addProduct = (product) => {
    setLines((prev) => [
      ...prev,
      {
        key: `${product.id}-${Date.now()}`,
        quote_product_id: product.id,
        name: product.name,
        quantity: 1,
        unit_price: Number(product.price) || 0,
        wood: '',
        color_code: '',
      },
    ]);
  };

  const updateLine = (key, patch) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const onSave = async ({ send } = {}) => {
    setBusy(true);
    setError('');
    try {
      const res = await saveOrdersQuote({
        customer_id: customer.id,
        currency: customer.currency || 'K',
        route,
        items: lines.map((line) => ({
          quote_product_id: line.quote_product_id,
          name: line.name,
          quantity: line.quantity,
          unit_price: line.unit_price,
          wood: line.wood,
          color_code: line.color_code,
        })),
      });
      const quoteId = res.quote_id || res.quote?.id;
      if (send && quoteId) {
        await setOrdersQuoteRoute(quoteId, route);
        await sendOrdersQuoteProduction(quoteId);
      }
      navigation.replace('OrderDetail', { quoteId });
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setBusy(false);
    }
  };

  const custNeedle = custQ.trim().toLowerCase();
  const visibleCustomers = customers.filter((c) => !custNeedle
    || String(c.name || '').toLowerCase().includes(custNeedle)
    || String(c.phone || '').includes(custNeedle)).slice(0, 8);
  const prodNeedle = prodQ.trim().toLowerCase();
  const visibleProducts = products.filter((p) => !prodNeedle
    || String(p.name || '').toLowerCase().includes(prodNeedle)).slice(0, 8);

  return (
    <OrdersScreenShell
      title={tUi('tileNewOrder', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
          <Text style={kiosk.metaLine}>{tUi('customer', locale)}</Text>
          {customer ? (
            <Pressable style={kiosk.card} onPress={() => setCustomer(null)}>
              <Text style={kiosk.metaLine}>{textForDisplay(customer.name, '')}</Text>
              <Text style={kiosk.hint}>{customer.phone || tUi('chooseCustomer', locale)}</Text>
            </Pressable>
          ) : (
            <>
              <TextInput style={styles.input} value={custQ} onChangeText={setCustQ} placeholder={tUi('search', locale)} placeholderTextColor={theme.textDim} />
              {visibleCustomers.map((c) => (
                <Pressable key={c.id} style={kiosk.card} onPress={() => setCustomer(c)}>
                  <Text style={kiosk.metaLine}>{textForDisplay(c.name, '')}</Text>
                  {c.phone ? <Text style={kiosk.hint}>{c.phone}</Text> : null}
                </Pressable>
              ))}
            </>
          )}

          <Text style={[kiosk.metaLine, { marginTop: 12 }]}>{tUi('addLine', locale)}</Text>
          <TextInput style={styles.input} value={prodQ} onChangeText={setProdQ} placeholder={tUi('search', locale)} placeholderTextColor={theme.textDim} />
          {visibleProducts.map((p) => (
            <Pressable key={p.id} style={kiosk.card} onPress={() => addProduct(p)}>
              <Text style={kiosk.metaLine}>{textForDisplay(p.name, '')}</Text>
              <Text style={kiosk.hint}>{p.price}</Text>
            </Pressable>
          ))}

          {lines.map((line) => (
            <View key={line.key} style={kiosk.card}>
              <Text style={kiosk.metaLine}>{line.name}</Text>
              <TextInput
                style={styles.input}
                value={String(line.quantity)}
                keyboardType="number-pad"
                onChangeText={(v) => updateLine(line.key, { quantity: v })}
                placeholder={tUi('qty', locale)}
                placeholderTextColor={theme.textDim}
              />
              <TextInput
                style={styles.input}
                value={line.wood}
                onChangeText={(v) => updateLine(line.key, { wood: v })}
                placeholder={tUi('wood', locale)}
                placeholderTextColor={theme.textDim}
              />
              <TextInput
                style={styles.input}
                value={line.color_code}
                onChangeText={(v) => updateLine(line.key, { color_code: v })}
                placeholder={tUi('color', locale)}
                placeholderTextColor={theme.textDim}
              />
            </View>
          ))}

          <View style={styles.row}>
            <Pressable style={[kiosk.card, styles.route, route === 'carpentry' && styles.routeOn]} onPress={() => setRoute('carpentry')}>
              <Text style={kiosk.metaLine}>{tUi('routeCarpentry', locale)}</Text>
            </Pressable>
            <Pressable style={[kiosk.card, styles.route, route === 'upholstery' && styles.routeOn]} onPress={() => setRoute('upholstery')}>
              <Text style={kiosk.metaLine}>{tUi('routeUpholstery', locale)}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[kiosk.btnPrimaryBlock, { marginTop: 8 }]}
            disabled={busy || !customer || !lines.length}
            onPress={() => onSave({ send: false })}
          >
            <Text style={kiosk.btnPrimaryBlockText}>{busy ? tUi('saving', locale) : tUi('save', locale)}</Text>
          </Pressable>
          <Pressable
            style={[kiosk.btn, { marginTop: 10 }]}
            disabled={busy || !customer || !lines.length}
            onPress={() => onSave({ send: true })}
          >
            <Text style={kiosk.btnText}>{tUi('sendProduction', locale)}</Text>
          </Pressable>
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    marginBottom: 8,
    backgroundColor: theme.surface,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  route: { flex: 1 },
  routeOn: { borderWidth: 2, borderColor: theme.primary },
});
