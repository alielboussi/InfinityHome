import { Text } from 'react-native';
import CatalogEditScreen from './CatalogEditScreen';
import { kiosk } from '../components/kioskStyles';
import { fetchOrdersCustomers, saveOrdersCustomer } from '../services/ordersApi';

export default function CustomersScreen(props) {
  return (
    <CatalogEditScreen
      {...props}
      titleKey="tileCustomers"
      subtitle="Tap a saved customer to edit name, phone, address, city, country and TPIN."
      extraFields={[
        { key: 'phone', labelKey: 'phone', keyboard: 'phone-pad' },
        { key: 'address', labelKey: 'address' },
        { key: 'city', labelKey: 'city' },
        { key: 'country', labelKey: 'country' },
        { key: 'tpin', labelKey: 'tpin' },
      ]}
      load={async () => {
        const res = await fetchOrdersCustomers();
        return res.customers || [];
      }}
      save={saveOrdersCustomer}
      renderRowDetail={(item) => (
        <>
          {item.phone ? <Text style={kiosk.hint}>{item.phone}</Text> : null}
          {item.address ? <Text style={kiosk.hint}>{item.address}</Text> : null}
          {[item.city, item.country].filter(Boolean).length ? (
            <Text style={kiosk.hint}>{[item.city, item.country].filter(Boolean).join(', ')}</Text>
          ) : null}
        </>
      )}
    />
  );
}
