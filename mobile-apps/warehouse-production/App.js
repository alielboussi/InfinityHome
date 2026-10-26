import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FirebaseAuthGate from './shared/AuthGate';
import { useProductionAccessGrant } from './hooks/useProductionAccessGrant';
import DashboardScreen from './screens/DashboardScreen';
import CreateScreen from './screens/CreateScreen';
import StockScreen from './screens/StockScreen';
import { stackScreenOptions, theme } from './shared/theme';

const Stack = createNativeStackNavigator();

function MainStack() {
  const {
    loading, userEmail, userDisplayName, allowed, refresh, accessHint,
  } = useProductionAccessGrant();

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
            userEmail={userEmail}
            userDisplayName={userDisplayName}
            allowed={allowed}
            onRefreshAccess={refresh}
            accessHint={accessHint}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Create" options={{ headerShown: false }} component={CreateScreen} />
      <Stack.Screen name="Stock" options={{ headerShown: false }} component={StockScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FirebaseAuthGate
        title="Upholstery Production"
        showUserBar={false}
        signInMethods={__DEV__ ? 'both' : 'google'}
      >
        <NavigationContainer>
          <MainStack />
        </NavigationContainer>
      </FirebaseAuthGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
});
