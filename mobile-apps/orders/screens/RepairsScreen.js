import { useCallback, useEffect, useMemo, useState } from 'react';
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
import RepairReasonPickers from '../components/RepairReasonPickers';
import SearchPick from '../components/SearchPick';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import {
  returnOrderUnitLabel,
  returnReasonShowsLeatherCode,
} from '../lib/warehouseReturnUi';
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

function clampQty(raw, maxSold) {
  const n = Math.floor(Number(raw) || 1);
  return Math.max(1, Math.min(maxSold, n));
}

function syncUnits(prevUnits, qty) {
  const units = [...(prevUnits || [])];
  while (units.length < qty) units.push(emptyUnit());
  return units.slice(0, qty);
}

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
    setUnitLines((prev) => syncUnits(prev, n));
  }, [quantity]);

  useEffect(() => {
    if (!receiptSaleId) {
      setReceiptDetail(null);
      setReceiptLineState({});
      return;
    }
    fetchOrdersStoragePosDetail(receiptSaleId)
      .then((res) => setReceiptDetail(res))
      .catch((err) => setError(err?.message || tUi('loadFailed', locale)));
  }, [receiptSaleId, locale]);

  const kitweProductSelected = Boolean(String(assemblyId || '').trim());

  const receiptNeedle = receiptQ.trim().toLowerCase();
  const receiptOptions = useMemo(() => {
    let pool = sales;
    if (customerReturnMode && customerId) {
      pool = pool.filter((s) => String(s.customer_id || '') === String(customerId));
    }
    if (!receiptNeedle) return [];
    return pool
      .filter((s) => String(s.receipt_number || '').toLowerCase().includes(receiptNeedle)
        || String(s.id || '').includes(receiptNeedle))
      .slice(0, 12)
      .map((s) => ({
        value: String(s.id),
        label: `${s.receipt_number}${s.sale_date ? ` · ${String(s.sale_date).slice(0, 10)}` : ''}`,
      }));
  }, [sales, customerReturnMode, customerId, receiptNeedle]);

  const receiptReadyToSubmit = useMemo(() => {
    if (!receiptSaleId || !receiptDetail?.sale) return false;
    const items = receiptDetail.items || [];
    const selected = items.filter((line) => receiptLineState[String(line.id)]?.selected);
    if (!selected.length) return false;
    return selected.every((line) => {
      const st = receiptLineState[String(line.id)] || {};
      const qty = clampQty(st.quantity, line.quantity);
      const units = st.units || [];
      if (units.length !== qty) return false;
      return units.every((u) => String(u.reason || '').trim());
    });
  }, [receiptSaleId, receiptDetail, receiptLineState]);

  const kitweReadyToSubmit = useMemo(() => {
    if (!kitweProductSelected) return false;
    return unitLines.every((u) => String(u.reason || '').trim());
  }, [kitweProductSelected, unitLines]);

  const canSubmit = customerReturnMode ? receiptReadyToSubmit : kitweReadyToSubmit;

  const toggleReceiptLine = (line) => {
    const lineId = String(line.id);
    const sold = Math.max(1, Math.floor(Number(line.quantity) || 1));
    setReceiptLineState((prev) => {
      const st = prev[lineId] || {};
      const nextSelected = !st.selected;
      if (!nextSelected) {
        return { ...prev, [lineId]: { ...st, selected: false } };
      }
      const qty = clampQty(st.quantity ?? sold, sold);
      return {
        ...prev,
        [lineId]: {
          selected: true,
          quantity: String(qty),
          units: syncUnits(st.units, qty),
        },
      };
    });
  };

  const setReceiptLineQty = (line, rawQty) => {
    const lineId = String(line.id);
    const sold = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const qty = clampQty(rawQty, sold);
    setReceiptLineState((prev) => {
      const st = prev[lineId] || {};
      return {
        ...prev,
        [lineId]: {
          ...st,
          quantity: String(qty),
          units: syncUnits(st.units, qty),
        },
      };
    });
  };

  const updateReceiptUnit = (lineId, unitIndex, patch) => {
    setReceiptLineState((prev) => {
      const st = prev[lineId] || {};
      const units = [...(st.units || [])];
      units[unitIndex] = { ...units[unitIndex], ...patch };
      return { ...prev, [lineId]: { ...st, units } };
    });
  };

  const validateCustomerReturn = () => {
    if (!customerId) throw new Error('Select a customer first.');
    if (!receiptSaleId || !receiptDetail?.sale) throw new Error('Select a POS receipt for this customer.');
    const items = receiptDetail.items || [];
    const selected = items.filter((line) => receiptLineState[String(line.id)]?.selected);
    if (!selected.length) throw new Error('Select at least one product on the receipt.');
    const apiLines = [];
    selected.forEach((line) => {
      const st = receiptLineState[String(line.id)] || {};
      const units = st.units || [];
      const qty = clampQty(st.quantity, line.quantity);
      if (units.length !== qty) throw new Error(`Set quantity and reasons for ${line.display_name}.`);
      units.forEach((u, idx) => {
        const reason = String(u.reason || '').trim();
        if (!reason) {
          throw new Error(`Choose a repair reason for ${line.display_name} (unit ${idx + 1} of ${qty}).`);
        }
        apiLines.push({
          sale_item_id: line.id,
          quantity: 1,
          reason,
          reason_group: u.reason_group || undefined,
          leather_code: u.leather_code || undefined,
        });
      });
    });
    return apiLines;
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (customerReturnMode) {
        const lines = validateCustomerReturn();
        const out = await createOrdersReturn({
          sale_id: receiptSaleId,
          customer_id: customerId,
          lines,
        });
        setNotice(`Return note ${out?.return_number || ''} created.`);
        setReceiptSaleId('');
        setReceiptDetail(null);
        setReceiptLineState({});
        setReceiptQ('');
      } else {
        if (!assemblyId) throw new Error('Select a Kitwe product or choose a customer with a receipt.');
        const lines = unitLines.map((line, index) => {
          const reason = String(line.reason || '').trim();
          if (!reason) throw new Error(`Choose a repair reason for unit ${index + 1}.`);
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

  const kitweUnitPick = (index, patch) => {
    setUnitLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

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
            Customer return: customer → receipt # → tick products (reason required per unit). Kitwe: leave customer empty, pick a Kitwe product — reasons appear only then.
          </Text>
          {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
          {notice ? <Text style={[kiosk.hint, { color: '#047857' }]}>{notice}</Text> : null}

          <View style={kiosk.card}>
            <SearchPick
              label="Customer"
              value={customerId}
              options={customers.map((c) => ({ value: String(c.id), label: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` }))}
              onChange={(v) => {
                setCustomerId(v);
                setAssemblyId('');
                setReceiptSaleId('');
                setReceiptQ('');
                setReceiptDetail(null);
                setReceiptLineState({});
              }}
              placeholder="Search customer — leave empty for Kitwe catalog"
              searchRequired
              searchHint="Type to search customers"
            />

            {customerReturnMode ? (
              <>
                <View style={kiosk.field}>
                  <Text style={kiosk.label}>{tUi('receipt', locale)} (required)</Text>
                  {receiptSaleId && receiptDetail?.sale ? (
                    <Pressable onPress={() => {
                      setReceiptSaleId('');
                      setReceiptQ('');
                      setReceiptDetail(null);
                      setReceiptLineState({});
                    }}
                    >
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
                      {!receiptNeedle ? (
                        <Text style={kiosk.hint}>Type receipt number — only this customer&apos;s sales are listed.</Text>
                      ) : null}
                      {!receiptNeedle && customerId && !sales.some((s) => String(s.customer_id) === String(customerId)) ? (
                        <Text style={kiosk.hint}>No POS receipts found for this customer yet.</Text>
                      ) : null}
                      {receiptOptions.map((opt) => (
                        <Pressable
                          key={opt.value}
                          style={styles.pickRow}
                          onPress={() => {
                            setReceiptSaleId(opt.value);
                            setReceiptQ('');
                            setReceiptLineState({});
                          }}
                        >
                          <Text style={kiosk.hint}>{opt.label}</Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                </View>

                {receiptDetail?.sale ? (
                  <>
                    <Text style={[kiosk.metaLine, { marginTop: 8 }]}>Products on receipt (required)</Text>
                    {(receiptDetail.items || []).map((line) => {
                      const lineId = String(line.id);
                      const st = receiptLineState[lineId] || {};
                      const sold = Math.max(1, Math.floor(Number(line.quantity) || 1));
                      const selected = Boolean(st.selected);
                      return (
                        <View key={line.id} style={styles.block}>
                          <View style={styles.lineHead}>
                            <Pressable
                              style={styles.checkTouch}
                              onPress={() => toggleReceiptLine(line)}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: selected }}
                            >
                              <View style={[styles.box, selected && styles.boxOn]}>
                                {selected ? <Text style={styles.checkMark}>✓</Text> : null}
                              </View>
                            </Pressable>
                            <Text style={styles.productTitle} pointerEvents="none">
                              {line.display_name} (sold {sold})
                            </Text>
                          </View>
                          {selected ? (
                            <>
                              <View style={kiosk.field}>
                                <Text style={kiosk.label}>{tUi('qty', locale)} to send for repair</Text>
                                <TextInput
                                  style={kiosk.input}
                                  keyboardType="number-pad"
                                  value={String(st.quantity ?? sold)}
                                  onChangeText={(v) => setReceiptLineQty(line, v)}
                                />
                              </View>
                              {(st.units || []).map((unit, unitIndex) => (
                                <View key={`${lineId}-u-${unitIndex}`} style={styles.unitBlock}>
                                  <Text style={kiosk.metaLine}>Unit {unitIndex + 1} of {st.units.length}</Text>
                                  <RepairReasonPickers
                                    required
                                    value={unit}
                                    onChange={(picked) => updateReceiptUnit(lineId, unitIndex, picked)}
                                  />
                                  {returnReasonShowsLeatherCode(unit.reason) ? (
                                    <View style={kiosk.field}>
                                      <Text style={kiosk.label}>{tUi('leather', locale)}</Text>
                                      <TextInput
                                        style={kiosk.input}
                                        value={unit.leather_code || ''}
                                        onChangeText={(v) => updateReceiptUnit(lineId, unitIndex, { leather_code: v })}
                                      />
                                    </View>
                                  ) : null}
                                </View>
                              ))}
                            </>
                          ) : null}
                        </View>
                      );
                    })}
                  </>
                ) : (
                  <Text style={kiosk.hint}>Select a receipt to choose products.</Text>
                )}
              </>
            ) : (
              <>
                <SearchPick
                  label={tUi('product', locale)}
                  value={assemblyId}
                  options={productOpts}
                  onChange={(v) => {
                    setAssemblyId(v);
                    setQuantity('1');
                    setUnitLines([emptyUnit()]);
                  }}
                  placeholder="Search Kitwe product"
                  searchRequired
                  searchHint="Type to search Kitwe products"
                />
                {kitweProductSelected ? (
                  <>
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
                        <RepairReasonPickers
                          required
                          value={line}
                          onChange={(picked) => kitweUnitPick(index, picked)}
                        />
                        {returnReasonShowsLeatherCode(line.reason) ? (
                          <View style={kiosk.field}>
                            <Text style={kiosk.label}>{tUi('leather', locale)}</Text>
                            <TextInput
                              style={kiosk.input}
                              value={line.leather_code}
                              onChangeText={(v) => kitweUnitPick(index, { leather_code: v })}
                            />
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={kiosk.hint}>Select a Kitwe product to enter quantity and repair reasons.</Text>
                )}
              </>
            )}

            <Pressable
              style={[kiosk.btnPrimaryBlock, !canSubmit && styles.btnDisabled]}
              disabled={busy || !canSubmit}
              onPress={submit}
            >
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
  btnDisabled: { opacity: 0.45 },
  pickRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  block: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: theme.surface,
  },
  unitBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkTouch: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: theme.primary },
  checkMark: { color: '#fff', fontWeight: '900' },
  productTitle: { flex: 1, color: theme.text, fontWeight: '700', fontSize: 15 },
});
