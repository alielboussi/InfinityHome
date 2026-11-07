import './shared/lightweightRuntime.js';
import { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProductionAppAuthGate from './productionKiosk/components/ProductionAppAuthGate';
import { useCarpentryAccessGrant } from './hooks/useCarpentryAccessGrant';
import { useProductionPushNotifications } from './productionKiosk/hooks/useProductionPushNotifications';
import DashboardScreen from './screens/DashboardScreen';
import CarpentryCreateScreen from './screens/CarpentryCreateScreen';
import ManufactureScreen from './screens/ManufactureScreen';
import FinishingScreen from './screens/FinishingScreen';
import QuotesScreen from './screens/QuotesScreen';
import QuoteDetailScreen from './screens/QuoteDetailScreen';
import WarehouseRepairsScreen from './screens/WarehouseRepairsScreen';
import RepairReturnSignatureScreen from './screens/RepairReturnSignatureScreen';
import RepairReturnDoneScreen from './screens/RepairReturnDoneScreen';
import ProductionPushSettingsScreen from './screens/ProductionPushSettingsScreen';
import JobsScreen from './screens/JobsScreen';
import PaintingScreen from './screens/PaintingScreen';
import { stackScreenOptions, theme } from './shared/theme';

const Stack = createNativeStackNavigator();

function MainStack({ navigationRef }) {
  const {
    grant,
    loading,
    bootstrapped,
    userEmail,
    userDisplayName,
    allowed,
    refresh,
    accessHint,
  } = useCarpentryAccessGrant();

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
            grant={grant}
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
      <Stack.Screen name="Jobs" options={{ headerShown: false }}>
        {(props) => (
          <JobsScreen
            {...props}
            allowed={allowed}
            accessHint={accessHint}
            onRefreshAccess={refresh}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Painting" options={{ headerShown: false }}>
        {(props) => (
          <PaintingScreen
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
      <Stack.Screen name="Repairs" options={{ headerShown: false }}>
        {(props) => (
          <WarehouseRepairsScreen
            {...props}
            route={{
              ...props.route,
              params: { repairDepartment: 'carpentry', titleKey: 'dashRepairs', ...props.route.params },
            }}
            allowed={allowed}
            accessHint={accessHint}
            onRefreshAccess={refresh}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="RepairReturnSignature" options={{ headerShown: false }} component={RepairReturnSignatureScreen} />
      <Stack.Screen name="RepairReturnDone" options={{ headerShown: false }} component={RepairReturnDoneScreen} />
      <Stack.Screen name="PushSettings" options={{ headerShown: false }} component={ProductionPushSettingsScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const navigationRef = useRef(null);
  return (
    <SafeAreaProvider>
      <ProductionAppAuthGate
        titleKey="dashCarpentryTitle"
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
