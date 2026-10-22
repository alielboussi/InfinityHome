import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppErrorBoundary from './shared/AppErrorBoundary';
import BiometricGate from './shared/BiometricGate';
import FirebaseAuthGate from './shared/AuthGate';
import { MobileAccessGrantProvider } from './shared/MobileAccessGrantContext';
import { WarehouseCatalogProvider } from './shared/WarehouseCatalogContext';
import { useMobileAccessGrant } from './shared/useMobileAccessGrant';
import DashboardScreen from './screens/DashboardScreen';
import WarehouseProductsScreen from './screens/WarehouseProductsScreen';
import WarehousePacketsScreen from './screens/WarehousePacketsScreen';
import WarehouseUnusedPacketsScreen from './screens/WarehouseUnusedPacketsScreen';
import ScanScreen from './screens/ScanScreen';
import PacketFormScreen from './screens/PacketFormScreen';
import ProductFormScreen from './screens/ProductFormScreen';
import WarehouseOcrSkuScreen from './screens/WarehouseOcrSkuScreen';
import WarehouseLabelCaptureScreen from './screens/WarehouseLabelCaptureScreen';
import WarehouseProductDetailScreen from './screens/WarehouseProductDetailScreen';
import MobileScreenGate from './shared/MobileScreenGate';
import { MOBILE_APP_DISPLAY_NAME } from './shared/mobileAccessManifest';
import { stackScreenOptions, theme } from './shared/theme';

enableScreens(true);

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
    <MobileAccessGrantProvider grant={grant}>
    <WarehouseCatalogProvider>
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
      <Stack.Screen
        name="WarehouseProducts"
        options={{ title: 'Products' }}
        initialParams={{ catalogMode: 'complete' }}
      >
        {(props) => (
          <MobileScreenGate screenId="warehouse_products" grant={grant} navigation={props.navigation}>
            <WarehouseProductsScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen
        name="WarehouseIncompleteProducts"
        options={{ title: 'Incomplete Products' }}
        initialParams={{ catalogMode: 'incomplete' }}
      >
        {(props) => (
          <MobileScreenGate screenId="warehouse_incomplete_products" grant={grant} navigation={props.navigation}>
            <WarehouseProductsScreen {...props} />
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
      <Stack.Screen name="WarehouseUnusedPackets" options={{ title: 'Warehouse Unused Packets' }}>
        {(props) => (
          <MobileScreenGate screenId="warehouse_unused_packets" grant={grant} navigation={props.navigation}>
            <WarehouseUnusedPacketsScreen {...props} />
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
        name="WarehouseLabelCapture"
        options={{ title: 'Label photo' }}
        component={WarehouseLabelCaptureScreen}
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
    </WarehouseCatalogProvider>
    </MobileAccessGrantProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FirebaseAuthGate title={MOBILE_APP_DISPLAY_NAME} showUserBar={false}>
        <BiometricGate>
          <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
            <StatusBar style="light" />
            <NavigationContainer>
              <AppErrorBoundary>
                <MainStack />
              </AppErrorBoundary>
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
