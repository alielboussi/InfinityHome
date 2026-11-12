import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import OrdersScreenShell from '../components/OrdersScreenShell';
import ActionMenu from '../components/ActionMenu';
import QuoteReadOnlyForm from '../components/QuoteReadOnlyForm';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import { promptShareQuotePdf } from '../lib/quoteSharePrompt';
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
  const [units, setUnits] = useState([]);
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
      setUnits(res.units || []);
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
    const dept = prodRoute === 'carpentry' ? tUi('routeCarpentry', locale) : tUi('routeUpholstery', locale);
    Alert.alert(
      tUi('sendOrder', locale),
      `Send this order to the ${dept} production app?`,
      [
        { text: tUi('close', locale), style: 'cancel' },
        {
          text: tUi('sendOrder', locale),
          onPress: async () => {
            setBusy(true);
            setError('');
            try {
              if (!alreadySent) {
                await setOrdersQuoteRoute(quoteId, prodRoute);
              }
              const res = await sendOrdersQuoteProduction(quoteId);
              const msg = res?.resent
                ? `Order notification resent to ${dept}.`
                : `Order sent to ${dept}.`;
              Alert.alert(tUi('sendOrder', locale), msg);
              await load();
            } catch (err) {
              Alert.alert('Send Order failed', err?.message || '');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
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
        <>
          {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
          <QuoteReadOnlyForm
            quote={quote}
            items={items}
            units={units}
            routing={routing}
            locale={locale}
          />
          <View style={[kiosk.card, { marginTop: 8 }]}>
            <ActionMenu
              triggerLabel={tUi('actions', locale)}
              items={[
                {
                  key: 'edit',
                  label: tUi('editQuote', locale),
                  onClick: () => navigation.navigate('NewOrder', { quoteId }),
                },
                {
                  key: 'pdf',
                  label: tUi('shareQuote', locale),
                  onClick: () => promptShareQuotePdf(quoteId, locale),
                },
                {
                  key: 'send',
                  label: busy
                    ? tUi('saving', locale)
                    : (alreadySent ? tUi('resendOrder', locale) : tUi('sendOrder', locale)),
                  disabled: busy,
                  onClick: send,
                },
              ]}
            />
          </View>
        </>
      )}
    </OrdersScreenShell>
  );
}
