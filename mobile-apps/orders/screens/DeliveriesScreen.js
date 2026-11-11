import { Text } from 'react-native';
import SimpleListScreen from './SimpleListScreen';
import { kiosk } from '../components/kioskStyles';
import { fetchOrdersDeliveries } from '../services/ordersApi';
import { textForDisplay } from '../lib/productionKioskI18n';

export default function DeliveriesScreen(props) {
  return (
    <SimpleListScreen
      {...props}
      titleKey="tileDeliveries"
      searchKeys={['delivery_number', 'driver_name', 'customer_name', 'quote_number', 'status']}
      load={async () => {
        const res = await fetchOrdersDeliveries();
        return (res.sessions || []).map((s) => ({
          ...s,
          title: s.quote_number || s.delivery_number,
        }));
      }}
      renderMeta={(item) => (
        <>
          <Text style={kiosk.hint}>{textForDisplay(item.customer_name || item.driver_name, item.status)}</Text>
          {item.products?.length ? (
            <Text style={kiosk.hint} numberOfLines={3}>{item.products.join(', ')}</Text>
          ) : null}
        </>
      )}
    />
  );
}
