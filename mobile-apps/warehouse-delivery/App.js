import './shared/lightweightRuntime.js';
import './shared/suppressBridgelessCodegenWarnings.js';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProductionAppAuthGate from './deliveryKit/components/ProductionAppAuthGate';
import MobileScreenGate from './shared/MobileScreenGate';
import { useDeliveryAccessGrant } from './hooks/useDeliveryAccessGrant';
import DashboardScreen from './screens/DashboardScreen';
import KitweSendHomeScreen from './deliveryKit/screens/KitweSendHomeScreen';
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

function MainStack() {
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

  if (!bootstrapped && loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
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
      <Stack.Screen name="KitweSendSignature" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <KitweSendSignatureScreen {...props} />
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
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ProductionAppAuthGate
        titleKey="dashDeliveryAppTitle"
        signInMethods={__DEV__ ? 'both' : 'google'}
      >
        <NavigationContainer>
          <MainStack />
        </NavigationContainer>
      </ProductionAppAuthGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
});
