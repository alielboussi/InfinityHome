import { Text } from 'react-native';
import CatalogEditScreen from './CatalogEditScreen';
import { kiosk } from '../components/kioskStyles';
import { fetchOrdersCustomers, saveOrdersCustomer } from '../services/ordersApi';

export default function CustomersScreen(props) {
  return (
    <CatalogEditScreen
      {...props}
      titleKey="tileCustomers"
      twoColumnForm
      hideCancelOnEdit
      showPriceCurrencyToggle
      defaultPriceCurrency="K"
      subtitle="Tap a customer below to load their details, then tap Update."
      extraFields={[
        { key: 'phone', labelKey: 'phone', keyboard: 'phone-pad' },
        { key: 'city', labelKey: 'city' },
        { key: 'country', labelKey: 'country' },
        { key: 'tpin', labelKey: 'tpin' },
        { key: 'address', labelKey: 'address', fullWidth: true, multiline: true },
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
