import CatalogEditScreen from './CatalogEditScreen';
import { fetchOrdersProducts, saveOrdersProduct } from '../services/ordersApi';

export default function ProductsScreen(props) {
  return (
    <CatalogEditScreen
      {...props}
      titleKey="tileProducts"
      extraFields={[{ key: 'price', labelKey: 'price', keyboard: 'decimal-pad' }]}
      load={async () => {
        const res = await fetchOrdersProducts();
        return res.products || [];
      }}
      save={saveOrdersProduct}
    />
  );
}
