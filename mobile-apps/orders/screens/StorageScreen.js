import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import {
  fetchOrdersStoragePosDetail,
  fetchOrdersStoragePosSales,
  submitOrdersStorageSend,
} from '../services/ordersApi';

function lineMaxSendQty(line) {
  const sold = Math.max(0, Number(line?.sold_quantity ?? line?.quantity) || 0);
  const remaining = line?.remaining_to_send;
  if (remaining != null && Number.isFinite(Number(remaining))) {
    return Math.max(0, Math.floor(Number(remaining)));
  }
  return sold;
}

function clampSendQtyInput(raw, maxQty) {
  const max = Math.max(1, Math.floor(Number(maxQty) || 1));
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const n = Math.floor(Number(digits) || 1);
  return String(Math.min(max, Math.max(1, n)));
}

export default function StorageScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [sales, setSales] = useState([]);
  const [receiptQ, setReceiptQ] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [saleId, setSaleId] = useState('');
  const [detail, setDetail] = useState(null);
  const [lineState, setLineState] = useState({});
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const salesWarmedRef = useRef(false);

  const loadSalesIndex = useCallback(async () => {
    if (!allowed) return;
    const silent = salesWarmedRef.current;
    if (!silent) setLoading(true);
    setError('');
    try {
      const pos = await fetchOrdersStoragePosSales();
      setSales(pos.sales || pos.pos_sales || []);
      salesWarmedRef.current = true;
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      if (!salesWarmedRef.current) setSales([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void loadSalesIndex(); }, [loadSalesIndex]));

  const receiptOptions = useMemo(() => {
    const needle = receiptQ.trim().toLowerCase();
    if (!needle && !saleDate.trim()) return [];
    return sales.filter((s) => {
      const matchesReceipt = !needle
        || String(s.receipt_number || '').toLowerCase().includes(needle)
        || String(s.id || '').includes(needle);
      const dateKey = String(s.sale_date || s.created_at || '').slice(0, 10);
      const matchesDate = !saleDate.trim() || dateKey === saleDate.trim();
      return matchesReceipt && matchesDate;
    }).slice(0, 12);
  }, [sales, receiptQ, saleDate]);

  useEffect(() => {
    if (!saleId) {
      setDetail(null);
      setLineState({});
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setError('');
    fetchOrdersStoragePosDetail(saleId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        const next = {};
        (res.items || []).forEach((line) => {
          const max = lineMaxSendQty(line);
          next[String(line.id)] = {
            selected: false,
            quantity: max > 0 ? String(Math.min(max, 1)) : '0',
          };
        });
        setLineState(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || tUi('loadFailed', locale));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [saleId, locale]);

  const selectedLines = (detail?.items || []).filter((line) => lineState[String(line.id)]?.selected);

  const submit = async () => {
    if (!saleId || !selectedLines.length) {
      Alert.alert(tUi('receipt', locale), 'Select a receipt and at least one product line.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const lines = selectedLines.map((line) => {
        const st = lineState[String(line.id)] || {};
        const max = lineMaxSendQty(line);
        const qty = Math.max(1, Math.min(max, Math.floor(Number(st.quantity) || 1)));
        return { sale_item_id: line.id, quantity: qty };
      });
      const out = await submitOrdersStorageSend({ sale_id: saleId, lines });
      const sendsOut = out?.storage_sends || (out?.storage_send ? [out.storage_send] : []);
      const numbers = sendsOut.map((s) => s.storage_number).filter(Boolean).join(', ');
      const labelCount = Math.max(
        0,
        Number(out?.total_labels_printed)
          || sendsOut.reduce((n, s) => n + Math.max(0, Number(s.labels_printed) || 0), 0),
      );
      setNotice(
        numbers
          ? `${numbers} → Floor 1. ${labelCount} Zebra label${labelCount === 1 ? '' : 's'} printed.`
          : `Sent to Floor 1. ${labelCount} label(s) sent to Zebra.`,
      );
      setSaleId('');
      setReceiptQ('');
      setSaleDate('');
      setDetail(null);
      setLineState({});
      void loadSalesIndex();
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setBusy(false);
    }
  };

  const showFullSpinner = loading && !sales.length;

  return (
    <OrdersScreenShell
      title={tUi('tileStorage', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      {showFullSpinner ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={kiosk.hint}>
            Kitwe receipt → select lines → Send to Floor 1 moves stock and prints Zebra labels automatically.
          </Text>
          {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
          {notice ? <Text style={[kiosk.hint, { color: '#047857' }]}>{notice}</Text> : null}

          <View style={kiosk.card}>
            <View style={kiosk.field}>
              <Text style={kiosk.label}>{tUi('receipt', locale)}</Text>
              {saleId && detail?.sale ? (
                <Pressable onPress={() => { setSaleId(''); setReceiptQ(''); setSaleDate(''); }}>
                  <Text style={kiosk.metaLine}>{detail.sale.receipt_number}</Text>
                  <Text style={kiosk.hint}>Tap to change receipt</Text>
                </Pressable>
              ) : (
                <>
                  <TextInput
                    style={kiosk.input}
                    value={receiptQ}
                    onChangeText={setReceiptQ}
                    placeholder="Receipt #"
                    placeholderTextColor={theme.textDim}
                    autoCorrect={false}
                    autoCapitalize="characters"
                  />
                  <TextInput
                    style={[kiosk.input, { marginTop: 8 }]}
                    value={saleDate}
                    onChangeText={setSaleDate}
                    placeholder="Date YYYY-MM-DD (optional)"
                    placeholderTextColor={theme.textDim}
                    autoCorrect={false}
                  />
                  {!receiptQ.trim() && !saleDate.trim() ? (
                    <Text style={kiosk.hint}>Enter receipt # or date to search.</Text>
                  ) : null}
                  {receiptOptions.map((s) => (
                    <Pressable
                      key={String(s.id)}
                      style={styles.block}
                      onPress={() => {
                        setSaleId(String(s.id));
                        setReceiptQ('');
                      }}
                    >
                      <Text style={kiosk.hint}>
                        {s.receipt_number}
                        {s.sale_date ? ` · ${String(s.sale_date).slice(0, 10)}` : ''}
                        {s.customer_name ? ` · ${s.customer_name}` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
            {detail?.sale ? (
              <View style={{ marginBottom: 12 }}>
                {detail.sale.customer_name ? (
                  <Text style={kiosk.hint}>
                    {detail.sale.customer_name}
                    {detail.sale.customer_phone ? ` · ${detail.sale.customer_phone}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {detailLoading ? (
              <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} />
            ) : null}
            {(detail?.items || []).map((line) => {
              const st = lineState[String(line.id)] || {};
              const maxSend = lineMaxSendQty(line);
              const sold = Math.max(0, Number(line.sold_quantity ?? line.quantity) || 0);
              const alreadySent = Math.max(0, Number(line.already_sent) || 0);
              const fullySent = maxSend < 1;
              return (
                <View key={line.id} style={styles.block}>
                  <Pressable
                    disabled={fullySent}
                    onPress={() => setLineState((prev) => ({
                      ...prev,
                      [String(line.id)]: {
                        ...(prev[String(line.id)] || {}),
                        selected: !st.selected,
                        quantity: prev[String(line.id)]?.quantity ?? String(Math.min(maxSend, 1) || 1),
                      },
                    }))}
                  >
                    <Text style={[kiosk.metaLine, fullySent && { opacity: 0.55 }]}>
                      {st.selected ? '☑' : '☐'} {line.display_name}
                      <Text style={kiosk.hint}>
                        {' '}
                        sold {sold}
                        {alreadySent > 0 ? ` · sent ${alreadySent}` : ''}
                        {maxSend > 0 ? ` · send 1–${maxSend}` : ' · fully sent'}
                        {line.is_set && maxSend > 0
                          ? ` · ${line.labels_per_send_unit || 1} label(s) per set`
                          : ''}
                      </Text>
                    </Text>
                  </Pressable>
                  {st.selected && maxSend > 0 ? (
                    <View style={kiosk.field}>
                      <Text style={kiosk.label}>{tUi('qtyFloor1', locale)}</Text>
                      <TextInput
                        style={kiosk.input}
                        keyboardType="number-pad"
                        value={String(st.quantity)}
                        onChangeText={(v) => setLineState((prev) => ({
                          ...prev,
                          [String(line.id)]: {
                            ...(prev[String(line.id)] || {}),
                            quantity: clampSendQtyInput(v, maxSend),
                          },
                        }))}
                        onBlur={() => setLineState((prev) => ({
                          ...prev,
                          [String(line.id)]: {
                            ...(prev[String(line.id)] || {}),
                            quantity: clampSendQtyInput(prev[String(line.id)]?.quantity, maxSend) || '1',
                          },
                        }))}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
            <Pressable style={kiosk.btnPrimaryBlock} disabled={busy || !selectedLines.length} onPress={submit}>
              <Text style={kiosk.btnPrimaryBlockText}>{busy ? tUi('saving', locale) : tUi('sendFloor1', locale)}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  block: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: theme.surface,
  },
});
