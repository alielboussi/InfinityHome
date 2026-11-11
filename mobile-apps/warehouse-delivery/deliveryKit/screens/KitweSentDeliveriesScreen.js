import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import KioskSafeScroll from '../components/KioskSafeScroll';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { fetchDeliverySentList } from '../lib/deliverySentApi';
import { formatZambiaDate, formatZambiaTime } from '../lib/zambiaDateTime';
import { tUi } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';

function statusLabel(status, locale) {
  const s = String(status || '').toLowerCase();
  if (s === 'submitted' || s === 'pending') return tUi('sentDeliveryStatusSubmitted', locale);
  if (s === 'cancelled') return tUi('sentDeliveryStatusCancelled', locale);
  if (s === 'completed' || s === 'accepted') return tUi('sentDeliveryStatusCompleted', locale);
  if (s === 'partially_received') return tUi('sentDeliveryStatusPartial', locale);
  return tUi('sentDeliveryStatusOther', locale);
}

function sentKindLabel(documentKind, locale) {
  const dk = String(documentKind || '').toLowerCase();
  if (dk === 'repair_delivery') return tUi('sentDeliveryKindRepair', locale);
  if (dk === 'order_delivery') return tUi('sentDeliveryKindOrder', locale);
  if (dk === 'sold_delivery') return tUi('sentDeliveryKindSold', locale);
  return tUi('sentDeliveryKindFloor1', locale);
}

function normalizeSearchKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[#]/g, '')
    .replace(/\s+/g, '');
}

function matchesSentDeliverySearch(row, rawQuery, locale) {
  const query = String(rawQuery || '').trim();
  if (!query) return true;
  const q = query.toLowerCase();
  const qKey = normalizeSearchKey(query);
  const kind = sentKindLabel(row.document_kind, locale);
  const kindEn = sentKindLabel(row.document_kind, 'en');
  const kindAr = sentKindLabel(row.document_kind, 'ar');
  const hay = [
    row.display_number,
    row.delivery_number,
    row.customer_name,
    row.customer_phone,
    row.document_kind,
    kind,
    kindEn,
    kindAr,
  ]
    .map((part) => String(part || '').toLowerCase())
    .join(' ');
  const hayKey = normalizeSearchKey(hay);
  if (hay.includes(q)) return true;
  if (qKey && hayKey.includes(qKey)) return true;
  return false;
}

function mapLoadError(err, locale) {
  if (err?.code === 'api_not_deployed') {
    return tUi('sentDeliveriesServerPending', locale);
  }
  return err?.message || tUi('sentDeliveriesLoadFailed', locale);
}

export default function KitweSentDeliveriesScreen({ navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [localOnly, setLocalOnly] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    setLocalOnly(false);
    try {
      const list = await fetchDeliverySentList(80);
      setRows(list);
      setLocalOnly(list.some((row) => row.local_only));
    } catch (err) {
      setRows([]);
      setError(mapLoadError(err, locale));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [locale]);

  useEffect(() => {
    load(false);
  }, [load]);

  const visibleRows = useMemo(
    () => rows.filter((row) => matchesSentDeliverySearch(row, search, locale)),
    [rows, search, locale],
  );

  return (
    <KioskSafeScroll
      contentContainerStyle={styles.wrap}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />
      }
    >
      <ProductionKioskTopBar
        title={tUi('sentDeliveriesTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable onPress={() => navigation.goBack()} style={kiosk.backRow}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <TextInput
        style={[kiosk.input, styles.searchInput, { textAlign: locale === 'ar' ? 'right' : 'left' }]}
        placeholder={tUi('sentDeliveriesSearchPlaceholder', locale)}
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        returnKeyType="search"
        accessibilityLabel={tUi('sentDeliveriesSearchPlaceholder', locale)}
      />

      {loading && !rows.length ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
      ) : null}

      {localOnly && rows.length ? (
        <Text style={[styles.hint, { textAlign }]}>
          {tUi('sentDeliveriesLocalHint', locale)}
        </Text>
      ) : null}

      {!loading && !rows.length && !error ? (
        <Text style={[kiosk.metaLine, { textAlign, marginTop: 16 }]}>
          {tUi('sentDeliveriesEmpty', locale)}
        </Text>
      ) : null}

      {!loading && rows.length && !visibleRows.length && search.trim() ? (
        <Text style={[kiosk.metaLine, { textAlign, marginTop: 16 }]}>
          {tUi('sentDeliveriesSearchNoMatch', locale)}
        </Text>
      ) : null}

      {error ? (
        <Text
          style={[
            error === tUi('sentDeliveriesServerPending', locale) || rows.length
              ? styles.hint
              : kiosk.errText,
            { textAlign },
          ]}
        >
          {error}
        </Text>
      ) : null}

      {visibleRows.map((row) => {
        const when = row.submitted_at || '';
        const dateStr = when ? formatZambiaDate(when) : '—';
        const timeStr = when ? formatZambiaTime(when) : '';
        const hero = String(row.display_number || row.delivery_number || '—');
        const kind = sentKindLabel(row.document_kind, locale);
        const whd = String(row.delivery_number || '').trim();
        const showWhd = whd && hero !== whd;
        const customer = String(row.customer_name || '').trim();
        return (
          <Pressable
            key={row.session_id}
            style={kiosk.card}
            onPress={() => navigation.navigate('KitweSentDeliveryDetail', { sessionId: row.session_id })}
          >
            <Text style={[kiosk.heroNumber, { textAlign }]}>{hero}</Text>
            {kind ? (
              <Text style={[kiosk.metaLine, { textAlign, marginBottom: 2 }]}>{kind}</Text>
            ) : null}
            {customer ? (
              <Text style={[kiosk.metaLine, { textAlign, marginBottom: 2 }]}>{customer}</Text>
            ) : null}
            {showWhd ? (
              <Text style={[styles.hint, { textAlign, marginTop: 0, marginBottom: 4 }]}>
                {tUi('sentDeliveryRefWhd', locale)}: {whd}
              </Text>
            ) : null}
            <Text style={[kiosk.metaLine, { textAlign }]}>
              {statusLabel(row.status, locale)}
              {timeStr ? ` · ${dateStr} · ${timeStr} (Zambia)` : ''}
            </Text>
            {row.driver_name ? (
              <Text style={[kiosk.metaLine, { textAlign, marginBottom: 0 }]}>
                {tUi('sentDeliveryDriver', locale)}: {row.driver_name}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </KioskSafeScroll>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingBottom: 16 },
  searchInput: { marginBottom: 12 },
  hint: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    marginBottom: 4,
  },
});
