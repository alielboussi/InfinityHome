import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FirebaseAuthGate from './shared/AuthGate';
import MobileScreenGate from './shared/MobileScreenGate';
import { useProductionAccessGrant } from './hooks/useProductionAccessGrant';
import DashboardScreen from './screens/DashboardScreen';
import CreateScreen from './screens/CreateScreen';
import StockScreen from './screens/StockScreen';
import KitweSendHomeScreen from './screens/KitweSendHomeScreen';
import KitweSendProductScreen from './screens/KitweSendProductScreen';
import KitweSendDoneScreen from './screens/KitweSendDoneScreen';
import { stackScreenOptions, theme } from './shared/theme';

const Stack = createNativeStackNavigator();

function MainStack() {
  const {
    grant,
    loading,
    userEmail,
    userDisplayName,
    allowed,
    refresh,
    accessHint,
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
            grant={grant}
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
      <Stack.Screen name="KitweSendHome" options={{ headerShown: false }}>
        {(props) => (
          <MobileScreenGate screenId="kitwe_send_delivery" grant={grant} navigation={props.navigation}>
            <KitweSendHomeScreen {...props} />
          </MobileScreenGate>
        )}
      </Stack.Screen>
      <Stack.Screen name="KitweSendProduct" options={{ headerShown: false }} component={KitweSendProductScreen} />
      <Stack.Screen name="KitweSendDone" options={{ headerShown: false }} component={KitweSendDoneScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FirebaseAuthGate
        title="Production"
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
