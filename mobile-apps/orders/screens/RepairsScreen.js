import { useCallback, useEffect, useState } from 'react';
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
import SearchPick from '../components/SearchPick';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import {
  returnOrderUnitLabel,
  returnReasonShowsLeatherCode,
} from '../lib/warehouseReturnUi';
import {
  applyRepairReasonPick,
  carpentryRepairReasonOptions,
  upholsteryRepairReasonOptions,
} from '../lib/repairReasonOptions';
import { theme } from '../shared/theme';
import {
  createOrdersReturn,
  fetchOrdersCustomers,
  fetchOrdersRepairs,
  fetchOrdersReturnProducts,
  fetchOrdersStoragePosDetail,
  fetchOrdersStoragePosSales,
} from '../services/ordersApi';

const emptyUnit = () => ({ reason: '', reason_group: '', leather_code: '' });

export default function RepairsScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [recent, setRecent] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [assemblyId, setAssemblyId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitLines, setUnitLines] = useState([emptyUnit()]);
  const [receiptQ, setReceiptQ] = useState('');
  const [receiptSaleId, setReceiptSaleId] = useState('');
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [receiptLineState, setReceiptLineState] = useState({});
  const customerReturnMode = Boolean(String(customerId || '').trim());

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const [prod, cust, repairs, pos] = await Promise.all([
        fetchOrdersReturnProducts(),
        fetchOrdersCustomers(),
        fetchOrdersRepairs(),
        fetchOrdersStoragePosSales().catch(() => ({ sales: [] })),
      ]);
      setProducts(prod.products || []);
      setCustomers(cust.customers || []);
      setRecent(Array.isArray(repairs.repairs) ? repairs.repairs.slice(0, 20) : []);
      setSales(pos.sales || pos.pos_sales || []);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    const n = Math.max(1, Math.floor(Number(quantity) || 1));
    setUnitLines((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(emptyUnit());
      return next.slice(0, n);
    });
  }, [quantity]);

  useEffect(() => {
    if (!receiptSaleId) {
      setReceiptDetail(null);
      return;
    }
    fetchOrdersStoragePosDetail(receiptSaleId)
      .then((res) => setReceiptDetail(res))
      .catch((err) => setError(err?.message || tUi('loadFailed', locale)));
  }, [receiptSaleId, locale]);

  const submit = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (customerReturnMode) {
        const selected = (receiptDetail?.items || []).filter((line) => receiptLineState[String(line.id)]?.selected);
        if (!receiptSaleId || !selected.length) throw new Error('Select a receipt and at least one product line.');
        const lines = selected.map((line) => {
          const st = receiptLineState[String(line.id)] || {};
          const reason = String(st.reason || '').trim();
          if (!reason) throw new Error(`Choose a reason for ${line.display_name}.`);
          return {
            sale_item_id: line.id,
            quantity: Math.max(1, Math.floor(Number(st.quantity) || 1)),
            reason,
            reason_group: st.reason_group || undefined,
            leather_code: st.leather_code || undefined,
          };
        });
        const out = await createOrdersReturn({
          sale_id: receiptSaleId,
          customer_id: customerId,
          lines,
        });
        setNotice(`Return note ${out?.return_number || ''} created.`);
        setReceiptSaleId('');
        setReceiptDetail(null);
        setReceiptLineState({});
      } else {
        const lines = unitLines.map((line, index) => {
          const reason = String(line.reason || '').trim();
          if (!reason) throw new Error(`Choose a reason for unit ${index + 1}.`);
          return {
            reason,
            reason_group: line.reason_group || undefined,
            leather_code: line.leather_code || undefined,
            quantity: 1,
          };
        });
        const out = await createOrdersReturn({ assembly_id: assemblyId, lines });
        setNotice(`Return note ${out?.return_number || out?.return_order?.return_number || ''} created.`);
        setAssemblyId('');
        setUnitLines([emptyUnit()]);
        setQuantity('1');
      }
      await load();
    } catch (err) {
      Alert.alert('Return failed', err?.message || '');
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setBusy(false);
    }
  };

  const productOpts = products.map((p) => ({
    value: String(p.assembly_id || p.id),
    label: `${p.name || p.assembly_name}${p.kitwe_qty != null ? ` · stock ${p.kitwe_qty}` : ''}`,
  }));

  const receiptNeedle = receiptQ.trim().toLowerCase();
  const receiptOptions = !receiptNeedle
    ? []
    : sales
      .filter((s) => String(s.receipt_number || '').toLowerCase().includes(receiptNeedle)
        || String(s.id || '').includes(receiptNeedle))
      .slice(0, 12)
      .map((s) => ({
        value: String(s.id),
        label: `${s.receipt_number}${s.sale_date ? ` · ${String(s.sale_date).slice(0, 10)}` : ''}`,
      }));

  return (
    <OrdersScreenShell
      title={tUi('tileRepairs', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={kiosk.hint}>
            With a customer selected, choose their POS receipt. Without a customer, pick a Kitwe catalog product.
          </Text>
          {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
          {notice ? <Text style={[kiosk.hint, { color: '#047857' }]}>{notice}</Text> : null}

          <View style={kiosk.card}>
            <SearchPick
              label="Customer (optional)"
              value={customerId}
              options={customers.map((c) => ({ value: String(c.id), label: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` }))}
              onChange={(v) => { setCustomerId(v); setAssemblyId(''); setReceiptSaleId(''); setReceiptQ(''); }}
              placeholder="Search customer — leave empty for Kitwe catalog"
              searchRequired
              searchHint="Type to search customers"
            />

            {customerReturnMode ? (
              <>
                <View style={kiosk.field}>
                  <Text style={kiosk.label}>{tUi('receipt', locale)}</Text>
                  {receiptSaleId && receiptDetail?.sale ? (
                    <Pressable onPress={() => { setReceiptSaleId(''); setReceiptQ(''); setReceiptDetail(null); }}>
                      <Text style={kiosk.metaLine}>{receiptDetail.sale.receipt_number}</Text>
                      <Text style={kiosk.hint}>Tap to change receipt</Text>
                    </Pressable>
                  ) : (
                    <>
                      <TextInput
                        style={kiosk.input}
                        value={receiptQ}
                        onChangeText={setReceiptQ}
                        placeholder="Search receipt #"
                        placeholderTextColor={theme.textDim}
                      />
                      {!receiptNeedle ? <Text style={kiosk.hint}>Type receipt number to search.</Text> : null}
                      {receiptOptions.map((opt) => (
                        <Pressable
                          key={opt.value}
                          style={styles.block}
                          onPress={() => {
                            setReceiptSaleId(opt.value);
                            setReceiptQ('');
                          }}
                        >
                          <Text style={kiosk.hint}>{opt.label}</Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                </View>
                {(receiptDetail?.items || []).map((line) => {
                  const st = receiptLineState[String(line.id)] || {};
                  return (
                    <View key={line.id} style={styles.block}>
                      <Pressable
                        onPress={() => setReceiptLineState((prev) => ({
                          ...prev,
                          [String(line.id)]: { ...prev[String(line.id)], selected: !st.selected },
                        }))}
                      >
                        <Text style={kiosk.metaLine}>{st.selected ? '☑' : '☐'} {line.display_name} (sold {line.quantity})</Text>
                      </Pressable>
                      {st.selected ? (
                        <>
                          <View style={kiosk.field}>
                            <Text style={kiosk.label}>{tUi('qty', locale)}</Text>
                            <TextInput
                              style={kiosk.input}
                              keyboardType="number-pad"
                              value={String(st.quantity ?? line.quantity)}
                              onChangeText={(v) => setReceiptLineState((prev) => ({
                                ...prev,
                                [String(line.id)]: { ...prev[String(line.id)], quantity: v },
                              }))}
                            />
                          </View>
                          <View style={styles.reasonRow}>
                            <View style={{ flex: 1 }}>
                              <ChipSelect
                                label="Upholstery reason"
                                value={st.reason_group === 'upholstery' && st.reason ? `upholstery::${st.reason}` : ''}
                                options={upholsteryRepairReasonOptions()}
                                onChange={(v) => {
                                  const picked = applyRepairReasonPick(v);
                                  setReceiptLineState((prev) => ({
                                    ...prev,
                                    [String(line.id)]: {
                                      ...prev[String(line.id)],
                                      ...picked,
                                    },
                                  }));
                                }}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <ChipSelect
                                label="Carpentry reason"
                                value={st.reason_group === 'carpentry' && st.reason ? `carpentry::${st.reason}` : ''}
                                options={carpentryRepairReasonOptions()}
                                onChange={(v) => {
                                  const picked = applyRepairReasonPick(v);
                                  setReceiptLineState((prev) => ({
                                    ...prev,
                                    [String(line.id)]: {
                                      ...prev[String(line.id)],
                                      ...picked,
                                    },
                                  }));
                                }}
                              />
                            </View>
                          </View>
                          {returnReasonShowsLeatherCode(st.reason) ? (
                            <View style={kiosk.field}>
                              <Text style={kiosk.label}>{tUi('leather', locale)}</Text>
                              <TextInput
                                style={kiosk.input}
                                value={st.leather_code || ''}
                                onChangeText={(v) => setReceiptLineState((prev) => ({
                                  ...prev,
                                  [String(line.id)]: { ...prev[String(line.id)], leather_code: v },
                                }))}
                              />
                            </View>
                          ) : null}
                        </>
                      ) : null}
                    </View>
                  );
                })}
              </>
            ) : (
              <>
                <SearchPick
                  label={tUi('product', locale)}
                  value={assemblyId}
                  options={productOpts}
                  onChange={setAssemblyId}
                  placeholder="Search Kitwe product"
                  searchRequired
                  searchHint="Type to search Kitwe products"
                />
                <View style={kiosk.field}>
                  <Text style={kiosk.label}>{tUi('qty', locale)}</Text>
                  <TextInput
                    style={kiosk.input}
                    keyboardType="number-pad"
                    value={quantity}
                    onChangeText={setQuantity}
                  />
                </View>
                {unitLines.map((line, index) => (
                  <View key={`unit-${index}`} style={styles.block}>
                    <Text style={kiosk.metaLine}>Unit {index + 1}</Text>
                    <View style={styles.reasonRow}>
                      <View style={{ flex: 1 }}>
                        <ChipSelect
                          label="Upholstery reason"
                          value={line.reason_group === 'upholstery' && line.reason ? `upholstery::${line.reason}` : ''}
                          options={upholsteryRepairReasonOptions()}
                          onChange={(v) => {
                            const picked = applyRepairReasonPick(v);
                            setUnitLines((prev) => prev.map((row, i) => (
                              i === index ? { ...row, ...picked } : row
                            )));
                          }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ChipSelect
                          label="Carpentry reason"
                          value={line.reason_group === 'carpentry' && line.reason ? `carpentry::${line.reason}` : ''}
                          options={carpentryRepairReasonOptions()}
                          onChange={(v) => {
                            const picked = applyRepairReasonPick(v);
                            setUnitLines((prev) => prev.map((row, i) => (
                              i === index ? { ...row, ...picked } : row
                            )));
                          }}
                        />
                      </View>
                    </View>
                    {returnReasonShowsLeatherCode(line.reason) ? (
                      <View style={kiosk.field}>
                        <Text style={kiosk.label}>{tUi('leather', locale)}</Text>
                        <TextInput
                          style={kiosk.input}
                          value={line.leather_code}
                          onChangeText={(v) => setUnitLines((prev) => prev.map((row, i) => (
                            i === index ? { ...row, leather_code: v } : row
                          )))}
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
              </>
            )}

            <Pressable style={kiosk.btnPrimaryBlock} disabled={busy} onPress={submit}>
              <Text style={kiosk.btnPrimaryBlockText}>{busy ? tUi('saving', locale) : tUi('createReturn', locale)}</Text>
            </Pressable>
          </View>

          {recent.map((row) => (
            <View key={row.id} style={kiosk.card}>
              <Text style={kiosk.metaLine}>{returnOrderUnitLabel(row)}</Text>
              <Text style={kiosk.hint}>{textForDisplay(row.assembly_name, '')} × {row.quantity}</Text>
              <Text style={kiosk.hint}>{[row.customer_name, row.status, row.reason].filter(Boolean).join(' · ')}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  reasonRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  block: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: theme.surface,
  },
});
