import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProductionAppAuthGate from '../productionKiosk/components/ProductionAppAuthGate';
import { useCarpentryAccessGrant } from './hooks/useCarpentryAccessGrant';
import DashboardScreen from './screens/DashboardScreen';
import CarpentryCreateScreen from './screens/CarpentryCreateScreen';
import ManufactureScreen from './screens/ManufactureScreen';
import FinishingScreen from './screens/FinishingScreen';
import QuotesScreen from './screens/QuotesScreen';
import QuoteDetailScreen from './screens/QuoteDetailScreen';
import { stackScreenOptions, theme } from './shared/theme';

const Stack = createNativeStackNavigator();

function MainStack() {
  const {
    loading,
    bootstrapped,
    userEmail,
    userDisplayName,
    allowed,
    refresh,
    accessHint,
  } = useCarpentryAccessGrant();

  if (!bootstrapped && loading) {
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
            onRefreshAccess={() => refresh({ background: false })}
            accessHint={accessHint}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Create" options={{ headerShown: false }} component={CarpentryCreateScreen} />
      <Stack.Screen name="Manufacture" options={{ headerShown: false }}>
        {(props) => (
          <ManufactureScreen
            {...props}
            allowed={allowed}
            accessHint={accessHint}
            onRefreshAccess={refresh}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Finishing" options={{ headerShown: false }}>
        {(props) => (
          <FinishingScreen
            {...props}
            allowed={allowed}
            accessHint={accessHint}
            onRefreshAccess={refresh}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Quotes" options={{ headerShown: false }}>
        {(props) => (
          <QuotesScreen
            {...props}
            navigation={props.navigation}
            allowed={allowed}
            accessHint={accessHint}
            onRefreshAccess={refresh}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="QuoteDetail" options={{ headerShown: false }} component={QuoteDetailScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ProductionAppAuthGate
        titleKey="dashCarpentryTitle"
        signInMethods={__DEV__ ? 'both' : 'google'}
      >
        <NavigationContainer>
          <MainStack />
        </NavigationContainer>
      </ProductionAppAuthGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
});
