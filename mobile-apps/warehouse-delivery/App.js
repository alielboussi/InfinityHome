import './shared/lightweightRuntime.js';
import './shared/suppressBridgelessCodegenWarnings.js';
import { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProductionAppAuthGate from './deliveryKit/components/ProductionAppAuthGate';
import { ProductionKioskLocaleProvider } from './deliveryKit/hooks/useProductionKioskLocale';
import MobileScreenGate from './shared/MobileScreenGate';
import { useDeliveryAccessGrant } from './hooks/useDeliveryAccessGrant';
import { useDeliveryPushNotifications } from './hooks/useDeliveryPushNotifications';
import DashboardScreen from './screens/DashboardScreen';
import KitweSendHomeScreen from './deliveryKit/screens/KitweSendHomeScreen';
import FarmSendHomeScreen from './deliveryKit/screens/FarmSendHomeScreen';
import FarmSendSignatureScreen from './deliveryKit/screens/FarmSendSignatureScreen';
import WarehouseFromFarmHomeScreen from './deliveryKit/screens/WarehouseFromFarmHomeScreen';
import WarehouseFromFarmSignatureScreen from './deliveryKit/screens/WarehouseFromFarmSignatureScreen';
import WarehouseFromFarmDoneScreen from './deliveryKit/screens/WarehouseFromFarmDoneScreen';
import DeliveryRepairQueueScreen from './deliveryKit/screens/DeliveryRepairQueueScreen';
import DeliveryOrderQueueScreen from './deliveryKit/screens/DeliveryOrderQueueScreen';
import KitweSendSignatureScreen from './deliveryKit/screens/KitweSendSignatureScreen';
import KitweSendDoneScreen from './deliveryKit/screens/KitweSendDoneScreen';
import KitweSendProductScreen from './deliveryKit/screens/KitweSendProductScreen';
import KitweSentDeliveriesScreen from './deliveryKit/screens/KitweSentDeliveriesScreen';
import KitweSentDeliveryDetailScreen from './deliveryKit/screens/KitweSentDeliveryDetailScreen';
import SoldOrdersScreen from './deliveryKit/screens/SoldOrdersScreen';
import SoldOrderDetailScreen from './deliveryKit/screens/SoldOrderDetailScreen';
import SoldDeliverSignatureScreen from './deliveryKit/screens/SoldDeliverSignatureScreen';
import SoldDeliverDoneScreen from './deliveryKit/screens/SoldDeliverDoneScreen';
import { stackScreenOptions, theme } from './shared/theme';

const Stack = createNativeStackNavigator();

function MainStack({ navigationRef }) {
  const {
    grant,
    loading,
    bootstrapped,
    userEmail,
    userDisplayName,
    allowed,
    refresh,
    accessHint,
  } = useDeliveryAccessGrant();

  useDeliveryPushNotifications(navigationRef, { allowed });

  const accessBooting = !bootstrapped && loading;

  return (
    <>
    <Stack.Navigator initialRouteName="Dashboard" screenOptions={stackScreenOptions}>
      <Stack.Screen name="Dashboard" options={{ headerShown: false }}>
        {(props) => (
          <DashboardScreen
            {...props}
            grant={grant}
            userEmail={userEmail}
            userDisplayName={userDisplayName}
            allowed={allowed}
            onRefreshAccess={() => refresh({ background: false })}
            accessHint={accessHint}
            accessBooting={accessBooting}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="KitweSendHome" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <KitweSendHomeScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="FarmSendHome" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="farm_send_delivery" grant={grant} navigation={props.navigation}>
            <FarmSendHomeScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="FarmSendSignature" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="farm_send_delivery" grant={grant} navigation={props.navigation}>
            <FarmSendSignatureScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="FarmSendDone" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="farm_send_delivery" grant={grant} navigation={props.navigation}>
            <KitweSendDoneScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="WarehouseFromFarmHome" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="warehouse_send_farm" grant={grant} navigation={props.navigation}>
            <WarehouseFromFarmHomeScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="WarehouseFromFarmSignature" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="warehouse_send_farm" grant={grant} navigation={props.navigation}>
            <WarehouseFromFarmSignatureScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="WarehouseFromFarmDone" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="warehouse_send_farm" grant={grant} navigation={props.navigation}>
            <WarehouseFromFarmDoneScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="KitweSendSignature" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <KitweSendSignatureScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="DeliveryRepairQueue" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <DeliveryRepairQueueScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="DeliveryOrderQueue" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <DeliveryOrderQueueScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="KitweSendProduct" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <KitweSendProductScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="KitweSendDone" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <KitweSendDoneScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="KitweSentDeliveries" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <KitweSentDeliveriesScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="KitweSentDeliveryDetail" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <KitweSentDeliveryDetailScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="SoldOrders" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="delivery_sold_orders" grant={grant} navigation={props.navigation}>
            <SoldOrdersScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="SoldOrderDetail" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="delivery_sold_orders" grant={grant} navigation={props.navigation}>
            <SoldOrderDetailScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="SoldDeliverSignature" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="delivery_sold_orders" grant={grant} navigation={props.navigation}>
            <SoldDeliverSignatureScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="SoldDeliverDone" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="delivery_sold_orders" grant={grant} navigation={props.navigation}>
            <SoldDeliverDoneScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
    </Stack.Navigator>
    {accessBooting ? (
      <View style={styles.loadingOverlay} pointerEvents="none">
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    ) : null}
    </>
  );
}

export default function App() {
  const navigationRef = useRef(null);
  return (
    <SafeAreaProvider>
      <ProductionKioskLocaleProvider>
        <ProductionAppAuthGate
          titleKey="dashDeliveryAppTitle"
          signInMethods={__DEV__ ? 'both' : 'google'}
        >
          <NavigationContainer ref={navigationRef}>
            <MainStack navigationRef={navigationRef} />
          </NavigationContainer>
        </ProductionAppAuthGate>
      </ProductionKioskLocaleProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
});
