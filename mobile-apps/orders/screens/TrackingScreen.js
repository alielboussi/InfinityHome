import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import {
  REPAIR_DEPARTMENTS,
  deliveryAdminStageLabel,
  formatElapsed,
  repairDepartmentLabel,
  resolveReturnRepairDepartment,
  returnOrderLifecycleBadge,
  returnOrderUnitLabel,
} from '../lib/warehouseReturnUi';
import { theme } from '../shared/theme';
import { fetchOrdersTracking } from '../services/ordersApi';

function refLabel(row) {
  const quote = String(row?.metadata?.quote_number || row?.metadata?.quote_id || '').trim();
  const repair = String(row?.return_number || '').trim();
  if (quote && repair) return `Quote ${quote} · Repair ${repair}`;
  if (repair) return `Repair ${repair}`;
  if (quote) return `Quote ${quote}`;
  return '';
}

export default function TrackingScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchOrdersTracking();
      setRows(Array.isArray(res.repairs) ? res.repairs : []);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const dept = resolveReturnRepairDepartment(row);
      return [
        row.return_number,
        row.assembly_name,
        row.reason,
        row.customer_name,
        row.status,
        row.outbound_delivery_number,
        row?.metadata?.quote_number,
        row?.metadata?.quote_id,
        repairDepartmentLabel(dept),
      ].join(' ').toLowerCase().includes(q);
    });
  }, [rows, search]);

  const byDepartment = useMemo(() => {
    const buckets = Object.fromEntries(REPAIR_DEPARTMENTS.map((d) => [d.id, []]));
    for (const row of filtered) {
      const dept = row.repair_department || resolveReturnRepairDepartment(row);
      if (buckets[dept]) buckets[dept].push(row);
      else buckets.upholstery.push(row);
    }
    return buckets;
  }, [filtered]);

  return (
    <OrdersScreenShell
      title={tUi('tileTracking', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      <Text style={kiosk.hint}>
        All Kitwe return jobs, grouped by workshop. Timers, customer, and quote/repair references.
      </Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search return #, product, reason, customer…"
        placeholderTextColor={theme.textDim}
        style={[kiosk.input, { marginBottom: 10 }]}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {REPAIR_DEPARTMENTS.map((dept) => {
            const sectionRows = byDepartment[dept.id] || [];
            if (!sectionRows.length) return null;
            return (
              <View key={dept.id}>
                <Text style={[kiosk.metaLine, { marginBottom: 8 }]}>{dept.label}</Text>
                {sectionRows.map((row) => {
                  const admin = row?.metadata?.delivery_admin;
                  const stage = admin?.stage ? deliveryAdminStageLabel(admin.stage) : '';
                  const deptId = row.repair_department || resolveReturnRepairDepartment(row);
                  const timerMs = Number(row.elapsed_ms || row?.metadata?.delivery_admin?.elapsed_ms || 0);
                  const liveTimer = timerMs > 0 ? formatElapsed(timerMs) : null;
                  const badge = returnOrderLifecycleBadge(row);
                  const ref = refLabel(row);
                  return (
                    <View key={row.id} style={kiosk.card}>
                      <View style={styles.badgeRow}>
                        <Text style={styles.deptBadge}>{repairDepartmentLabel(deptId)}</Text>
                        {stage ? <Text style={styles.stageBadge}>{stage}</Text> : null}
                      </View>
                      <Text style={kiosk.metaLine}>{returnOrderUnitLabel(row)}</Text>
                      {ref ? <Text style={kiosk.hint}>{ref}</Text> : null}
                      <Text style={kiosk.metaLine}>
                        {textForDisplay(row.assembly_name, '—')}
                        {row.assembly_sku ? ` · ${row.assembly_sku}` : ''}
                        {' · Qty '}
                        {row.quantity}
                      </Text>
                      {row.customer_name ? (
                        <Text style={kiosk.hint}>
                          Customer: {row.customer_name}
                          {row.customer_phone ? ` · ${row.customer_phone}` : ''}
                        </Text>
                      ) : null}
                      <Text style={kiosk.hint}>
                        Reason: {row.reason || '—'}
                        {row.leather_code ? ` · Leather: ${row.leather_code}` : ''}
                      </Text>
                      {liveTimer ? <Text style={styles.timer}>⏱ {liveTimer}</Text> : null}
                      {row.outbound_delivery_number ? (
                        <Text style={kiosk.hint}>Delivery note {row.outbound_delivery_number}</Text>
                      ) : null}
                      {badge ? <Text style={[kiosk.hint, { color: '#0369a1', fontWeight: '700' }]}>{badge}</Text> : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
          {!filtered.length ? <Text style={kiosk.hint}>{tUi('empty', locale)}</Text> : null}
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  deptBadge: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#1e3a8a',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stageBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  timer: { fontSize: 18, fontWeight: '800', color: theme.primary, marginTop: 4 },
});
