import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import { fetchOrdersQuote, sendOrdersQuoteProduction, setOrdersQuoteRoute } from '../services/ordersApi';

export default function OrderDetailScreen({ navigation, route, allowed, accessHint, onRefreshAccess }) {
  const quoteId = route.params?.quoteId;
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prodRoute, setProdRoute] = useState('carpentry');

  const load = useCallback(async () => {
    if (!allowed || !quoteId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchOrdersQuote(quoteId);
      setQuote(res.quote || null);
      setItems(res.items || []);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setLoading(false);
    }
  }, [allowed, quoteId, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await setOrdersQuoteRoute(quoteId, prodRoute);
      await sendOrdersQuoteProduction(quoteId);
      await load();
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OrdersScreenShell
      title={quote?.quote_number || tUi('tileOrders', locale)}
      locale={locale}
      onToggleLocale={toggleLocale}
      navigation={navigation}
      allowed={allowed}
      accessHint={accessHint}
      onRefreshAccess={onRefreshAccess}
    >
      {loading ? <ActivityIndicator color={theme.primary} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
          <View style={kiosk.card}>
            <Text style={kiosk.metaLine}>{textForDisplay(quote?.customer_name, '')}</Text>
            <Text style={kiosk.hint}>{quote?.customer_phone || ''}</Text>
            <Text style={kiosk.hint}>{[quote?.currency, quote?.total, quote?.status].filter(Boolean).join(' · ')}</Text>
          </View>
          {items.map((item) => (
            <View key={item.id} style={kiosk.card}>
              <Text style={kiosk.metaLine}>{textForDisplay(item.name_override || item.name, '—')} × {item.quantity}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable style={[kiosk.card, { flex: 1 }, prodRoute === 'carpentry' && { borderWidth: 2, borderColor: theme.primary }]} onPress={() => setProdRoute('carpentry')}>
              <Text style={kiosk.metaLine}>{tUi('routeCarpentry', locale)}</Text>
            </Pressable>
            <Pressable style={[kiosk.card, { flex: 1 }, prodRoute === 'upholstery' && { borderWidth: 2, borderColor: theme.primary }]} onPress={() => setProdRoute('upholstery')}>
              <Text style={kiosk.metaLine}>{tUi('routeUpholstery', locale)}</Text>
            </Pressable>
          </View>
          <Pressable style={[kiosk.btnPrimaryBlock, { marginTop: 12 }]} disabled={busy} onPress={send}>
            <Text style={kiosk.btnPrimaryBlockText}>{busy ? tUi('saving', locale) : tUi('sendProduction', locale)}</Text>
          </Pressable>
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}
