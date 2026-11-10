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
import { isCompletedAwaitingDelivery } from '../shared/lib/deliveryAdminDisplayStatus';

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
    lines: row.return_number ? [{ name: `RO ${row.return_number}`, kind: 'meta' }] : [],
  }];
  navigation.navigate('KitweSendSignature', {
    sessionId: session.session_id,
    deliveryNumber: session.delivery_number,
    groups,
    printGroups,
    queueKind: 'repair',
    returnOrderId: row.return_order_id,
  });
}

export default function DeliveryRepairQueueScreen({ navigation }) {
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
      setRows(res?.repairs || []);
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
    setBusyId(row.return_order_id);
    try {
      await openStagedDelivery(navigation, row);
    } catch (err) {
      setError(err?.message || tUi('deliverySubmitFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  return (
    <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 8), styles.root]}>
      <ProductionKioskTopBar
        title={tUi('dashDeliveryRepairs', locale)}
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
          keyExtractor={(item) => item.return_order_id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={[kiosk.hint, { textAlign }]}>{tUi('deliveryRepairQueueEmpty', locale)}</Text>}
          renderItem={({ item }) => {
            const showAwaiting = isCompletedAwaitingDelivery(item) || String(item.delivery_admin_stage || '').toLowerCase() === 'awaiting_driver';
            return (
            <View style={kiosk.card}>
              {showAwaiting ? (
                <Text style={[styles.awaitingChip, { textAlign }]}>{tUi('deliveryStatus_completedAwaiting', locale)}</Text>
              ) : null}
              <Text style={kiosk.heroNumber}>{textForDisplay(item.return_number || '—', '—')}</Text>
              <Text style={[kiosk.metaLine, { textAlign }]}>
                {textForDisplay(item.assembly_name, '—')} × {item.quantity}
              </Text>
              {item.has_customer ? (
                <Text style={[kiosk.hint, { textAlign }]}>{tUi('deliveryRepairCustomer', locale)}</Text>
              ) : null}
              <Pressable
                style={kiosk.btnPrimaryBlock}
                disabled={busyId === item.return_order_id}
                onPress={() => onDeliver(item)}
              >
                <Text style={kiosk.btnPrimaryBlockText}>{tUi('deliveryRepairDeliverBtn', locale)}</Text>
              </Pressable>
            </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, paddingBottom: 32, gap: 12 },
  awaitingChip: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 6,
  },
});
