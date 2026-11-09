import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SharedProductionPushSettingsScreen from '../shared/screens/ProductionPushSettingsScreen';
import { kiosk } from '../productionKiosk/components/kioskStyles';
import { kioskFooterBottomPad } from '../productionKiosk/lib/kioskLayout';
import { registerProductionPushTokenWithServer } from '../productionKiosk/lib/productionPushNotifications';
import { theme } from '../shared/theme';

export default function ProductionPushSettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <SharedProductionPushSettingsScreen
      navigation={navigation}
      registerProductionPushTokenWithServer={registerProductionPushTokenWithServer}
      themePrimary={theme.primary}
      screenStyle={kiosk.screen}
      paddingTop={insets.top + 8}
      paddingBottom={kioskFooterBottomPad(insets)}
    />
  );
}
