import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import ChipSelect from '../components/ChipSelect';
import DropdownSelect from '../components/DropdownSelect';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

function rowSortTime(row) {
  const t = new Date(row?.created_at || row?.updated_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

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
  showPriceCurrencyToggle = false,
  defaultPriceCurrency = 'K',
  twoColumnForm = false,
  hideCancelOnEdit = false,
}) {
  const listRef = useRef(null);
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [extras, setExtras] = useState({});
  const [q, setQ] = useState('');
  const [priceCurrency, setPriceCurrency] = useState(defaultPriceCurrency);

  const resetForm = () => {
    setEditingId('');
    setName('');
    setExtras({});
    setPriceCurrency(defaultPriceCurrency);
  };

  const fillForm = (row) => {
    setEditingId(String(row.id));
    setName(String(row.name || ''));
    const next = {};
    extraFields.forEach((field) => {
      const raw = row[field.key];
      next[field.key] = raw == null ? '' : String(raw);
    });
    setExtras(next);
    if (showPriceCurrencyToggle) {
      setPriceCurrency(String(row.currency || defaultPriceCurrency).trim() || defaultPriceCurrency);
    }
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    });
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
        ...(showPriceCurrencyToggle ? { currency: priceCurrency } : {}),
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

  const renderExtraField = (field) => {
    if (field.type === 'select') {
      const optionRows = typeof field.getOptions === 'function' ? field.getOptions(extras) : field.options || [];
      const common = {
        label: tUi(field.labelKey, locale),
        value: extras[field.key] || '',
        options: optionRows,
        onChange: (v) => setExtras((prev) => ({ ...prev, [field.key]: v })),
        placeholder: field.placeholder ?? '',
        allowEmpty: Boolean(field.allowEmpty),
      };
      if (field.dropdown) {
        return <DropdownSelect key={field.key} {...common} />;
      }
      return <ChipSelect key={field.key} {...common} />;
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
  };

  const renderExtraFields = () => {
    if (!twoColumnForm) {
      return extraFields.map((field) => renderExtraField(field));
    }
    const nodes = [];
    let pair = [];
    const flushPair = () => {
      if (!pair.length) return;
      if (pair.length === 1) {
        nodes.push(<View key={`solo-${pair[0].key}`}>{renderExtraField(pair[0])}</View>);
      } else {
        nodes.push(
          <View key={`row-${pair[0].key}-${pair[1].key}`} style={styles.gridRow}>
            <View style={styles.gridCol}>{renderExtraField(pair[0])}</View>
            <View style={styles.gridCol}>{renderExtraField(pair[1])}</View>
          </View>,
        );
      }
      pair = [];
    };
    extraFields.forEach((field) => {
      const selectFullWidth = field.type === 'select' && !field.twoColumn;
      if (field.fullWidth || field.multiline || selectFullWidth) {
        flushPair();
        nodes.push(<View key={`full-${field.key}`}>{renderExtraField(field)}</View>);
        return;
      }
      pair.push(field);
      if (pair.length === 2) flushPair();
    });
    flushPair();
    return nodes;
  };

  const primaryActionLabel = editingId ? tUi('update', locale) : tUi('save', locale);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) {
      return [...rows]
        .sort((a, b) => rowSortTime(b) - rowSortTime(a))
        .slice(0, 2);
    }
    return rows.filter((row) => [
      row.name,
      row.phone,
      row.description,
      row.address,
      row.city,
    ].some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [rows, needle]);

  const listHeader = (
    <View>
      <View style={kiosk.card}>
        {subtitle ? <Text style={kiosk.hint}>{subtitle}</Text> : null}
        {twoColumnForm ? (
          <View style={styles.gridRow}>
            <View style={styles.gridCol}>
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
            </View>
            {showPriceCurrencyToggle ? (
              <View style={styles.gridCol}>
                <DropdownSelect
                  label={tUi('currency', locale)}
                  value={priceCurrency}
                  options={[
                    { value: 'K', label: 'K' },
                    { value: '$', label: '$' },
                  ]}
                  onChange={setPriceCurrency}
                />
              </View>
            ) : (
              <View style={styles.gridCol} />
            )}
          </View>
        ) : (
          <>
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
            {showPriceCurrencyToggle ? (
              <DropdownSelect
                label={tUi('currency', locale)}
                value={priceCurrency}
                options={[
                  { value: 'K', label: 'K' },
                  { value: '$', label: '$' },
                ]}
                onChange={setPriceCurrency}
              />
            ) : null}
          </>
        )}
        {renderExtraFields()}
        <Pressable
          style={[kiosk.btnPrimaryBlock, { marginTop: 12 }]}
          disabled={busy || !name.trim()}
          onPress={onSave}
        >
          <Text style={kiosk.btnPrimaryBlockText}>
            {busy ? tUi('saving', locale) : primaryActionLabel}
          </Text>
        </Pressable>
        {editingId && !hideCancelOnEdit ? (
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
      {!needle ? (
        <Text style={[kiosk.hint, { marginBottom: 8 }]}>Showing 2 most recently added — search for more.</Text>
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} /> : null}
    </View>
  );

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
      <FlatList
        ref={listRef}
        style={styles.list}
        data={loading ? [] : filtered}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading ? <Text style={kiosk.hint}>{needle ? tUi('empty', locale) : 'No saved rows yet.'}</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable style={kiosk.card} onPress={() => fillForm(item)}>
            <Text style={kiosk.metaLine}>{textForDisplay(item.name, '—')}</Text>
            {renderRowDetail ? renderRowDetail(item) : (
              <>
                {item.phone ? <Text style={kiosk.hint}>{item.phone}</Text> : null}
                {item.price != null ? <Text style={kiosk.hint}>{item.price}</Text> : null}
              </>
            )}
            <Text style={[kiosk.hint, { color: theme.primary }]}>
              {editingId === String(item.id) ? tUi('update', locale) : tUi('tapToEdit', locale)}
            </Text>
          </Pressable>
        )}
      />
    </OrdersScreenShell>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  area: { minHeight: 88, textAlignVertical: 'top' },
  gridRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  gridCol: { flex: 1, minWidth: 0 },
});
