import { Text } from 'react-native';
import SimpleListScreen from './SimpleListScreen';
import { kiosk } from '../components/kioskStyles';
import { fetchOrdersStorage } from '../services/ordersApi';
import { textForDisplay } from '../lib/productionKioskI18n';

export default function StorageScreen(props) {
  return (
    <SimpleListScreen
      {...props}
      titleKey="tileStorage"
      searchKeys={['id', 'customer_name', 'status', 'sale_number']}
      load={async () => {
        const res = await fetchOrdersStorage();
        return (res.sends || []).map((s) => ({
          ...s,
          title: s.display_number || s.sale_number || s.id,
        }));
      }}
      renderMeta={(item) => (
        <>
          <Text style={kiosk.hint}>{textForDisplay(item.customer_name, item.status || '')}</Text>
        </>
      )}
    />
  );
}
