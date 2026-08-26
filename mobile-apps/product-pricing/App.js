import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import EmailAuthGate from './components/EmailAuthGate';
import { getFirebaseAuth } from '../shared/firebase';
import DashboardScreen from './screens/DashboardScreen';
import CatalogScreen from './screens/CatalogScreen';
import ProductEditScreen from './screens/ProductEditScreen';
import ScanScreen from './screens/ScanScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (nextUser) => {
      setUserEmail(nextUser?.email || '');
    });
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a08' } }}>
        <Stack.Screen name="Dashboard">
          {(props) => <DashboardScreen {...props} userEmail={userEmail} />}
        </Stack.Screen>
        <Stack.Screen name="Catalog" component={CatalogScreen} />
        <Stack.Screen name="ProductEdit" component={ProductEditScreen} />
        <Stack.Screen name="Scan" component={ScanScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <EmailAuthGate title="Product Pricing">
      <StatusBar style="light" />
      <AppNavigator />
    </EmailAuthGate>
  );
}
