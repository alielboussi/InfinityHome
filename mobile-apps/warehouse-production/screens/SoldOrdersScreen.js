import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { theme } from '../shared/theme';

function groupByCustomer(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.customer_name || '—').trim() || '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function SoldOrdersScreen({ navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('storage-send-list', { for_production: true });
      setRows(res?.storage_sends || []);
    } catch (err) {
      setError(err?.message || tUi('soldLoadFailed', locale));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const groups = groupByCustomer(rows);

  return (
    <KioskSafeScroll contentContainerStyle={styles.wrap}>
      <ProductionKioskTopBar title={tUi('soldOrdersTitle', locale)} locale={locale} onToggleLocale={toggleLocale} />
      <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      {loading ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
      {error ? <Text style={[kiosk.noticeErr, { textAlign }]}>{error}</Text> : null}
      {!loading && !rows.length ? (
        <Text style={[kiosk.metaLine, { textAlign, marginTop: 16 }]}>{tUi('soldEmpty', locale)}</Text>
      ) : null}
      {groups.map(([customer, items]) => (
        <View key={customer} style={styles.group}>
          <Text style={[styles.groupTitle, { textAlign }]}>{customer}</Text>
          {items.map((row) => (
            <Pressable
              key={row.id}
              style={styles.card}
              onPress={() => navigation.navigate('SoldOrderDetail', { id: row.id })}
            >
              <Text style={[styles.cardTitle, { textAlign }]}>{row.assembly_name}</Text>
              <Text style={[styles.cardMeta, { textAlign }]}>
                {row.storage_number} · ×{row.quantity}
              </Text>
              {row.receipt_number ? (
                <Text style={[styles.cardMeta, { textAlign }]}>{tUi('soldReceipt', locale)}: {row.receipt_number}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ))}
      <Pressable style={[kiosk.btnOutlinePrimary, { marginTop: 16 }]} onPress={load}>
        <Text style={kiosk.btnOutlinePrimaryText}>{tUi('returnRefresh', locale)}</Text>
      </Pressable>
    </KioskSafeScroll>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 8 },
  group: { marginTop: 16 },
  groupTitle: { fontSize: 18, fontWeight: '800', color: theme.primaryDark, marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: theme.surface,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardMeta: { fontSize: 14, color: theme.textMuted, marginTop: 4 },
});
