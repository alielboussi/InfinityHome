import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import ActionMenu from '../components/ActionMenu';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { promptShareQuotePdf } from '../lib/quoteSharePrompt';
import { theme } from '../shared/theme';
import { orderBadgeTextStyle } from '../shared/quoteProductionOrderUi';
import { fetchOrdersQuotes } from '../services/ordersApi';
import {
  firstProductionQuoteLineImageUrl,
  isOrdersAppShowroomQuote,
  showroomQuoteListSearchBlob,
} from '../shared/quoteShowroomOrder';

function lineImageFromQuote(row) {
  const meta = row?.routing?.metadata || {};
  const lines = Array.isArray(meta.lines) ? meta.lines : [];
  return firstProductionQuoteLineImageUrl({ lines });
}

export default function ShowroomOrdersScreen({
  navigation,
  allowed,
  accessHint,
  onRefreshAccess,
}) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchOrdersQuotes();
      const all = res.quotes || [];
      setRows(all.filter(isOrdersAppShowroomQuote));
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const needle = q.trim().toLowerCase();
  const filtered = !needle
    ? rows
    : rows.filter((row) => showroomQuoteListSearchBlob(row).includes(needle));

  return (
    <OrdersScreenShell
      title={tUi('tileShowroomOrders', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      <Pressable
        style={[kiosk.btn, styles.newBtn]}
        onPress={() => navigation.navigate('ShowroomOrderCreate')}
      >
        <Text style={kiosk.btnText}>{tUi('tileNewShowroomOrder', locale)}</Text>
      </Pressable>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={tUi('showroomSearchPlaceholder', locale)}
        placeholderTextColor={theme.textDim}
        style={[kiosk.input, { marginBottom: 10 }]}
      />
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <FlatList
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={<Text style={kiosk.hint}>{tUi('showroomOrdersEmpty', locale)}</Text>}
          renderItem={({ item }) => {
            const route = String(item.routing?.route || '').toLowerCase();
            const sent = Boolean(item.routing?.sent_to_production_at);
            const img = lineImageFromQuote(item);
            const meta = item.routing?.metadata || {};
            const lineName = Array.isArray(meta.lines) && meta.lines[0]?.name
              ? String(meta.lines[0].name)
              : '';
            return (
              <View style={kiosk.card}>
                {img ? (
                  <Image source={{ uri: img }} style={styles.thumb} resizeMode="cover" />
                ) : null}
                <View style={styles.head}>
                  <Text style={kiosk.metaLine}>{item.quote_number || item.id}</Text>
                  <Text style={[styles.badgeShowroom, orderBadgeTextStyle(locale)]}>
                    {tUi('badgeShowroomOrder', locale)}
                  </Text>
                </View>
                <Text style={kiosk.hint}>{lineName || '—'}</Text>
                <Text style={kiosk.hint}>
                  {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                </Text>
                {route ? (
                  <Text style={kiosk.hint}>
                    {route === 'carpentry' ? tUi('routeCarpentry', locale) : tUi('routeUpholstery', locale)}
                    {sent ? ` · ${tUi('showroomSentWorkshop', locale)}` : ''}
                  </Text>
                ) : null}
                <View style={{ marginTop: 10 }}>
                  <ActionMenu
                    triggerLabel={tUi('actions', locale)}
                    items={[
                      {
                        key: 'pdf',
                        label: tUi('shareQuote', locale),
                        onClick: () => promptShareQuotePdf(item.id, locale),
                      },
                    ]}
                  />
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
  newBtn: { marginBottom: 12, backgroundColor: '#1565c0' },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  badgeShowroom: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3730a3',
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#e2e8f0',
  },
});