import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

async function openStagedDelivery(navigation, row) {
  const session = await warehouseMobileRequest('delivery-session-open', {});
  const qty = Math.max(1, Number(row.quantity) || 1);
  const now = new Date().toISOString();
  const groups = [{
    assembly_id: row.assembly_id,
    units: qty,
    finished_driver_checked: true,
    finished_driver_checked_at: now,
  }];
  const printGroups = [{
    assembly_name: row.assembly_name || row.assembly_id,
    units: qty,
    lines: row.quote_number ? [{ name: `Order ${row.quote_number}`, kind: 'meta' }] : [],
  }];
  navigation.navigate('KitweSendSignature', {
    sessionId: session.session_id,
    deliveryNumber: session.delivery_number,
    groups,
    printGroups,
    queueKind: 'order',
  });
}

export default function DeliveryOrderQueueScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('delivery-production-queue-list', {});
      setRows(res?.orders || []);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void load(); }, [load]);

  const onDeliver = async (row) => {
    const busyKey = row.production_job_id || row.quote_id || row.assembly_id;
    setBusyId(busyKey);
    try {
      await openStagedDelivery(navigation, row);
    } catch (err) {
      setError(err?.message || tUi('deliverySubmitFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  const rowKey = (item) => `${item.assembly_id}-${item.production_job_id || ''}-${item.quote_id || ''}`;

  return (
    <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 8), styles.root]}>
      <ProductionKioskTopBar
        title={tUi('dashDeliveryOrders', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={rowKey}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={[kiosk.hint, { textAlign }]}>{tUi('deliveryOrderQueueEmpty', locale)}</Text>}
          renderItem={({ item }) => (
            <View style={kiosk.card}>
              <Text style={[kiosk.metaLine, { textAlign }]}>
                {textForDisplay(item.assembly_name, '—')} × {item.quantity}
              </Text>
              {item.department ? (
                <Text style={[kiosk.hint, { textAlign }]}>{String(item.department).toUpperCase()}</Text>
              ) : null}
              {item.quote_number ? (
                <Text style={[kiosk.hint, { textAlign }]}>{textForDisplay(item.quote_number, '')}</Text>
              ) : null}
              <Pressable
                style={kiosk.btnPrimaryBlock}
                disabled={busyId === (item.production_job_id || item.quote_id || item.assembly_id)}
                onPress={() => onDeliver(item)}
              >
                <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryOrderDeliverBtn', locale)}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, paddingBottom: 32, gap: 12 },
});
