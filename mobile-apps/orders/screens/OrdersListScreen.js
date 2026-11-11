import { Text } from 'react-native';
import SimpleListScreen from './SimpleListScreen';
import { kiosk } from '../components/kioskStyles';
import { fetchOrdersQuotes } from '../services/ordersApi';
import { textForDisplay } from '../lib/productionKioskI18n';

export default function OrdersListScreen(props) {
  return (
    <SimpleListScreen
      {...props}
      titleKey="tileOrders"
      searchKeys={['quote_number', 'customer_name', 'status']}
      load={async () => {
        const res = await fetchOrdersQuotes();
        return (res.quotes || []).map((q) => ({
          ...q,
          title: q.quote_number || q.id,
        }));
      }}
      renderMeta={(item) => (
        <>
          <Text style={kiosk.hint}>{textForDisplay(item.customer_name, '')}</Text>
          <Text style={kiosk.hint}>{[item.currency, item.total, item.status].filter(Boolean).join(' · ')}</Text>
        </>
      )}
      onPressRow={(item) => props.navigation.navigate('OrderDetail', { quoteId: item.id })}
    />
  );
}
