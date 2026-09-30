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
import ScanScreen from './screens/ScanScreen';
import PacketFormScreen from './screens/PacketFormScreen';
import ProductFormScreen from './screens/ProductFormScreen';
import WarehouseOcrSkuScreen from './screens/WarehouseOcrSkuScreen';
import WarehouseProductDetailScreen from './screens/WarehouseProductDetailScreen';

const Stack = createNativeStackNavigator();

function MainStack() {
  const { grant, loading, userEmail, userDisplayName } = useMobileAccessGrant();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#e2e8f0',
        contentStyle: { backgroundColor: '#0f172a' },
      }}
    >
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
        options={{ title: 'Warehouse Products' }}
        component={WarehouseProductsScreen}
      />
      <Stack.Screen name="WarehouseScan" options={{ title: 'Scan barcode' }} component={ScanScreen} />
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
      <Stack.Screen name="PacketForm" options={{ title: 'Packet' }} component={PacketFormScreen} />
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
  root: { flex: 1, backgroundColor: '#0f172a' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
});
