import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import EmailAuthGate from './components/EmailAuthGate';
import { getFirebaseAuth } from '../shared/firebase';
import CatalogScreen from './screens/CatalogScreen';
import ProductEditScreen from './screens/ProductEditScreen';
import ScanScreen from './screens/ScanScreen';
import SetEditScreen from './screens/SetEditScreen';

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
        <Stack.Screen name="Catalog">
          {(props) => <CatalogScreen {...props} userEmail={userEmail} />}
        </Stack.Screen>
        <Stack.Screen name="ProductEdit" component={ProductEditScreen} />
        <Stack.Screen name="SetEdit" component={SetEditScreen} />
        <Stack.Screen name="Scan" component={ScanScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <EmailAuthGate title="Product Photos">
      <StatusBar style="light" />
      <AppNavigator />
    </EmailAuthGate>
  );
}
