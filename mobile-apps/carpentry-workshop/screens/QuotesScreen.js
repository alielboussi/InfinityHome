import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../productionKiosk/components/ProductionKioskTopBar';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { kioskScreenEdgesSafe } from '../productionKiosk/lib/kioskLayout';
import { useProductionKioskLocale } from '../productionKiosk/hooks/useProductionKioskLocale';
import { tUi } from '../productionKiosk/lib/productionKioskI18n';
import { fetchCarpentryProductionQuotes } from '../services/carpentryApi';
import { theme } from '../shared/theme';

export default function QuotesScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!allowed) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const list = await fetchCarpentryProductionQuotes();
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('carpentryQuotesLoadFailed', locale));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!allowed) {
    return (
      <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 32), styles.flex]}>
        <ProductionKioskTopBar
          title={tUi('carpentryQuotesTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>
        <Text style={kiosk.noticeErr}>{tUi('accessDenied', locale)}</Text>
        {accessHint ? <Text style={[kiosk.hint, { textAlign }]}>{accessHint}</Text> : null}
        {typeof onRefreshAccess === 'function' ? (
          <Pressable style={[kiosk.btn, { marginTop: 16 }]} onPress={() => onRefreshAccess({ background: false })}>
            <Text style={kiosk.btnText}>{tUi('retryAccess', locale)}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const openQuotes = rows.filter((r) => !r.completed_at);

  return (
    <View style={[kiosk.screen, styles.flex, kioskScreenEdgesSafe(insets, 16)]}>
      <ProductionKioskTopBar
        title={tUi('carpentryQuotesTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Text style={[kiosk.hint, styles.intro, { textAlign }]}>{tUi('carpentryQuotesIntro', locale)}</Text>
      {loading && openQuotes.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} />
      ) : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      <FlatList
        style={styles.list}
        data={openQuotes}
        keyExtractor={(item) => String(item.quote_id)}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={openQuotes.length === 0 ? styles.listEmpty : undefined}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [kiosk.card, styles.row, pressed && styles.rowPressed]}
            onPress={() => navigation.navigate('QuoteDetail', { quote: item })}
          >
            <Text style={styles.quoteNum}>{item.quote_number || item.quote_id}</Text>
            <Text style={styles.name}>{item.customer_name || 'Customer'}</Text>
            <Text style={styles.phone}>{item.customer_phone || '—'}</Text>
            <Text style={styles.meta}>
              {item.accepted_at
                ? tUi('carpentryQuoteInProduction', locale)
                : tUi('carpentryQuoteAwaiting', locale)}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[kiosk.hint, styles.empty, { textAlign: 'center' }]}>
              {tUi('carpentryQuotesEmpty', locale)}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { marginBottom: 12 },
  list: { flex: 1 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  row: { marginBottom: 10 },
  rowPressed: { opacity: 0.92 },
  quoteNum: { color: theme.primary, fontWeight: '700', marginBottom: 4, fontSize: 15 },
  name: { color: theme.text, fontSize: 17, fontWeight: '600' },
  phone: { color: theme.textMuted, fontSize: 13, marginTop: 4 },
  meta: { color: theme.textSecondary, fontSize: 12, marginTop: 8 },
  empty: { marginTop: 24 },
});
