import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import FirebaseAuthGate from '../shared/AuthGate';
import { getTabBarIcon } from './components/TabBarIcon';
import DashboardScreen from './screens/DashboardScreen';
import CustomersScreen from './screens/CustomersScreen';
import SalesScreen from './screens/SalesScreen';
import CustomerFormScreen from './screens/CustomerFormScreen';
import CustomerDetailScreen from './screens/CustomerDetailScreen';
import AddSaleScreen from './screens/AddSaleScreen';
import AddPaymentScreen from './screens/AddPaymentScreen';
import AddAdvanceScreen from './screens/AddAdvanceScreen';
import AppErrorBoundary from './components/ErrorBoundary';
import { colors } from './theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: getTabBarIcon(route.name),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Customers" component={CustomersScreen} options={{ title: 'Customers' }} />
      <Tab.Screen name="Sales" component={SalesScreen} options={{ title: 'Sales' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <FirebaseAuthGate title="Ledger" showUserBar={false}>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
          }}
        >
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="CustomerForm" component={CustomerFormScreen} options={{ title: 'Customer' }} />
          <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: 'Customer' }} />
          <Stack.Screen name="AddSale" component={AddSaleScreen} options={{ title: 'New sale' }} />
          <Stack.Screen name="AddPayment" component={AddPaymentScreen} options={{ title: 'Record payment' }} />
          <Stack.Screen name="AddAdvance" component={AddAdvanceScreen} options={{ title: 'Advance paid' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </FirebaseAuthGate>
    </AppErrorBoundary>
  );
}
