import './shared/suppressBridgelessCodegenWarnings.js';
import { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProductionAppAuthGate from './components/ProductionAppAuthGate';
import { usePaintingAccessGrant } from './hooks/usePaintingAccessGrant';
import { useProductionPushNotifications } from './hooks/useProductionPushNotifications';
import DashboardScreen from './screens/DashboardScreen';
import JobsScreen from './screens/JobsScreen';
import WarehouseRepairsScreen from './screens/WarehouseRepairsScreen';
import RepairReturnSignatureScreen from './screens/RepairReturnSignatureScreen';
import RepairReturnDoneScreen from './screens/RepairReturnDoneScreen';
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
  } = usePaintingAccessGrant();

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
      <Stack.Screen name="Repairs" options={{ headerShown: false }}>
        {(props) => (
          <WarehouseRepairsScreen
            {...props}
            route={{
              ...props.route,
              params: { repairDepartment: 'painting', titleKey: 'dashRepairs', ...props.route.params },
            }}
            allowed={allowed}
            accessHint={accessHint}
            onRefreshAccess={() => refresh({ background: false })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="RepairReturnSignature" options={{ headerShown: false }} component={RepairReturnSignatureScreen} />
      <Stack.Screen name="RepairReturnDone" options={{ headerShown: false }} component={RepairReturnDoneScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const navigationRef = useRef(null);
  return (
    <SafeAreaProvider>
      <ProductionAppAuthGate
        titleKey="dashPaintingTitle"
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
