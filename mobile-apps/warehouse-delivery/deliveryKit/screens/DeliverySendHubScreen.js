import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';
import KitweSendHomeScreen from './KitweSendHomeScreen';
import DeliveryRepairQueueScreen from './DeliveryRepairQueueScreen';
import DeliveryOrderQueueScreen from './DeliveryOrderQueueScreen';

const TABS = ['floor1', 'repairs', 'orders'];

export default function DeliverySendHubScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale } = useProductionKioskLocale();
  const [tab, setTab] = useState('floor1');

  return (
    <View style={[kiosk.screen, kioskScreenEdgesSafe(insets, 8), styles.root]}>
      <ProductionKioskTopBar
        title={tUi('deliveryHubTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>

      <View style={styles.tabs}>
        {TABS.map((key) => (
          <Pressable
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {tUi(`deliveryHubTab_${key}`, locale)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        {tab === 'floor1' ? <KitweSendHomeScreen navigation={navigation} hubEmbedded /> : null}
        {tab === 'repairs' ? <DeliveryRepairQueueScreen navigation={navigation} /> : null}
        {tab === 'orders' ? <DeliveryOrderQueueScreen navigation={navigation} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  tabActive: { borderColor: '#0284c7', backgroundColor: '#e0f2fe' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  tabTextActive: { color: '#0369a1' },
  body: { flex: 1 },
});
