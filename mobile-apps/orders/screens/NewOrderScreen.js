import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import ChipSelect from '../components/ChipSelect';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import {
  CARPENTRY_ACCESSORY_GROUPS,
  CARPENTRY_WOOD_OPTIONS,
  UPHOLSTERY_FOAM_OPTIONS,
  unitLabel,
} from '../lib/quoteLineFields';
import { theme } from '../shared/theme';
import {
  fetchOrdersCustomers,
  fetchOrdersProducts,
  fetchOrdersQuote,
  fetchOrdersUnits,
  saveOrdersQuote,
} from '../services/ordersApi';

function lineQty(line) {
  if (line.quantity === '' || line.quantity == null) return 1;
  const n = Number(line.quantity);
  return Number.isFinite(n) ? n : 0;
}

function emptyLineFromProduct(product) {
  return {
    key: `${product.id}-${Date.now()}`,
    quote_product_id: product.id,
    name: product.name,
    description: product.description || '',
    quantity: '1',
    unit_price: String(Number(product.price) || 0),
    unit_id: product.unit_id ? String(product.unit_id) : '',
    dim_l_cm: '',
    dim_w_cm: '',
    dim_h_cm: '',
    leather_code: '',
    foam_type: '',
    wood: '',
    color_code: '',
    accessories: [],
  };
}

