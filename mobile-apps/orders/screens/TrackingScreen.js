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
import TrackingJobCard from '../components/TrackingJobCard';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import {
  REPAIR_DEPARTMENTS,
  repairDepartmentLabel,
  resolveReturnRepairDepartment,
} from '../lib/warehouseReturnUi';
import { theme } from '../shared/theme';
import { fetchOrdersTracking } from '../services/ordersApi';

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
      const meta = row?.metadata || {};
      return [
        row.return_number,
        row.assembly_name,
        row.assembly_sku,
        row.reason,
        row.customer_name,
        row.customer_phone,
        row.status,
        row.outbound_delivery_number,
        meta.quote_number,
        meta.quote_id,
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
        One card per return job (same as workshop repair cards): customer, product, quote #, start/end times, and live or total elapsed timer.
      </Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search quote #, return #, product, customer, phone…"
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
              <View key={dept.id} style={styles.section}>
                <Text style={[kiosk.metaLine, styles.sectionTitle]}>{dept.label}</Text>
                {sectionRows.map((row) => (
                  <TrackingJobCard key={String(row.id)} row={row} />
                ))}
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
  section: { marginBottom: 8 },
  sectionTitle: { marginBottom: 8, fontWeight: '800' },
});
