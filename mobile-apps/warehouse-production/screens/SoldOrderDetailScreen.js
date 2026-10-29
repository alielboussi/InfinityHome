import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { theme } from '../shared/theme';

export default function SoldOrderDetailScreen({ route, navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const id = route.params?.id || '';
  const [row, setRow] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    warehouseMobileRequest('storage-send-detail', { storage_send_id: id })
      .then((res) => setRow(res?.storage_send || null))
      .catch((err) => setError(err?.message || tUi('soldLoadFailed', locale)));
  }, [id, locale]);

  const deliver = async () => {
    try {
      const prep = await warehouseMobileRequest('storage-deliver-prepare', { storage_send_id: id });
      navigation.navigate('SoldDeliverSignature', {
        storageSendId: id,
        storageNumber: row?.storage_number,
        sessionId: prep.session_id,
        deliveryNumber: prep.delivery_number,
        printGroups: [{
          assembly_name: row?.assembly_name,
          units: row?.quantity,
          elapsed_display: '—',
          lines: [],
        }],
        customerName: row?.customer_name || '',
        customerPhone: row?.customer_phone || '',
      });
    } catch (err) {
      setError(err?.message || tUi('soldDeliverFailed', locale));
    }
  };

  if (!row && !error) {
    return (
      <KioskSafeScroll contentContainerStyle={styles.wrap}>
        <Text style={{ textAlign: 'center', marginTop: 24 }}>{tUi('loading', locale)}</Text>
      </KioskSafeScroll>
    );
  }

  return (
    <KioskSafeScroll contentContainerStyle={styles.wrap}>
      <ProductionKioskTopBar title={tUi('soldDetailTitle', locale)} locale={locale} onToggleLocale={toggleLocale} />
      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
      {row ? (
        <View style={kiosk.card}>
          <Text style={[kiosk.title, { textAlign }]}>{row.assembly_name}</Text>
          <Text style={[styles.line, { textAlign }]}>{row.storage_number}</Text>
          <Text style={[styles.line, { textAlign }]}>{tUi('soldQty', locale)}: {row.quantity}</Text>
          {row.customer_name ? (
            <Text style={[styles.line, { textAlign }]}>
              {row.customer_name}{row.customer_phone ? ` · ${row.customer_phone}` : ''}
            </Text>
          ) : null}
          {row.receipt_number ? (
            <Text style={[styles.line, { textAlign }]}>{tUi('soldReceipt', locale)}: {row.receipt_number}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable style={styles.iconBtn} onPress={deliver}>
          <MaterialCommunityIcons name="truck-delivery-outline" size={40} color="#b45309" />
          <Text style={styles.iconLabel}>{tUi('soldDeliver', locale)}</Text>
        </Pressable>
      </View>
    </KioskSafeScroll>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, flexGrow: 1 },
  line: { fontSize: 15, marginTop: 8, color: theme.textMuted },
  actions: { flexDirection: 'row', marginTop: 20, gap: 24 },
  iconBtn: { alignItems: 'center' },
  iconLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
});