export default function NewOrderScreen({ navigation, route, allowed, accessHint, onRefreshAccess }) {
  const quoteIdParam = route?.params?.quoteId;
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [custQ, setCustQ] = useState('');
  const [prodQ, setProdQ] = useState('');
  const [lines, setLines] = useState([]);
  const [routeChoice, setRouteChoice] = useState('');
  const [vatChoice, setVatChoice] = useState('');
  const [currency, setCurrency] = useState('K');
  const [quoteId, setQuoteId] = useState(quoteIdParam || '');
  const [openAccessories, setOpenAccessories] = useState('');

  const productionRouteMissing = !routeChoice;

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const [c, p, u] = await Promise.all([
        fetchOrdersCustomers(),
        fetchOrdersProducts(),
        fetchOrdersUnits(),
      ]);
      setCustomers(c.customers || []);
      setProducts((p.products || []).filter((row) => row.active !== false));
      setUnits(u.units || []);
      if (quoteIdParam) {
        const detail = await fetchOrdersQuote(quoteIdParam);
        const q = detail.quote || {};
        setQuoteId(q.id || quoteIdParam);
        setCustomerId(q.customer_id ? String(q.customer_id) : '');
        setCurrency(q.currency || 'K');
        setVatChoice(q.vat_apply ? 'vat16' : 'exclusive');
        setRouteChoice(String(detail.routing?.route || '').toLowerCase());
        setLines((detail.items || []).map((it) => ({
          key: String(it.id),
          quote_product_id: it.quote_product_id,
          name: it.name || it.name_override || '',
          description: it.description || '',
          quantity: it.quantity == null ? '1' : String(it.quantity),
          unit_price: it.unit_price == null ? '0' : String(it.unit_price),
          unit_id: it.unit_id ? String(it.unit_id) : '',
          dim_l_cm: it.dim_l_cm || '',
          dim_w_cm: it.dim_w_cm || '',
          dim_h_cm: it.dim_h_cm || '',
          leather_code: it.leather_code || '',
          foam_type: it.foam_type || '',
          wood: it.wood || '',
          color_code: it.color_code || '',
          accessories: Array.isArray(it.accessories) ? it.accessories : [],
        })));
      }
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setLoading(false);
    }
  }, [allowed, locale, quoteIdParam]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const addProduct = (product) => {
    if (productionRouteMissing) {
      Alert.alert(tUi('workshopRoute', locale), tUi('workshopRequired', locale));
      return;
    }
    setLines((prev) => [...prev, emptyLineFromProduct(product)]);
    setProdQ('');
  };

  const updateLine = (key, patch) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const toggleAccessory = (key, acc) => {
    setLines((prev) => prev.map((line) => {
      if (line.key !== key) return line;
      const current = line.accessories || [];
      const exists = current.some((a) => a.toLowerCase() === acc.toLowerCase());
      return {
        ...line,
        accessories: exists
          ? current.filter((a) => a.toLowerCase() !== acc.toLowerCase())
          : [...current, acc],
      };
    }));
  };

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, line) => s + lineQty(line) * Number(line.unit_price || 0), 0);
    const vatAmount = vatChoice === 'vat16' ? subtotal * 0.16 : 0;
    return { subtotal, vatAmount, total: subtotal + vatAmount };
  }, [lines, vatChoice]);

  const onSave = async () => {
    if (productionRouteMissing) {
      Alert.alert(tUi('workshopRoute', locale), tUi('workshopRequired', locale));
      return;
    }
    if (!vatChoice) {
      Alert.alert(tUi('vat', locale), 'Choose 0% or 16% VAT.');
      return;
    }
    if (!customerId) {
      Alert.alert(tUi('customer', locale), tUi('chooseCustomer', locale));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await saveOrdersQuote({
        id: quoteId || undefined,
        customer_id: customerId,
        currency,
        discount: 0,
        vat_choice: vatChoice,
        route: routeChoice,
        items: lines.map((line) => ({
          quote_product_id: line.quote_product_id,
          name: line.name,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price,
          unit_id: line.unit_id || null,
          dim_l_cm: line.dim_l_cm,
          dim_w_cm: line.dim_w_cm,
          dim_h_cm: line.dim_h_cm,
          leather_code: line.leather_code,
          foam_type: line.foam_type,
          wood: line.wood,
          color_code: line.color_code,
          accessories: line.accessories,
        })),
      });
      const createdId = res.quote_id || res.quote?.id || quoteId;
      navigation.replace('OrderDetail', { quoteId: createdId });
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setBusy(false);
    }
  };

  const customer = customers.find((c) => String(c.id) === String(customerId));
  const custNeedle = custQ.trim().toLowerCase();
  const visibleCustomers = !custNeedle
    ? []
    : customers.filter((c) => String(c.name || '').toLowerCase().includes(custNeedle)
      || String(c.phone || '').includes(custNeedle)).slice(0, 12);
  const prodNeedle = prodQ.trim().toLowerCase();
  const visibleProducts = !prodNeedle
    ? []
    : products.filter((p) => String(p.name || '').toLowerCase().includes(prodNeedle)
      || String(p.description || '').toLowerCase().includes(prodNeedle)).slice(0, 12);

  return (
    <OrdersScreenShell
      title={quoteId ? tUi('editQuote', locale) : tUi('tileNewOrder', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
          {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}

          <View style={[kiosk.card, productionRouteMissing && styles.routeMissing]}>
            <Text style={kiosk.metaLine}>{tUi('workshopRoute', locale)} · Required</Text>
            <Text style={kiosk.hint}>{tUi('workshopRequired', locale)}</Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.routeBtn, routeChoice === 'upholstery' && styles.routeOn]}
                onPress={() => setRouteChoice('upholstery')}
              >
                <Text style={kiosk.metaLine}>{tUi('routeUpholstery', locale)}</Text>
              </Pressable>
              <Pressable
                style={[styles.routeBtn, routeChoice === 'carpentry' && styles.routeOn]}
                onPress={() => setRouteChoice('carpentry')}
              >
                <Text style={kiosk.metaLine}>{tUi('routeCarpentry', locale)}</Text>
              </Pressable>
            </View>
          </View>

          <View style={kiosk.card}>
            <Text style={kiosk.label}>{tUi('customer', locale)}</Text>
            {customer ? (
              <Pressable onPress={() => setCustomerId('')}>
                <Text style={kiosk.metaLine}>{textForDisplay(customer.name, '')}</Text>
                <Text style={kiosk.hint}>{customer.phone || 'Tap to change'}</Text>
              </Pressable>
            ) : (
              <>
                <TextInput
                  style={kiosk.input}
                  value={custQ}
                  onChangeText={setCustQ}
                  placeholder={tUi('search', locale)}
                  placeholderTextColor={theme.textDim}
                />
                {!custNeedle ? <Text style={kiosk.hint}>Type to search customers.</Text> : null}
                {visibleCustomers.map((c) => (
                  <Pressable key={c.id} style={styles.pickRow} onPress={() => setCustomerId(String(c.id))}>
                    <Text style={kiosk.metaLine}>{textForDisplay(c.name, '')}</Text>
                    {c.phone ? <Text style={kiosk.hint}>{c.phone}</Text> : null}
                  </Pressable>
                ))}
              </>
            )}
          </View>

          <View style={kiosk.card}>
            <Text style={kiosk.label}>{tUi('vat', locale)}</Text>
            <View style={styles.row}>
              <Pressable style={[styles.routeBtn, vatChoice === 'exclusive' && styles.routeOn]} onPress={() => setVatChoice('exclusive')}>
                <Text style={kiosk.metaLine}>{tUi('vat0', locale)}</Text>
              </Pressable>
              <Pressable style={[styles.routeBtn, vatChoice === 'vat16' && styles.routeOn]} onPress={() => setVatChoice('vat16')}>
                <Text style={kiosk.metaLine}>{tUi('vat16', locale)}</Text>
              </Pressable>
            </View>
            <Text style={[kiosk.label, { marginTop: 12 }]}>{tUi('currency', locale)}</Text>
            <View style={styles.row}>
              {['K', '$'].map((code) => (
                <Pressable key={code} style={[styles.routeBtn, currency === code && styles.routeOn]} onPress={() => setCurrency(code)}>
                  <Text style={kiosk.metaLine}>{code}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={kiosk.card}>
            <Text style={kiosk.metaLine}>{tUi('addLine', locale)}</Text>
            <TextInput
              style={kiosk.input}
              value={prodQ}
              onChangeText={setProdQ}
              placeholder={tUi('search', locale)}
              placeholderTextColor={theme.textDim}
            />
            {!prodNeedle ? <Text style={kiosk.hint}>Type to search products.</Text> : null}
            {visibleProducts.map((p) => (
              <Pressable key={p.id} style={styles.pickRow} onPress={() => addProduct(p)}>
                <Text style={kiosk.metaLine}>{textForDisplay(p.name, '')}</Text>
                <Text style={kiosk.hint}>{Number(p.price || 0).toFixed(2)}</Text>
              </Pressable>
            ))}
          </View>

          {lines.map((line) => {
            const showUph = routeChoice === 'upholstery';
            const showCarp = routeChoice === 'carpentry';
            return (
              <View key={line.key} style={kiosk.card}>
                <View style={kiosk.field}>
                  <Text style={kiosk.label}>{tUi('product', locale)}</Text>
                  <TextInput style={kiosk.input} value={line.name} onChangeText={(v) => updateLine(line.key, { name: v })} />
                </View>
                <View style={kiosk.field}>
                  <Text style={kiosk.label}>{tUi('description', locale)}</Text>
                  <TextInput
                    style={[kiosk.input, styles.area]}
                    multiline
                    value={line.description}
                    onChangeText={(v) => updateLine(line.key, { description: v })}
                  />
                </View>
                <View style={kiosk.field}>
                  <Text style={kiosk.label}>{tUi('qty', locale)}</Text>
                  <TextInput
                    style={kiosk.input}
                    keyboardType="decimal-pad"
                    value={String(line.quantity)}
                    onChangeText={(v) => updateLine(line.key, { quantity: v })}
                  />
                </View>
                <ChipSelect
                  label={tUi('unit', locale)}
                  value={line.unit_id}
                  options={units.map((u) => ({ value: String(u.id), label: unitLabel(u) }))}
                  onChange={(v) => updateLine(line.key, { unit_id: v })}
                />
                <View style={kiosk.field}>
                  <Text style={kiosk.label}>{tUi('price', locale)}</Text>
                  <TextInput
                    style={kiosk.input}
                    keyboardType="decimal-pad"
                    value={String(line.unit_price)}
                    onChangeText={(v) => updateLine(line.key, { unit_price: v })}
                  />
                </View>
                {(showUph || showCarp) ? (
                  <>
                    <View style={styles.row}>
                      {[['dim_l_cm', 'dimL'], ['dim_w_cm', 'dimW'], ['dim_h_cm', 'dimH']].map(([key, labelKey]) => (
                        <View key={key} style={{ flex: 1 }}>
                          <Text style={kiosk.label}>{tUi(labelKey, locale)}</Text>
                          <TextInput
                            style={kiosk.input}
                            keyboardType="decimal-pad"
                            value={line[key]}
                            onChangeText={(v) => updateLine(line.key, { [key]: v })}
                          />
                        </View>
                      ))}
                    </View>
                    {showUph ? (
                      <>
                        <ChipSelect
                          label={tUi('wood', locale)}
                          value={line.wood}
                          options={CARPENTRY_WOOD_OPTIONS.map((o) => ({ value: o, label: o }))}
                          onChange={(v) => updateLine(line.key, { wood: v })}
                        />
                        <View style={kiosk.field}>
                          <Text style={kiosk.label}>{tUi('leather', locale)}</Text>
                          <TextInput
                            style={kiosk.input}
                            value={line.leather_code}
                            onChangeText={v => updateLine(line.key, { leather_code: v })}
                          />
                        </View>
                        <ChipSelect
                          label={tUi('foam', locale)}
                          value={line.foam_type}
                          options={UPHOLSTERY_FOAM_OPTIONS.map((o) => ({ value: o, label: o }))}
                          onChange={(v) => updateLine(line.key, { foam_type: v })}
                        />
                      </>
                    ) : null}
                    {showCarp ? (
                      <>
                        <ChipSelect
                          label={tUi('wood', locale)}
                          value={line.wood}
                          options={CARPENTRY_WOOD_OPTIONS.map((o) => ({ value: o, label: o }))}
                          onChange={(v) => updateLine(line.key, { wood: v })}
                        />
                        <View style={kiosk.field}>
                          <Text style={kiosk.label}>{tUi('color', locale)}</Text>
                          <TextInput
                            style={kiosk.input}
                            value={line.color_code}
                            onChangeText={(v) => updateLine(line.key, { color_code: v })}
                          />
                        </View>
                      </>
                    ) : null}
                    {showCarp ? (
                      <View style={kiosk.field}>
                        <Text style={kiosk.label}>{tUi('accessories', locale)}</Text>
                        <Pressable style={kiosk.btn} onPress={() => setOpenAccessories((prev) => (prev === line.key ? '' : line.key))}>
                          <Text style={kiosk.btnText}>
                            {openAccessories === line.key ? 'Hide' : `Select (${(line.accessories || []).length})`}
                          </Text>
                        </Pressable>
                        {(line.accessories || []).map((acc) => (
                          <Text key={acc} style={kiosk.hint}>• {acc}</Text>
                        ))}
                        {openAccessories === line.key ? CARPENTRY_ACCESSORY_GROUPS.map((group) => (
                          <View key={group.category} style={{ marginTop: 8 }}>
                            <Text style={kiosk.metaLine}>{group.category}</Text>
                            {group.items.map((acc) => {
                              const added = (line.accessories || []).some((a) => a.toLowerCase() === acc.toLowerCase());
                              return (
                                <Pressable key={acc} style={styles.pickRow} onPress={() => toggleAccessory(line.key, acc)}>
                                  <Text style={kiosk.hint}>{added ? '✓ ' : '+ '}{acc}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        )) : null}
                      </View>
                    ) : null}
                  </>
                ) : null}
                <Pressable style={[kiosk.btn, { marginTop: 8 }]} onPress={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                  <Text style={kiosk.btnText}>{tUi('remove', locale)}</Text>
                </Pressable>
              </View>
            );
          })}

          <View style={kiosk.card}>
            <Text style={kiosk.hint}>{tUi('subtotal', locale)} {currency} {totals.subtotal.toFixed(2)}</Text>
            <Text style={kiosk.hint}>{tUi('vat', locale)} {currency} {totals.vatAmount.toFixed(2)}</Text>
            <Text style={kiosk.metaLine}>{tUi('total', locale)} {currency} {totals.total.toFixed(2)}</Text>
          </View>

          <Pressable
            style={kiosk.btnPrimaryBlock}
            disabled={busy || productionRouteMissing || !customerId || !lines.length}
            onPress={onSave}
          >
            <Text style={kiosk.btnPrimaryBlockText}>
              {busy ? tUi('saving', locale) : (quoteId ? tUi('updateQuote', locale) : tUi('createQuote', locale))}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  routeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: theme.surface,
  },
  routeOn: { borderWidth: 2, borderColor: theme.primary, backgroundColor: '#dbeafe' },
  routeMissing: { borderColor: '#f59e0b', borderWidth: 2 },
  pickRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  area: { minHeight: 80, textAlignVertical: 'top' },
});
