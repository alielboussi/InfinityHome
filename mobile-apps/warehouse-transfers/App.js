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
  const existing = cart.find((item) => item.productId === product.id);
  if (existing) {
    return cart.map((item) =>
      item.productId === product.id
        ? { ...item, quantity: item.quantity + 1 }
        : item,
    );
  }
  return [
    ...cart,
    {
      productId: product.id,
      name: product.name,
      sku: product.sku || '',
      quantity: 1,
    },
  ];
}

export default function App() {
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [cart, setCart] = useState([]);
  const [idempotencyKey, setIdempotencyKey] = useState(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (user) => {
      if (!user) return;
      if (!userEmail && user.email) setUserEmail(user.email);
      if (!userName && user.displayName) setUserName(user.displayName);
    });
  }, [userEmail, userName]);

  const handlers = useMemo(
    () => ({
      onAddToCart: (product) => setCart((prev) => mergeCartItem(prev, product)),
      onUpdateQty: (productId, text) => {
        const quantity = Math.max(0, Number(text) || 0);
        setCart((prev) =>
          prev
            .map((item) =>
              item.productId === productId ? { ...item, quantity } : item,
            )
            .filter((item) => item.quantity > 0),
        );
      },
      onRemove: (productId) =>
        setCart((prev) => prev.filter((item) => item.productId !== productId)),
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
          placeholder="Your email"
          value={userEmail}
          onChangeText={setUserEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Your name"
          value={userName}
          onChangeText={setUserName}
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
                userEmail={userEmail}
                userName={userName}
                idempotencyKey={idempotencyKey}
                onIdempotencyKeyChange={setIdempotencyKey}
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
  root: { flex: 1, backgroundColor: '#1e40af' },
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
