import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import { fetchOrdersShowroomFloor2 } from '../services/ordersApi';

export default function Floor2Screen({
  navigation,
  allowed,
  accessHint,
  onRefreshAccess,
}) {
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
      const list = await fetchOrdersShowroomFloor2();
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('loadFailed', locale));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const q = search.trim().toLowerCase();
  const filtered = !q
    ? rows
    : rows.filter((r) => {
      const name = String(r.name || '').toLowerCase();
      const sku = String(r.family_sku || '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    });

  return (
    <OrdersScreenShell
      title={tUi('tileFloor2', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      <Text style={[kiosk.hint, { marginBottom: 8 }]}>{tUi('floor2ReadOnlyHint', locale)}</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={tUi('search', locale)}
        placeholderTextColor={theme.textDim}
        style={[kiosk.input, { marginBottom: 10 }]}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.assembly_id)}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={<Text style={kiosk.hint}>{tUi('empty', locale)}</Text>}
          renderItem={({ item }) => {
            const img = String(item.floor2_image_url || item.image_url || '').trim();
            return (
              <View style={[kiosk.card, styles.row]}>
                {img ? (
                  <Image source={{ uri: img }} style={styles.photo} resizeMode="cover" />
                ) : (
                  <View style={[styles.photo, styles.photoPlaceholder]} />
                )}
                <View style={styles.meta}>
                  <Text style={styles.sku}>{item.family_sku || '—'}</Text>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={kiosk.hint}>
                    {tUi('showroomStockLabel', locale)}: {Math.max(0, Number(item.quantity) || 0)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  photo: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#e2e8f0' },
  photoPlaceholder: { backgroundColor: '#cbd5e1' },
  meta: { flex: 1 },
  sku: { fontSize: 12, color: theme.textDim, fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '700', color: theme.text, marginVertical: 2 },
});