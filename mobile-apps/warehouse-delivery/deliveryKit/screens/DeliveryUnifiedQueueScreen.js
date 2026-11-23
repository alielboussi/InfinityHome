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
import { repairInboxCustomerLabel } from '../shared/lib/productionInboxKinds';
import { theme as appTheme } from '../shared/theme';

const DEPT_THEME = {
  carpentry: { bg: '#ffedd5', fg: '#9a3412', bar: '#ea580c' },
  upholstery: { bg: '#ccfbf1', fg: '#0f766e', bar: '#0d9488' },
  painting: { bg: '#ede9fe', fg: '#6d28d9', bar: '#7c3aed' },
  repair: { bg: '#ffe4e6', fg: '#9f1239', bar: '#e11d48' },
  other: { bg: '#e0e7ff', fg: '#3730a3', bar: '#4f46e5' },
};

const FILTERS = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'carpentry', labelKey: 'filterCarpentry' },
  { key: 'upholstery', labelKey: 'filterUpholstery' },
  { key: 'painting', labelKey: 'filterPainting' },
  { key: 'repair', labelKey: 'filterRepair' },
];

function departmentKey(row) {
  if (row?._kind === 'repair') return 'repair';
  const d = String(row?.department || '').toLowerCase();
  if (d.includes('paint')) return 'painting';
  if (d.includes('uphol')) return 'upholstery';
  if (d.includes('carp')) return 'carpentry';
  return 'other';
}

function departmentName(row, locale) {
  const key = departmentKey(row);
  if (key === 'repair') return tUi('filterRepair', locale);
  if (key === 'painting') return tUi('filterPainting', locale);
  if (key === 'upholstery') return tUi('filterUpholstery', locale);
  if (key === 'carpentry') return tUi('filterCarpentry', locale);
  const raw = String(row?.department || '').trim();
  return raw || tUi('dashUnifiedOrders', locale);
}

function sourceLabel(row, locale) {
  if (row?._kind === 'repair') return tUi('sourceRepair', locale);
  if (row?.showroom_order === true) return tUi('sourceShowroom', locale);
  return tUi('sourceCustomer', locale);
}

function customerDisplay(row, locale) {
  if (row?._kind === 'repair') return repairInboxCustomerLabel(row, tUi, locale) || '—';
  if (row?.showroom_order === true) return tUi('sourceShowroom', locale);
  const name = String(row?.customer_name || '').trim();
  const phone = String(row?.customer_phone || '').trim();
  if (name && phone) return `${name} · ${phone}`;
  return name || '—';
}

function quoteDisplay(row) {
  return String(row?.quote_number || '').trim() || '—';
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
    customerName,
    customerPhone,
  });
}

function DetailLine({ label, value, textAlign, color }) {
  const text = String(value || '').trim();
  if (!text) return null;
  return (
    <Text style={[styles.detailLine, { textAlign, color }]}>
      {label}: {text}
    </Text>
  );
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
    if (deptFilter === 'repair') return rows.filter((r) => departmentKey(r) === 'repair');
    return rows.filter((r) => departmentKey(r) === deptFilter);
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
        {FILTERS.map((f) => {
          const active = deptFilter === f.key;
          const theme = f.key === 'all' ? DEPT_THEME.other : DEPT_THEME[f.key];
          return (
            <Pressable
              key={f.key}
              onPress={() => setDeptFilter(f.key)}
              style={[
                styles.filterChip,
                { borderColor: theme.bar },
                active ? { backgroundColor: theme.bar } : { backgroundColor: theme.bg },
              ]}
            >
              <Text style={[
                styles.filterChipText,
                { color: active ? '#fff' : theme.fg },
              ]}
              >
                {tUi(f.labelKey, locale)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={appTheme.primary} />
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
            const dept = departmentKey(item);
            const theme = DEPT_THEME[dept] || DEPT_THEME.other;
            return (
              <View style={[styles.orderCard, { borderLeftColor: theme.bar }]}>
                <View style={[styles.deptBadge, { backgroundColor: theme.bg }]}>
                  <Text style={[styles.deptBadgeText, { color: theme.fg }]}>
                    {departmentName(item, locale)}
                  </Text>
                </View>
                {isRepair ? (
                  <Text style={[styles.hero, { textAlign }]}>{textForDisplay(item.return_number || '—', '—')}</Text>
                ) : null}
                {!isRepair && Array.isArray(item.lines) && item.lines.length ? (
                  item.lines.map((line, idx) => (
                    <Text key={`${line.name}-${idx}`} style={[styles.productLine, { textAlign }]}>
                      {textForDisplay(line.name, '—')} × {Math.max(1, Number(line.quantity) || 1)}
                    </Text>
                  ))
                ) : (
                  <Text style={[styles.productLine, { textAlign }]}>
                    {textForDisplay(item.assembly_name, '—')} × {item.quantity}
                  </Text>
                )}
                <DetailLine label={tUi('cardSource', locale)} value={sourceLabel(item, locale)} textAlign={textAlign} color={theme.fg} />
                <DetailLine label={tUi('cardCustomer', locale)} value={customerDisplay(item, locale)} textAlign={textAlign} color={appTheme.textSecondary} />
                <DetailLine label={tUi('cardDepartment', locale)} value={departmentName(item, locale)} textAlign={textAlign} color={appTheme.textSecondary} />
                {!isRepair ? (
                  <DetailLine
                    label={tUi('cardQuoteNo', locale)}
                    value={quoteDisplay(item)}
                    textAlign={textAlign}
                    color={appTheme.textSecondary}
                  />
                ) : null}
                <Pressable
                  style={[styles.deliverBtn, { backgroundColor: theme.bar }]}
                  disabled={busyId === item._key}
                  onPress={() => onDeliver(item)}
                >
                  <Text style={styles.deliverBtnText}>
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  filterChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: { fontSize: 13, fontWeight: '800' },
  orderCard: {
    backgroundColor: appTheme.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: appTheme.border,
    borderLeftWidth: 6,
    gap: 4,
  },
  deptBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  deptBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  hero: { fontSize: 20, fontWeight: '800', color: appTheme.text, marginBottom: 4 },
  productLine: { fontSize: 16, fontWeight: '700', color: appTheme.text, marginBottom: 6 },
  detailLine: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  deliverBtn: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliverBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
