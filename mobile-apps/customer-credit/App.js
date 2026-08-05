import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import FirebaseAuthGate from '../shared/AuthGate';
import DashboardScreen from './screens/DashboardScreen';
import CustomersScreen from './screens/CustomersScreen';
import ProductsScreen from './screens/ProductsScreen';
import CustomerFormScreen from './screens/CustomerFormScreen';
import CustomerDetailScreen from './screens/CustomerDetailScreen';
import ProductFormScreen from './screens/ProductFormScreen';
import AddSaleScreen from './screens/AddSaleScreen';
import AddPaymentScreen from './screens/AddPaymentScreen';
import { colors } from './theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabLabel({ title, focused }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: focused ? '700' : '500', color: focused ? colors.primary : colors.muted }}>
      {title}
    </Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: ({ focused }) => <TabLabel title="Dashboard" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Customers"
        component={CustomersScreen}
        options={{
          title: 'Customers',
          tabBarLabel: ({ focused }) => <TabLabel title="Customers" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsScreen}
        options={{
          title: 'Products',
          tabBarLabel: ({ focused }) => <TabLabel title="Products" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <FirebaseAuthGate title="Customer Credit">
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
          <Stack.Screen name="ProductForm" component={ProductFormScreen} options={{ title: 'Product' }} />
          <Stack.Screen name="AddSale" component={AddSaleScreen} options={{ title: 'Add products' }} />
          <Stack.Screen name="AddPayment" component={AddPaymentScreen} options={{ title: 'Record payment' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </FirebaseAuthGate>
  );
}
