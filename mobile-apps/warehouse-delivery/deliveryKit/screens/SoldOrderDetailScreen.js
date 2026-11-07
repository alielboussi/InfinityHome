import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { theme } from '../shared/theme';

export default function SoldOrderDetailScreen({ route, navigation }) {
  const storageSendId = String(route.params?.id || '').trim();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prepBusy, setPrepBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storageSendId) return;
    setLoading(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('storage-send-detail', { storage_send_id: storageSendId });
      setRow(res?.storage_send || null);
    } catch (err) {
      setError(err?.message || tUi('soldLoadFailed', locale));
    } finally {
      setLoading(false);
    }
  }, [locale, storageSendId]);

  useEffect(() => {
    if (!storageSendId) {
      navigation.replace('SoldOrders');
      return;
    }
    load();
  }, [load, navigation, storageSendId]);

  const startDeliver = useCallback(async () => {
    if (!row || prepBusy) return;
    setPrepBusy(true);
    setError('');
    try {
      const prep = await warehouseMobileRequest('storage-deliver-prepare', {
        storage_send_id: storageSendId,
      });
      const send = prep?.storage_send || row;
      const printGroups = [{
        assembly_name: send.assembly_name,
        units: Number(send.quantity) || 0,
        elapsed_display: '—',
        lines: [],
      }];
      navigation.navigate('SoldDeliverSignature', {
        storageSendId,
        storageNumber: send.storage_number,
        sessionId: prep.session_id,
        deliveryNumber: prep.delivery_number || send.storage_number,
        printGroups,
        customerName: send.customer_name || '',
        customerPhone: send.customer_phone || '',
      });
    } catch (err) {
      setError(err?.message || tUi('soldDeliverFailed', locale));
    } finally {
      setPrepBusy(false);
    }
  }, [locale, navigation, prepBusy, row, storageSendId]);

  const canDeliver = row?.status === 'in_storage';

  return (
    <KioskSafeScroll contentContainerStyle={styles.wrap}>
      <ProductionKioskTopBar
        title={tUi('soldOrdersTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>

      {loading ? <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} /> : null}

      {row ? (
        <View style={kiosk.card}>
          <Text style={[styles.hero, { textAlign }]}>{row.assembly_name}</Text>
          <Text style={[kiosk.metaLine, { textAlign }]}>
            {row.storage_number} · ×{Number(row.quantity || 0).toLocaleString()}
          </Text>
          {row.customer_name ? (
            <Text style={[kiosk.metaLine, { textAlign }]}>{row.customer_name}</Text>
          ) : null}
          {row.customer_phone ? (
            <Text style={[kiosk.metaLine, { textAlign }]}>{row.customer_phone}</Text>
          ) : null}
          {row.receipt_number ? (
            <Text style={[kiosk.metaLine, { textAlign }]}>
              {tUi('soldReceipt', locale)}: {row.receipt_number}
            </Text>
          ) : null}
          <Text style={[kiosk.metaLine, { textAlign, marginBottom: 0 }]}>
            {tUi('soldStatus', locale)}: {String(row.status || '—').replace(/_/g, ' ')}
          </Text>
        </View>
      ) : null}

      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}

      {canDeliver ? (
        <Pressable
          style={[kiosk.btnPrimaryBlock, prepBusy && { opacity: 0.6 }]}
          onPress={startDeliver}
          disabled={prepBusy}
        >
          {prepBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={kiosk.btnPrimaryBlockText}>{tUi('soldDeliver', locale)}</Text>
          )}
        </Pressable>
      ) : null}

      {!loading && row && !canDeliver ? (
        <Text style={[kiosk.metaLine, { textAlign, marginTop: 12 }]}>
          {tUi('soldAlreadyDelivered', locale)}
        </Text>
      ) : null}
    </KioskSafeScroll>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 8 },
  hero: { fontSize: 20, fontWeight: '800', marginBottom: 8, color: theme.text },
});
