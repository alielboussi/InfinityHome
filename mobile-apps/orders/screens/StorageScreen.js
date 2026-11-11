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
import SearchPick from '../components/SearchPick';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import {
  fetchOrdersStorage,
  fetchOrdersStoragePosDetail,
  fetchOrdersStoragePosSales,
  submitOrdersStorageSend,
} from '../services/ordersApi';

export default function StorageScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [sales, setSales] = useState([]);
  const [sends, setSends] = useState([]);
  const [saleId, setSaleId] = useState('');
  const [detail, setDetail] = useState(null);
  const [lineState, setLineState] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const [pos, list] = await Promise.all([
        fetchOrdersStoragePosSales(),
        fetchOrdersStorage(),
      ]);
      setSales(pos.sales || pos.pos_sales || []);
      setSends(Array.isArray(list.sends) ? list.sends : []);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      setSends([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

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
      setNotice(numbers ? `${numbers} sent to Floor 1.` : 'Sent to Floor 1.');
      await load();
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setBusy(false);
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
            Choose a Kitwe POS receipt, select sold lines, and send quantity to Floor 1 stock.
          </Text>
          {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
          {notice ? <Text style={[kiosk.hint, { color: '#047857' }]}>{notice}</Text> : null}

          <View style={kiosk.card}>
            <SearchPick
              label={tUi('receipt', locale)}
              value={saleId}
              options={sales.map((s) => ({
                value: String(s.id),
                label: `${s.receipt_number}${s.sale_date ? ` · ${String(s.sale_date).slice(0, 10)}` : ''}`,
              }))}
              onChange={setSaleId}
              placeholder="Search receipt number"
            />
            {detail?.sale ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={kiosk.metaLine}>{detail.sale.receipt_number}</Text>
                {detail.sale.customer_name ? (
                  <Text style={kiosk.hint}>{detail.sale.customer_name}{detail.sale.customer_phone ? ` · ${detail.sale.customer_phone}` : ''}</Text>
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
          </View>

          {sends.map((row) => (
            <View key={row.id} style={kiosk.card}>
              <Text style={kiosk.metaLine}>{row.storage_number || row.display_number || row.id}</Text>
              <Text style={kiosk.hint}>{textForDisplay(row.customer_name, row.status || '')}</Text>
              {row.assembly_name ? <Text style={kiosk.hint}>{row.assembly_name} × {row.quantity}</Text> : null}
            </View>
          ))}
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
