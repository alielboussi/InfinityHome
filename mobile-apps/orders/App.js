import './shared/lightweightRuntime.js';
import './shared/suppressBridgelessCodegenWarnings.js';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProductionAppAuthGate from './components/ProductionAppAuthGate';
import { useOrdersAccessGrant } from './hooks/useOrdersAccessGrant';
import { stackScreenOptions, theme } from './shared/theme';
import DashboardScreen from './screens/DashboardScreen';
import CustomersScreen from './screens/CustomersScreen';
import ProductsScreen from './screens/ProductsScreen';
import NewOrderScreen from './screens/NewOrderScreen';
import OrdersListScreen from './screens/OrdersListScreen';
import OrderDetailScreen from './screens/OrderDetailScreen';
import DeliveriesScreen from './screens/DeliveriesScreen';
import RepairsScreen from './screens/RepairsScreen';
import StorageScreen from './screens/StorageScreen';
import TrackingScreen from './screens/TrackingScreen';

const Stack = createNativeStackNavigator();

function withAccess(Component, access) {
  return function Screen(props) {
    return (
      <Component
        {...props}
        allowed={access.allowed}
        accessHint={access.accessHint}
        onRefreshAccess={access.refresh}
      />
    );
  };
}

function MainStack() {
  const access = useOrdersAccessGrant();

  if (!access.bootstrapped && access.loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const page = (Component) => withAccess(Component, access);

  return (
    <Stack.Navigator
      initialRouteName="Dashboard"
      screenOptions={{ ...stackScreenOptions, animation: 'none', animationDuration: 0 }}
    >
      <Stack.Screen name="Dashboard" options={{ headerShown: false }}>
        {(props) => (
          <DashboardScreen
            {...props}
            grant={access.grant}
            userEmail={access.userEmail}
            userDisplayName={access.userDisplayName}
            allowed={access.allowed}
            fullAccess={access.fullAccess}
            onRefreshAccess={() => access.refresh({ background: false })}
            accessHint={access.accessHint}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Customers" options={{ headerShown: false }} component={page(CustomersScreen)} />
      <Stack.Screen name="Products" options={{ headerShown: false }} component={page(ProductsScreen)} />
      <Stack.Screen name="NewOrder" options={{ headerShown: false }} component={page(NewOrderScreen)} />
      <Stack.Screen name="Orders" options={{ headerShown: false }} component={page(OrdersListScreen)} />
      <Stack.Screen name="OrderDetail" options={{ headerShown: false }} component={page(OrderDetailScreen)} />
      <Stack.Screen name="Deliveries" options={{ headerShown: false }} component={page(DeliveriesScreen)} />
      <Stack.Screen name="Repairs" options={{ headerShown: false }} component={page(RepairsScreen)} />
      <Stack.Screen name="Storage" options={{ headerShown: false }} component={page(StorageScreen)} />
      <Stack.Screen name="Tracking" options={{ headerShown: false }} component={page(TrackingScreen)} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ProductionAppAuthGate titleKey="dashTitle" signInMethods="both">
        <NavigationContainer>
          <MainStack />
        </NavigationContainer>
      </ProductionAppAuthGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
});
