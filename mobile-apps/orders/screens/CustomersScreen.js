import CatalogEditScreen from './CatalogEditScreen';
import { fetchOrdersCustomers, saveOrdersCustomer } from '../services/ordersApi';

export default function CustomersScreen(props) {
  return (
    <CatalogEditScreen
      {...props}
      titleKey="tileCustomers"
      extraFields={[{ key: 'phone', labelKey: 'phone', keyboard: 'phone-pad' }]}
      load={async () => {
        const res = await fetchOrdersCustomers();
        return res.customers || [];
      }}
      save={saveOrdersCustomer}
    />
  );
}
