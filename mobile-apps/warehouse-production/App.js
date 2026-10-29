import { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FirebaseAuthGate from './shared/AuthGate';
import MobileScreenGate from './shared/MobileScreenGate';
import { useProductionAccessGrant } from './hooks/useProductionAccessGrant';
import { useProductionPushNotifications } from './hooks/useProductionPushNotifications';
import DashboardScreen from './screens/DashboardScreen';
import CreateScreen from './screens/CreateScreen';
import StockScreen from './screens/StockScreen';
import KitweSendHomeScreen from './screens/KitweSendHomeScreen';
import KitweSendProductScreen from './screens/KitweSendProductScreen';
import KitweSendSignatureScreen from './screens/KitweSendSignatureScreen';
import KitweSendDoneScreen from './screens/KitweSendDoneScreen';
import KitweSentDeliveriesScreen from './screens/KitweSentDeliveriesScreen';
import KitweSentDeliveryDetailScreen from './screens/KitweSentDeliveryDetailScreen';
import ReturnOrdersScreen from './screens/ReturnOrdersScreen';
import ReturnOrderSignatureScreen from './screens/ReturnOrderSignatureScreen';
import ReturnOrderDoneScreen from './screens/ReturnOrderDoneScreen';
import ReturnCustomerNoteScreen from './screens/ReturnCustomerNoteScreen';
import SoldOrdersScreen from './screens/SoldOrdersScreen';
import SoldOrderDetailScreen from './screens/SoldOrderDetailScreen';
import SoldDeliverSignatureScreen from './screens/SoldDeliverSignatureScreen';
import SoldDeliverDoneScreen from './screens/SoldDeliverDoneScreen';
import { stackScreenOptions, theme } from './shared/theme';

const Stack = createNativeStackNavigator();

function MainStack({ navigationRef }) {
  const {
    grant,
    loading,
    userEmail,
    userDisplayName,
    allowed,
    refresh,
    accessHint,
  } = useProductionAccessGrant();

  useProductionPushNotifications(navigationRef, { grant, allowed });

  if (loading) {
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
            onRefreshAccess={refresh}
            accessHint={accessHint}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Create" options={{ headerShown: false }} component={CreateScreen} />
      <Stack.Screen name="Stock" options={{ headerShown: false }} component={StockScreen} />
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
      <Stack.Screen name="KitweSendProduct" options={{ headerShown: false }} component={KitweSendProductScreen} />
      <Stack.Screen name="KitweSendDone" options={{ headerShown: false }} component={KitweSendDoneScreen} />
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
      <Stack.Screen name="ReturnOrders" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <ReturnOrdersScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="ReturnOrderSignature" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <ReturnOrderSignatureScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="ReturnOrderDone" options={{ headerShown: false }} component={ReturnOrderDoneScreen} />
      <Stack.Screen name="ReturnCustomerNote" options={{ headerShown: false }} component={ReturnCustomerNoteScreen} />
      <Stack.Screen name="SoldOrders" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <SoldOrdersScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="SoldOrderDetail" options={{ headerShown: false }} component={SoldOrderDetailScreen} />
      <Stack.Screen name="SoldDeliverSignature" options={{ headerShown: false }} component={SoldDeliverSignatureScreen} />
      <Stack.Screen name="SoldDeliverDone" options={{ headerShown: false }} component={SoldDeliverDoneScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const navigationRef = useRef(null);
  return (
    <SafeAreaProvider>
      <FirebaseAuthGate
        title="Production"
        showUserBar={false}
        signInMethods={__DEV__ ? 'both' : 'google'}
      >
        <NavigationContainer ref={navigationRef}>
          <MainStack navigationRef={navigationRef} />
        </NavigationContainer>
      </FirebaseAuthGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
});
