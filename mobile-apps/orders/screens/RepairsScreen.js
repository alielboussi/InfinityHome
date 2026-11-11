import { Text } from 'react-native';
import SimpleListScreen from './SimpleListScreen';
import { kiosk } from '../components/kioskStyles';
import { fetchOrdersRepairs } from '../services/ordersApi';
import { textForDisplay } from '../lib/productionKioskI18n';

export default function RepairsScreen(props) {
  return (
    <SimpleListScreen
      {...props}
      titleKey="tileRepairs"
      searchKeys={['return_number', 'assembly_name', 'customer_name', 'status']}
      load={async () => {
        const res = await fetchOrdersRepairs();
        return (res.repairs || []).map((r) => ({
          ...r,
          title: r.return_number || r.assembly_name,
        }));
      }}
      renderMeta={(item) => (
        <>
          <Text style={kiosk.hint}>{textForDisplay(item.assembly_name, '')}</Text>
          <Text style={kiosk.hint}>{[item.customer_name, item.status].filter(Boolean).join(' · ')}</Text>
        </>
      )}
    />
  );
}
