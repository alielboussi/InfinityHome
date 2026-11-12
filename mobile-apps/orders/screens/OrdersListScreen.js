import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { promptShareQuotePdf } from '../lib/quoteSharePrompt';
import { theme } from '../shared/theme';
import {
  fetchOrdersQuotes,
  sendOrdersQuoteProduction,
  setOrdersQuoteRoute,
} from '../services/ordersApi';

function statusLabel(q) {
  return (q.status === 'converted' || q.status === 'invoice') ? 'Invoice' : 'Quote';
}

export default function OrdersListScreen({ navigation, allowed, accessHint, onRefreshAccess }) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchOrdersQuotes();
      setRows(res.quotes || []);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const sendOrder = (row) => {
    const route = String(row.routing?.route || '').toLowerCase();
    if (route !== 'carpentry' && route !== 'upholstery') {
      Alert.alert(tUi('workshopRoute', locale), tUi('workshopRequired', locale));
      return;
    }
    const dept = route === 'carpentry' ? tUi('routeCarpentry', locale) : tUi('routeUpholstery', locale);
    Alert.alert(
      tUi('sendOrder', locale),
      `Send this order to the ${dept} production app?`,
      [
        { text: tUi('close', locale), style: 'cancel' },
        {
          text: tUi('sendOrder', locale),
          onPress: async () => {
            setBusyId(String(row.id));
            try {
              const alreadySent = Boolean(row.routing?.sent_to_production_at);
              if (!alreadySent) {
                await setOrdersQuoteRoute(row.id, route);
              }
              const res = await sendOrdersQuoteProduction(row.id);
              const msg = res?.resent
                ? `Order notification resent to ${dept}.`
                : `Order sent to ${dept}.`;
              Alert.alert(tUi('sendOrder', locale), msg);
              await load();
            } catch (err) {
              Alert.alert('Send Order failed', err?.message || '');
            } finally {
              setBusyId('');
            }
          },
        },
      ],
    );
  };

  const needle = q.trim().toLowerCase();
  const filtered = !needle
    ? rows
    : rows.filter((row) => [
      row.quote_number,
      row.customer_name,
      row.total,
      row.status,
    ].some((v) => String(v || '').toLowerCase().includes(needle)));

  return (
    <OrdersScreenShell
      title={tUi('tileOrders', locale)}
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
        placeholder="Search by number, customer, or amount"
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
          ListEmptyComponent={<Text style={kiosk.hint}>{tUi('empty', locale)}</Text>}
          renderItem={({ item }) => {
            const alreadySent = Boolean(item.routing?.sent_to_production_at);
            const sending = busyId === String(item.id);
            return (
              <View style={kiosk.card}>
                <Pressable
                  onPress={() => navigation.navigate('OrderDetail', { quoteId: item.id })}
                  accessibilityRole="button"
                >
                  <View style={styles.head}>
                    <Text style={kiosk.metaLine}>{item.quote_number || `Q-${String(item.id).slice(0, 8)}`}</Text>
                    <Text style={styles.badge}>{statusLabel(item)}</Text>
                  </View>
                  <Text style={kiosk.hint}>{textForDisplay(item.customer_name, '—')}</Text>
                  <Text style={kiosk.hint}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Text>
                  <Text style={kiosk.metaLine}>
                    {item.currency || 'K'} {Number(item.total || 0).toFixed(2)}
                  </Text>
                  {item.routing?.route ? (
                    <Text style={kiosk.hint}>
                      {item.routing.route === 'carpentry' ? tUi('routeCarpentry', locale) : tUi('routeUpholstery', locale)}
                      {alreadySent ? ' · sent' : ''}
                    </Text>
                  ) : null}
                  <Text style={[kiosk.hint, { color: theme.primary, marginTop: 6 }]}>
                    Tap to view quote details
                  </Text>
                </Pressable>
                <View style={{ marginTop: 10 }}>
                  <ActionMenu
                    triggerLabel={tUi('actions', locale)}
                    items={[
                      {
                        key: 'edit',
                        label: tUi('editQuote', locale),
                        onClick: () => navigation.navigate('NewOrder', { quoteId: item.id }),
                      },
                      {
                        key: 'pdf',
                        label: tUi('shareQuote', locale),
                        onClick: () => promptShareQuotePdf(item.id, locale),
                      },
                      {
                        key: 'send',
                        label: sending
                          ? tUi('saving', locale)
                          : (alreadySent ? tUi('resendOrder', locale) : tUi('sendOrder', locale)),
                        disabled: Boolean(busyId),
                        onClick: () => sendOrder(item),
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
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  badge: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.primary,
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
