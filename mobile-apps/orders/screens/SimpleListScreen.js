import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

export default function SimpleListScreen({
  navigation,
  allowed,
  accessHint,
  onRefreshAccess,
  titleKey,
  load,
  searchKeys = ['name'],
  renderMeta,
  onPressRow,
}) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const refresh = useCallback(async () => {
    if (!allowed) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const next = await load();
      setRows(Array.isArray(next) ? next : []);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, load, locale]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const needle = q.trim().toLowerCase();
  const filtered = !needle
    ? rows
    : rows.filter((row) => searchKeys.some((key) => String(row?.[key] || '').toLowerCase().includes(needle)));

  return (
    <OrdersScreenShell
      title={tUi(titleKey, locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={tUi('search', locale)}
        placeholderTextColor={theme.textDim}
        style={styles.search}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => String(item.id || item.delivery_number || idx)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={kiosk.hint}>{tUi('empty', locale)}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={kiosk.card}
              onPress={onPressRow ? () => onPressRow(item) : undefined}
            >
              <Text style={kiosk.metaLine}>{textForDisplay(item.title || item.name || item.quote_number, '—')}</Text>
              {renderMeta ? renderMeta(item, locale) : null}
            </Pressable>
          )}
        />
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    marginBottom: 10,
    backgroundColor: theme.surface,
  },
  list: { paddingBottom: 32, gap: 10 },
});
