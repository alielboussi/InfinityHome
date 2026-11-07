import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { getFirebaseAuth } from '../shared/firebase';
import { navigateFromProductionPushData } from '../../../shared/lib/productionPushNavigation';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function ensureProductionAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('production-alerts', {
    name: 'Production alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#38bdf8',
  });
}

export async function registerProductionPushTokenWithServer() {
  if (!Device.isDevice) return { ok: false, skipped: true, reason: 'simulator' };
  const authUser = getFirebaseAuth()?.currentUser;
  if (!authUser) return { ok: false, skipped: true, reason: 'auth' };
  await ensureProductionAndroidChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return { ok: false, skipped: true, reason: 'permission_denied' };
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId;
  const tokenRes = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const token = tokenRes?.data;
  if (!token) return { ok: false, skipped: true, reason: 'no_token' };
  await warehouseMobileRequest('production-push-register', {
    expo_push_token: token,
    platform: Platform.OS,
  });
  return { ok: true, token };
}

export function navigateFromProductionNotification(navigationRef, data) {
  navigateFromProductionPushData(navigationRef, data, {
    soldOrders: 'SoldOrders',
    soldOrderDetail: 'SoldOrderDetail',
  });
}
