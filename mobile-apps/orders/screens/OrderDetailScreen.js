import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import ActionMenu from '../components/ActionMenu';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { theme } from '../shared/theme';
import {
  fetchOrdersQuote,
  sendOrdersQuoteProduction,
  setOrdersQuoteRoute,
} from '../services/ordersApi';

export default function OrderDetailScreen({ navigation, route, allowed, accessHint, onRefreshAccess }) {
  const quoteId = route.params?.quoteId;
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [routing, setRouting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!allowed || !quoteId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchOrdersQuote(quoteId);
      setQuote(res.quote || null);
      setItems(res.items || []);
      setRouting(res.routing || null);
    } catch (err) {
      setError(err?.message || tUi('loadFailed', locale));
    } finally {
      setLoading(false);
    }
  }, [allowed, quoteId, locale]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const send = async () => {
    const prodRoute = String(routing?.route || '').toLowerCase();
    if (prodRoute !== 'carpentry' && prodRoute !== 'upholstery') {
      Alert.alert(tUi('workshopRoute', locale), tUi('workshopRequired', locale));
      return;
    }
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

  const alreadySent = Boolean(routing?.sent_to_production_at);

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
            {routing?.route ? (
              <Text style={kiosk.hint}>
                {routing.route === 'carpentry' ? tUi('routeCarpentry', locale) : tUi('routeUpholstery', locale)}
                {alreadySent ? ' · sent to production' : ''}
              </Text>
            ) : null}
          </View>
          {items.map((item) => (
            <View key={item.id} style={kiosk.card}>
              <Text style={kiosk.metaLine}>{textForDisplay(item.name || item.name_override, '—')} × {item.quantity}</Text>
              {item.description ? <Text style={kiosk.hint}>{item.description}</Text> : null}
              {item.wood ? <Text style={kiosk.hint}>Wood: {item.wood}</Text> : null}
              {item.color_code ? <Text style={kiosk.hint}>Color: {item.color_code}</Text> : null}
            </View>
          ))}
          <ActionMenu
            triggerLabel={tUi('actions', locale)}
            items={[
              {
                key: 'edit',
                label: tUi('editQuote', locale),
                onClick: () => navigation.navigate('NewOrder', { quoteId }),
              },
              {
                key: 'share',
                label: tUi('shareQuote', locale),
                onClick: async () => {
                  const body = [
                    quote?.quote_number,
                    quote?.customer_name,
                    '',
                    ...items.map((it) => `${it.name || it.name_override} × ${it.quantity}`),
                  ].join('\n');
                  await Share.share({ message: body });
                },
              },
              {
                key: 'send',
                label: busy ? tUi('saving', locale) : (alreadySent ? tUi('resendOrder', locale) : tUi('sendOrder', locale)),
                disabled: busy,
                onClick: send,
              },
            ]}
          />
          <Pressable style={[kiosk.btnPrimaryBlock, { marginTop: 12 }]} disabled={busy} onPress={send}>
            <Text style={kiosk.btnPrimaryBlockText}>{busy ? tUi('saving', locale) : tUi('sendProduction', locale)}</Text>
          </Pressable>
        </ScrollView>
      )}
    </OrdersScreenShell>
  );
}
