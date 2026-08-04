import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, TextInput, View } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import FirebaseAuthGate from '../shared/AuthGate';
import { getFirebaseAuth } from '../shared/firebase';
import ProductListScreen from './screens/ProductListScreen';
import CartScreen from './screens/CartScreen';

const Stack = createNativeStackNavigator();

function mergeCartItem(cart, product) {
  const existing = cart.find((item) => item.product.id === product.id);
  if (existing) {
    return cart.map((item) =>
      item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item,
    );
  }
  return [...cart, { product, qty: 1 }];
}

export default function App() {
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userFullName, setUserFullName] = useState('');
  const [cart, setCart] = useState([]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (user) => {
      if (!user) return;
      if (!userEmail && user.email) setUserEmail(user.email);
      if (!userFullName && user.displayName) setUserFullName(user.displayName);
    });
  }, [userEmail, userFullName]);

  const handlers = useMemo(
    () => ({
      onAddToCart: (product) => setCart((prev) => mergeCartItem(prev, product)),
      onUpdateQty: (productId, text) => {
        const qty = Math.max(0, Number(text) || 0);
        setCart((prev) =>
          prev
            .map((item) =>
              item.product.id === productId ? { ...item, qty } : item,
            )
            .filter((item) => item.qty > 0),
        );
      },
      onRemove: (productId) =>
        setCart((prev) => prev.filter((item) => item.product.id !== productId)),
      onClear: () => setCart([]),
    }),
    [],
  );

  return (
    <FirebaseAuthGate>
      <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.userBar}>
        <TextInput
          style={styles.input}
          placeholder="User ID"
          value={userId}
          onChangeText={setUserId}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={userEmail}
          onChangeText={setUserEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Full name"
          value={userFullName}
          onChangeText={setUserFullName}
        />
      </View>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Products">
            {(props) => (
              <ProductListScreen
                {...props}
                cart={cart}
                onAddToCart={handlers.onAddToCart}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Cart">
            {(props) => (
              <CartScreen
                {...props}
                cart={cart}
                userId={userId}
                userEmail={userEmail}
                userFullName={userFullName}
                {...handlers}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
      </SafeAreaView>
    </FirebaseAuthGate>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f766e' },
  userBar: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
