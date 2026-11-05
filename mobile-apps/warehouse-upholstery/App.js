import './shared/suppressBridgelessCodegenWarnings.js';
import { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProductionAppAuthGate from './components/ProductionAppAuthGate';
import { useProductionAccessGrant } from './hooks/useProductionAccessGrant';
import { useProductionPushNotifications } from './hooks/useProductionPushNotifications';
import DashboardScreen from './screens/DashboardScreen';
import CreateScreen from './screens/CreateScreen';
import ManufactureScreen from './screens/ManufactureScreen';
import JobsScreen from './screens/JobsScreen';
import UpholsteryQuotesScreen from './screens/UpholsteryQuotesScreen';
import UpholsteryQuoteDetailScreen from './screens/UpholsteryQuoteDetailScreen';
import { stackScreenOptions, theme } from './shared/theme';

const Stack = createNativeStackNavigator();

function MainStack({ navigationRef }) {
  const {
    loading,
    bootstrapped,
    userEmail,
    userDisplayName,
    allowed,
    photoUploadAllowed,
    refresh,
    accessHint,
  } = useProductionAccessGrant();

  useProductionPushNotifications(navigationRef, { allowed });

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
      <Stack.Screen name="Create" options={{ headerShown: false }} component={CreateScreen} />
      <Stack.Screen name="Manufacture" options={{ headerShown: false }}>
        {(props) => (
          <ManufactureScreen
            {...props}
            allowed={allowed}
            photoUploadAllowed={photoUploadAllowed}
            accessHint={accessHint}
            onRefreshAccess={() => refresh({ background: false })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Jobs" options={{ headerShown: false }}>
        {(props) => (
          <JobsScreen
            {...props}
            allowed={allowed}
            accessHint={accessHint}
            onRefreshAccess={() => refresh({ background: false })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="UpholsteryQuotes" options={{ headerShown: false }}>
        {(props) => (
          <UpholsteryQuotesScreen
            {...props}
            allowed={allowed}
            accessHint={accessHint}
            onRefreshAccess={() => refresh({ background: false })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="UpholsteryQuoteDetail" options={{ headerShown: false }} component={UpholsteryQuoteDetailScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const navigationRef = useRef(null);
  return (
    <SafeAreaProvider>
      <ProductionAppAuthGate
        titleKey="dashTitle"
        signInMethods={__DEV__ ? 'both' : 'google'}
      >
        <NavigationContainer ref={navigationRef}>
          <MainStack navigationRef={navigationRef} />
        </NavigationContainer>
      </ProductionAppAuthGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
});
