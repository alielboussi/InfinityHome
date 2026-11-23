import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { kioskFooterBottomPad, kioskScreenEdgesSafe, KIOSK_SCROLL_EXTRA_BOTTOM } from '../lib/kioskLayout';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { printGroupsFromQuoteLines } from '../lib/warehouseOrderPrintGroups.js';
import { DeliveryDestinationBadges } from '../shared/quoteProductionOrderUi';
import { repairInboxCustomerLabel } from '../shared/lib/productionInboxKinds';

function departmentBadgeKey(row) {
  const d = String(row?.department || '').toLowerCase();
  if (d.includes('paint')) return 'badgePainting';
  if (d.includes('uphol')) return 'badgeUpholstery';
  if (d.includes('carp')) return 'badgeCarpentry';
  return '';
}

async function openStagedOrderDelivery(navigation, row) {
  const session = await warehouseMobileRequest('delivery-session-open', {});
  const qty = Math.max(1, Number(row.quantity) || 1);
  const now = new Date().toISOString();
  const quoteLines = Array.isArray(row.lines) ? row.lines.filter((line) => String(line?.name || '').trim()) : [];
  const groups = [{
    assembly_id: row.assembly_id,
    units: qty,
    assembly_name: row.assembly_name || row.assembly_id,
    quote_id: row.quote_id || null,
    quote_number: row.quote_number || null,
    production_job_id: row.production_job_id || null,
    partial_quote_hold_id: row.partial_quote_hold_id || null,
    customer_name: row.customer_name || '',
    customer_phone: row.customer_phone || '',
    showroom_order: row.showroom_order === true,
    finished_driver_checked: true,
    finished_driver_checked_at: now,
  }];
  const printNoteNumber = String(row.quote_number || row.production_job_id || '').trim();
  const documentKind = row.showroom_order ? 'showroom_delivery' : 'order_delivery';
  const printGroups = printGroupsFromQuoteLines(quoteLines.length
    ? quoteLines
    : (String(row.assembly_name || '').trim() && String(row.assembly_name) !== String(row.assembly_id)
      ? [{ name: row.assembly_name, quantity: qty }]
      : []));
  navigation.navigate('KitweSendSignature', {
    sessionId: session.session_id,
    deliveryNumber: session.delivery_number,
    printNoteNumber: printNoteNumber || session.delivery_number,
    groups,
    printGroups,
    queueKind: 'order',
    documentKind,
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    partialDelivery: Boolean(row.partial_quote_hold_id || row.partial),
  });
}

function openStagedRepairDelivery(navigation, row) {
  const qty = Math.max(1, Number(row.quantity) || 1);
  const now = new Date().toISOString();
  const groups = [{
    assembly_id: row.assembly_id,
    units: qty,
    finished_driver_checked: true,
    finished_driver_checked_at: now,
  }];
  const returnNumber = String(row.return_number || '').trim();
  const printGroups = [{
    assembly_name: row.assembly_name || row.assembly_id,
    units: qty,
    lines: [],
  }];
  const customerName = String(row.customer_name || '').trim();
  const customerPhone = String(row.customer_phone || '').trim();
  navigation.navigate('KitweSendSignature', {
    bootstrapSession: true,
    sessionId: '',
    deliveryNumber: '',
    printNoteNumber: returnNumber,
    groups,
    printGroups,
    queueKind: 'repair',
    returnOrderId: row.return_order_id,
    documentKind: 'repair_delivery',
    repairCustomerName: customerName,
    repairCustomerPhone: customerPhone,
  });
}

export default function DeliveryUnifiedQueueScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('delivery-production-queue-list', {});
      const orders = (res?.orders || []).map((row) => ({ ...row, _kind: 'order', _key: `order-${row.production_job_id || row.quote_id || row.assembly_id}` }));
      const repairs = (res?.repairs || []).map((row) => ({ ...row, _kind: 'repair', _key: `repair-${row.return_order_id}` }));
      setRows([...orders, ...repairs]);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onDeliver = async (item) => {
    setBusyId(item._key);
  setError('');
    try {
      if (item._kind === 'repair') {
        openStagedRepairDelivery(navigation, item);
      } else {
        await openStagedOrderDelivery(navigation, item);
      }
    } catch (err) {
      setError(err?.message || tUi('deliverySubmitFailed', locale));
    } finally {
      setBusyId('');
    }
  };

  const listData = useMemo(() => {
    if (deptFilter === 'all') return rows;
    if (deptFilter === 'repair') return rows.filter((r) => r._kind === 'repair');
    return rows.filter((r) => String(r.department || '').toLowerCase().includes(deptFilter));
  }, [rows, deptFilter]);

  return (
    <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 8), styles.root]}>
      <ProductionKioskTopBar
        title={tUi('dashUnifiedOrders', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
      <View style={styles.filterRow}>
        {['all', 'carpentry', 'upholstery', 'painting', 'repair'].map((key) => {
          const label = key === 'all'
            ? tUi('filterAll', locale)
            : key === 'repair'
              ? tUi('badgeRepair', locale)
              : tUi(key === 'carpentry' ? 'badgeCarpentry' : key === 'upholstery' ? 'badgeUpholstery' : 'badgePainting', locale);
          const active = deptFilter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setDeptFilter(key)}
              style={[styles.filterChip, active ? styles.filterChipOn : null]}
            >
              <Text style={[styles.filterChipText, active ? styles.filterChipTextOn : null]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item._key}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: kioskFooterBottomPad(insets) + KIOSK_SCROLL_EXTRA_BOTTOM },
          ]}
          ListEmptyComponent={<Text style={[kiosk.hint, { textAlign }]}>{tUi('deliveryUnifiedQueueEmpty', locale)}</Text>}
          renderItem={({ item }) => {
            const isRepair = item._kind === 'repair';
            const customerLine = isRepair
              ? repairInboxCustomerLabel(item, tUi, locale)
              : textForDisplay(item.customer_name || '', '');
            return (
              <View style={kiosk.card}>
                <DeliveryDestinationBadges row={item} textAlign={textAlign} tUi={tUi} locale={locale} />
                <View style={styles.deptBadgeWrap}>
                  {isRepair ? (
                    <Text style={[styles.kindChip, styles.kindChipCenter]}>{tUi('badgeRepair', locale)}</Text>
                  ) : null}
                  {departmentBadgeKey(item) ? (
                    <Text style={[styles.kindChip, styles.kindChipCenter, styles.deptChip]}>
                      {tUi(departmentBadgeKey(item), locale)}
                    </Text>
                  ) : null}
                  {!isRepair && !departmentBadgeKey(item) ? (
                    <Text style={[styles.kindChip, styles.kindChipCenter]}>
                      {tUi('badgeCustomerOrder', locale)}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.awaitingChip, { textAlign }]}>{tUi('deliveryStatus_completedAwaiting', locale)}</Text>
                {isRepair ? (
                  <Text style={kiosk.heroNumber}>{textForDisplay(item.return_number || '—', '—')}</Text>
                ) : null}
                {!isRepair && Array.isArray(item.lines) && item.lines.length ? (
                  item.lines.map((line, idx) => (
                    <Text key={`${line.name}-${idx}`} style={[kiosk.metaLine, { textAlign }]}>
                      {textForDisplay(line.name, '—')} × {Math.max(1, Number(line.quantity) || 1)}
                    </Text>
                  ))
                ) : (
                  <Text style={[kiosk.metaLine, { textAlign }]}>
                    {textForDisplay(item.assembly_name, '—')} × {item.quantity}
                  </Text>
                )}
                {customerLine ? (
                  <Text style={[kiosk.hint, { textAlign }]}>{customerLine}</Text>
                ) : null}
                {!isRepair && item.quote_number ? (
                  <Text style={[kiosk.hint, { textAlign }]}>{textForDisplay(item.quote_number, '')}</Text>
                ) : null}
                <Pressable
                  style={kiosk.btnPrimaryBlock}
                  disabled={busyId === item._key}
                  onPress={() => onDeliver(item)}
                >
                  <Text style={kiosk.btnPrimaryBlockText}>
                    {isRepair ? tUi('deliveryRepairDeliverBtn', locale) : tUi('deliveryOrderDeliverBtn', locale)}
                  </Text>
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, marginBottom: 4 },
  filterChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  filterChipOn: { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  filterChipTextOn: { color: '#fff' },
  deptBadgeWrap: { alignItems: 'center', marginBottom: 6, gap: 4 },
  kindChip: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  kindChipCenter: { textAlign: 'center', alignSelf: 'center' },
  deptChip: { color: '#1e3a5f' },
  awaitingChip: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 6,
  },
});