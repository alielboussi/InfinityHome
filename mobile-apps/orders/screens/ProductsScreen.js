import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from 'react-native';
import CatalogEditScreen from './CatalogEditScreen';
import { kiosk } from '../components/kioskStyles';
import { fetchOrdersProducts, fetchOrdersUnits, saveOrdersProduct } from '../services/ordersApi';
import { unitLabel } from '../lib/quoteLineFields';

export default function ProductsScreen(props) {
  const [units, setUnits] = useState([]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    fetchOrdersUnits()
      .then((res) => { if (!cancelled) setUnits(res.units || []); })
      .catch(() => { if (!cancelled) setUnits([]); });
    return () => { cancelled = true; };
  }, []));

  return (
    <CatalogEditScreen
      {...props}
      titleKey="tileProducts"
      showPriceCurrencyToggle
      subtitle="Tap a saved product to edit. Choose a unit of measure and enter a description when creating or updating."
      extraFields={[
        { key: 'price', labelKey: 'price', keyboard: 'decimal-pad' },
        {
          key: 'unit_id',
          labelKey: 'unit',
          type: 'select',
          options: units.map((u) => ({ value: String(u.id), label: unitLabel(u) })),
        },
        { key: 'description', labelKey: 'description', multiline: true },
      ]}
      load={async () => {
        const res = await fetchOrdersProducts();
        return res.products || [];
      }}
      save={saveOrdersProduct}
      renderRowDetail={(item) => {
        const unit = units.find((u) => String(u.id) === String(item.unit_id));
        return (
          <>
            <Text style={kiosk.hint}>
              {item.price != null ? `${item.currency || 'K'} ${Number(item.price || 0).toFixed(2)}` : ''}
              {unit ? ` · ${unitLabel(unit)}` : ''}
            </Text>
            {item.description ? <Text style={kiosk.hint} numberOfLines={3}>{item.description}</Text> : null}
          </>
        );
      }}
    />
  );
}
