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
