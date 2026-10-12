import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import BiometricGate from './shared/BiometricGate';
import FirebaseAuthGate from './shared/AuthGate';
import { useMobileAccessGrant } from './shared/useMobileAccessGrant';
import DashboardScreen from './screens/DashboardScreen';
import WarehouseProductsScreen from './screens/WarehouseProductsScreen';
import WarehousePacketsScreen from './screens/WarehousePacketsScreen';
import ScanScreen from './screens/ScanScreen';
import PacketFormScreen from './screens/PacketFormScreen';
import ProductFormScreen from './screens/ProductFormScreen';
import WarehouseOcrSkuScreen from './screens/WarehouseOcrSkuScreen';
import WarehouseProductDetailScreen from './screens/WarehouseProductDetailScreen';
import WarehouseStockCountScreen from './screens/WarehouseStockCountScreen';
import MobileScreenGate from './shared/MobileScreenGate';
import { stackScreenOptions, theme } from './shared/theme';

const Stack = createNativeStackNavigator();

function MainStack() {
  const { grant, loading, userEmail, userDisplayName } = useMobileAccessGrant();

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
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="WarehouseProducts" options={{ title: 'Warehouse catalog' }}>
        {(props) => (
          <MobileScreenGate screenId="warehouse_products" grant={grant} navigation={props.navigation}>
            <WarehouseProductsScreen {...props} route={{ ...props.route, params: { catalogMode: 'complete' } }} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="WarehouseIncompleteProducts" options={{ title: 'Incomplete products' }}>
        {(props) => (
          <MobileScreenGate screenId="warehouse_incomplete_products" grant={grant} navigation={props.navigation}>
            <WarehouseProductsScreen {...props} route={{ ...props.route, params: { catalogMode: 'incomplete' } }} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="WarehousePackets" options={{ title: 'Warehouse packets' }}>
        {(props) => (
          <MobileScreenGate screenId="warehouse_packets" grant={grant} navigation={props.navigation}>
            <WarehousePacketsScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="WarehouseStockCount" options={{ title: 'Stock count' }}>
        {(props) => (
          <MobileScreenGate screenId="warehouse_floor_count" grant={grant} navigation={props.navigation}>
            <WarehouseStockCountScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="WarehouseScan" options={{ title: 'Look up SKU' }} component={ScanScreen} />
      <Stack.Screen
        name="WarehouseOcrSku"
        options={{ title: 'Label SKU (text)' }}
        component={WarehouseOcrSkuScreen}
      />
      <Stack.Screen
        name="WarehouseProductDetail"
        options={{ title: 'Product info' }}
        component={WarehouseProductDetailScreen}
      />
      <Stack.Screen name="PacketForm" options={{ title: 'Packet' }}>
        {(props) => (
          <MobileScreenGate screenId="warehouse_packet_form" grant={grant} navigation={props.navigation}>
            <PacketFormScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="ProductForm" options={{ title: 'Product' }} component={ProductFormScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FirebaseAuthGate title="Warehouse Catalog" showUserBar={false}>
        <BiometricGate>
          <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
            <StatusBar style="light" />
            <NavigationContainer>
              <MainStack />
            </NavigationContainer>
          </SafeAreaView>
        </BiometricGate>
      </FirebaseAuthGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
});
