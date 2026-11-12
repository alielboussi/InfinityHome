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
import StorageLabelPreviewModal from '../components/StorageLabelPreviewModal';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import {
  fetchOrdersStoragePosDetail,
  fetchOrdersStoragePosSales,
  submitOrdersStorageSend,
  testOrdersStorageLabel,
} from '../services/ordersApi';

export default function StorageScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [sales, setSales] = useState([]);
  const [receiptQ, setReceiptQ] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [saleId, setSaleId] = useState('');
  const [detail, setDetail] = useState(null);
  const [lineState, setLineState] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [labelPreview, setLabelPreview] = useState(null);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelPrintError, setLabelPrintError] = useState('');
  const [labelPrinted, setLabelPrinted] = useState(false);

  const loadSalesIndex = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const pos = await fetchOrdersStoragePosSales();
      setSales(pos.sales || pos.pos_sales || []);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      setSales([]);
    } finally {
      setLoading(false);
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
      return;
    }
    fetchOrdersStoragePosDetail(saleId)
      .then((res) => {
        setDetail(res);
        const next = {};
        (res.items || []).forEach((line) => {
          next[String(line.id)] = { selected: false, quantity: Math.max(1, Number(line.quantity) || 1) };
        });
        setLineState(next);
      })
      .catch((err) => setError(err?.message || tUi('loadFailed', locale)));
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
        const qty = Math.max(1, Math.min(line.quantity, Math.floor(Number(st.quantity) || 1)));
        return { sale_item_id: line.id, quantity: qty };
      });
      const out = await submitOrdersStorageSend({ sale_id: saleId, lines });
      const sendsOut = out?.storage_sends || (out?.storage_send ? [out.storage_send] : []);
      const numbers = sendsOut.map((s) => s.storage_number).filter(Boolean).join(', ');
      const labelCount = lines.reduce((n, l) => n + Math.max(1, Math.floor(Number(l.quantity) || 1)), 0);
      setNotice(
        numbers
          ? `${numbers} → Floor 1. ${labelCount} Zebra label${labelCount === 1 ? '' : 's'} (Code 128, QR, receipt, customer).`
          : `Sent to Floor 1. ${labelCount} label(s) sent to Zebra.`,
      );
      setSaleId('');
      setReceiptQ('');
      setSaleDate('');
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setBusy(false);
    }
  };

  const runLabelTest = async (printToZebra) => {
    setLabelBusy(true);
    setLabelPrintError('');
    setLabelPrinted(false);
    try {
      const firstSelected = selectedLines[0];
      const res = await testOrdersStorageLabel({
        print: printToZebra,
        sale_id: saleId || undefined,
        sale_item_id: firstSelected ? String(firstSelected.id) : undefined,
      });
      setLabelPreview({
        png: res.label_preview_png_base64,
        meta: res.label,
      });
      if (res.print_error) setLabelPrintError(res.print_error);
      if (printToZebra && res.print_result && !res.print_error) setLabelPrinted(true);
    } catch (err) {
      Alert.alert('Label test', err?.message || tUi('loadFailed', locale));
    } finally {
      setLabelBusy(false);
    }
  };

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
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={kiosk.hint}>
            Kitwe receipt → select lines → Send to Floor 1 moves stock and prints 80×68 mm Zebra labels
            (Code 128 SKU, product QR, receipt #, customer name and phone, sale date).
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
                  />
                  <TextInput
                    style={[kiosk.input, { marginTop: 8 }]}
                    value={saleDate}
                    onChangeText={setSaleDate}
                    placeholder="Date YYYY-MM-DD (optional)"
                    placeholderTextColor={theme.textDim}
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
            {(detail?.items || []).map((line) => {
              const st = lineState[String(line.id)] || {};
              return (
                <View key={line.id} style={styles.block}>
                  <Pressable
                    onPress={() => setLineState((prev) => ({
                      ...prev,
                      [String(line.id)]: { ...(prev[String(line.id)] || {}), selected: !st.selected },
                    }))}
                  >
                    <Text style={kiosk.metaLine}>
                      {st.selected ? '☑' : '☐'} {line.display_name}
                      <Text style={kiosk.hint}>  sold {line.quantity}</Text>
                    </Text>
                  </Pressable>
                  {st.selected ? (
                    <View style={kiosk.field}>
                      <Text style={kiosk.label}>{tUi('qtyFloor1', locale)}</Text>
                      <TextInput
                        style={kiosk.input}
                        keyboardType="number-pad"
                        value={String(st.quantity)}
                        onChangeText={(v) => setLineState((prev) => ({
                          ...prev,
                          [String(line.id)]: { ...(prev[String(line.id)] || {}), quantity: v },
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
            <View style={styles.testRow}>
              <Pressable
                style={[kiosk.btn, styles.testBtn]}
                disabled={labelBusy}
                onPress={() => void runLabelTest(false)}
              >
                <Text style={kiosk.btnText}>{labelBusy ? '…' : 'Preview sample label'}</Text>
              </Pressable>
              <Pressable
                style={[kiosk.btn, styles.testBtn]}
                disabled={labelBusy}
                onPress={() => void runLabelTest(true)}
              >
                <Text style={kiosk.btnText}>{labelBusy ? '…' : 'Print test label'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}
      <StorageLabelPreviewModal
        visible={Boolean(labelPreview)}
        onClose={() => {
          setLabelPreview(null);
          setLabelPrintError('');
          setLabelPrinted(false);
        }}
        pngBase64={labelPreview?.png}
        labelMeta={labelPreview?.meta}
        printError={labelPrintError}
        printed={labelPrinted}
      />
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  testRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  testBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  block: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: theme.surface,
  },
});
