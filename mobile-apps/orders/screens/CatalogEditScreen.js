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

export default function CatalogEditScreen({
  navigation,
  allowed,
  accessHint,
  onRefreshAccess,
  titleKey,
  load,
  save,
  extraFields = [],
  subtitleKey,
}) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [extras, setExtras] = useState({});
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
    } finally {
      setLoading(false);
    }
  }, [allowed, load, locale]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const onSave = async () => {
    setBusy(true);
    setError('');
    try {
      await save({ name, ...extras });
      setName('');
      setExtras({});
      await refresh();
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setBusy(false);
    }
  };

  const needle = q.trim().toLowerCase();
  const filtered = !needle
    ? rows
    : rows.filter((row) => String(row.name || '').toLowerCase().includes(needle)
      || String(row.phone || '').toLowerCase().includes(needle));

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
      <View style={kiosk.card}>
        {subtitleKey ? <Text style={kiosk.hint}>{tUi(subtitleKey, locale)}</Text> : null}
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={tUi('name', locale)}
          placeholderTextColor={theme.textDim}
          style={styles.input}
        />
        {extraFields.map((field) => (
          <TextInput
            key={field.key}
            value={String(extras[field.key] || '')}
            onChangeText={(v) => setExtras((prev) => ({ ...prev, [field.key]: v }))}
            placeholder={tUi(field.labelKey, locale)}
            placeholderTextColor={theme.textDim}
            keyboardType={field.keyboard || 'default'}
            style={styles.input}
          />
        ))}
        <Pressable style={kiosk.btnPrimaryBlock} disabled={busy || !name.trim()} onPress={onSave}>
          <Text style={kiosk.btnPrimaryBlockText}>{busy ? tUi('saving', locale) : tUi('save', locale)}</Text>
        </Pressable>
      </View>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={tUi('search', locale)}
        placeholderTextColor={theme.textDim}
        style={styles.input}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 32, gap: 10 }}
          ListEmptyComponent={<Text style={kiosk.hint}>{tUi('empty', locale)}</Text>}
          renderItem={({ item }) => (
            <View style={kiosk.card}>
              <Text style={kiosk.metaLine}>{textForDisplay(item.name, '—')}</Text>
              {item.phone ? <Text style={kiosk.hint}>{item.phone}</Text> : null}
              {item.price != null ? <Text style={kiosk.hint}>{item.price}</Text> : null}
            </View>
          )}
        />
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    marginBottom: 8,
    backgroundColor: theme.surface,
  },
});
