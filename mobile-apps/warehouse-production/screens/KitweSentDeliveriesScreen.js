import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
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

function mapLoadError(err, locale) {
  if (err?.code === 'api_not_deployed') {
    return tUi('sentDeliveriesServerPending', locale);
  }
  return err?.message || tUi('sentDeliveriesLoadFailed', locale);
}

export default function KitweSentDeliveriesScreen({ navigation }) {
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
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
      const list = await fetchDeliverySentList(50);
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

  return (
    <KioskSafeScroll
      contentContainerStyle={styles.wrap}
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

      {rows.map((row) => {
        const when = row.submitted_at || '';
        const dateStr = when ? formatZambiaDate(when) : '—';
        const timeStr = when ? formatZambiaTime(when) : '';
        return (
          <Pressable
            key={row.session_id}
            style={kiosk.card}
            onPress={() => navigation.navigate('KitweSentDeliveryDetail', { sessionId: row.session_id })}
          >
            <Text style={[kiosk.heroNumber, { textAlign }]}>{row.delivery_number}</Text>
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
  hint: {
    color: theme.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    marginBottom: 4,
  },
});
