import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import TrackingJobCard, { TRACKING_DEPARTMENTS } from '../components/TrackingJobCard';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import { fetchOrdersTracking } from '../services/ordersApi';

export default function TrackingScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const warmedRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!allowed) return;
    const quiet = silent || warmedRef.current;
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try {
      const res = await fetchOrdersTracking({ department: department === 'all' ? undefined : department });
      setRows(Array.isArray(res.jobs) ? res.jobs : []);
      warmedRef.current = true;
    } catch (err) {
      if (!quiet) {
        setError(err?.message || tUi('loadFailed', locale));
        setRows([]);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [allowed, locale, department]);

  useFocusEffect(useCallback(() => { void load({ silent: warmedRef.current }); }, [load]));

  useEffect(() => {
    if (warmedRef.current) void load({ silent: false });
  }, [department]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [
      row.product_name,
      row.product_sku,
      row.department,
      row.department_label,
      row.flow_status,
      row.assembly_id,
    ].join(' ').toLowerCase().includes(q));
  }, [rows, search]);

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
        Factory jobs across upholstery, carpentry, and painting — product, qty, workshop stage, and live elapsed time.
      </Text>
      <View style={styles.filterRow}>
        {TRACKING_DEPARTMENTS.map((dept) => {
          const active = department === dept.id;
          return (
            <Pressable
              key={dept.id}
              onPress={() => setDepartment(dept.id)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{dept.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search product, SKU, status…"
        placeholderTextColor={theme.textDim}
        style={[kiosk.input, { marginBottom: 10 }]}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading && !rows.length ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {filtered.map((row) => (
            <TrackingJobCard key={`${row.department}:${row.id}`} row={row} />
          ))}
          {!filtered.length ? <Text style={kiosk.hint}>{tUi('empty', locale)}</Text> : null}
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  filterChipActive: { backgroundColor: theme.primary },
  filterChipText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
});
