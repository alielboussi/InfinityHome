import { Text } from 'react-native';
import SimpleListScreen from './SimpleListScreen';
import { kiosk } from '../components/kioskStyles';
import { fetchOrdersTracking } from '../services/ordersApi';
import { textForDisplay } from '../lib/productionKioskI18n';

export default function TrackingScreen(props) {
  return (
    <SimpleListScreen
      {...props}
      titleKey="tileTracking"
      searchKeys={['return_number', 'assembly_name', 'customer_name', 'status']}
      load={async () => {
        const res = await fetchOrdersTracking();
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
