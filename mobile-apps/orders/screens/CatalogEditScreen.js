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
import ChipSelect from '../components/ChipSelect';
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
  subtitle,
  renderRowDetail,
}) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [extras, setExtras] = useState({});
  const [q, setQ] = useState('');

  const resetForm = () => {
    setEditingId('');
    setName('');
    setExtras({});
  };

  const fillForm = (row) => {
    setEditingId(String(row.id));
    setName(String(row.name || ''));
    const next = {};
    extraFields.forEach((field) => {
      next[field.key] = row[field.key] == null ? '' : String(row[field.key]);
    });
    setExtras(next);
  };

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
      await save({
        id: editingId || undefined,
        name,
        ...extras,
      });
      resetForm();
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
    : rows.filter((row) => [
      row.name,
      row.phone,
      row.description,
      row.address,
      row.city,
    ].some((v) => String(v || '').toLowerCase().includes(needle)));

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
        {subtitle ? <Text style={kiosk.hint}>{subtitle}</Text> : null}
        <View style={kiosk.field}>
          <Text style={kiosk.label}>{tUi('name', locale)}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={tUi('name', locale)}
            placeholderTextColor={theme.textDim}
            style={kiosk.input}
          />
        </View>
        {extraFields.map((field) => {
          if (field.type === 'select') {
            return (
              <ChipSelect
                key={field.key}
                label={tUi(field.labelKey, locale)}
                value={extras[field.key] || ''}
                options={field.options || []}
                onChange={(v) => setExtras((prev) => ({ ...prev, [field.key]: v }))}
                placeholder={field.placeholder || '—'}
              />
            );
          }
          return (
            <View key={field.key} style={kiosk.field}>
              <Text style={kiosk.label}>{tUi(field.labelKey, locale)}</Text>
              <TextInput
                value={String(extras[field.key] || '')}
                onChangeText={(v) => setExtras((prev) => ({ ...prev, [field.key]: v }))}
                placeholder={tUi(field.labelKey, locale)}
                placeholderTextColor={theme.textDim}
                keyboardType={field.keyboard || 'default'}
                multiline={Boolean(field.multiline)}
                style={[kiosk.input, field.multiline && styles.area]}
              />
            </View>
          );
        })}
        <Pressable style={kiosk.btnPrimaryBlock} disabled={busy || !name.trim()} onPress={onSave}>
          <Text style={kiosk.btnPrimaryBlockText}>
            {busy ? tUi('saving', locale) : (editingId ? tUi('edit', locale) : tUi('save', locale))}
          </Text>
        </Pressable>
        {editingId ? (
          <Pressable style={[kiosk.btn, { marginTop: 8 }]} onPress={resetForm}>
            <Text style={kiosk.btnText}>{tUi('cancelEdit', locale)}</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={tUi('search', locale)}
        placeholderTextColor={theme.textDim}
        style={[kiosk.input, { marginBottom: 10 }]}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={<Text style={kiosk.hint}>{tUi('empty', locale)}</Text>}
          renderItem={({ item }) => (
            <Pressable style={kiosk.card} onPress={() => fillForm(item)}>
              <Text style={kiosk.metaLine}>{textForDisplay(item.name, '—')}</Text>
              {renderRowDetail ? renderRowDetail(item) : (
                <>
                  {item.phone ? <Text style={kiosk.hint}>{item.phone}</Text> : null}
                  {item.price != null ? <Text style={kiosk.hint}>{item.price}</Text> : null}
                </>
              )}
              <Text style={[kiosk.hint, { color: theme.primary }]}>{tUi('edit', locale)}</Text>
            </Pressable>
          )}
        />
      )}
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  area: { minHeight: 88, textAlignVertical: 'top' },
});
