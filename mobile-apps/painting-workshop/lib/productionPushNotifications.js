import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { getFirebaseAuth } from '../shared/firebase';
import { loadProductionPushPrefs } from './productionPushPrefs';
import { navigateFromProductionPushData } from '../shared/lib/productionPushNavigation';

let notificationHandlerConfigured = false;

function loadExpoNotifications() {
  try {
    return require('expo-notifications');
  } catch {
    return null;
  }
}

function ensureNotificationHandler() {
  if (notificationHandlerConfigured) return loadExpoNotifications();
  const Notifications = loadExpoNotifications();
  if (!Notifications?.setNotificationHandler) return null;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    notificationHandlerConfigured = true;
  } catch {
    return null;
  }
  return Notifications;
}

export async function ensureProductionAndroidChannel() {
  const Notifications = ensureNotificationHandler();
  if (!Notifications || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('production-alerts', {
    name: 'Production alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#38bdf8',
  });
}

export async function registerProductionPushTokenWithServer({ pushPrefs: pushPrefsOverride } = {}) {
  const Notifications = ensureNotificationHandler();
  if (!Notifications) {
    return { ok: false, skipped: true, reason: 'notifications_unavailable' };
  }
  if (!Device.isDevice) return { ok: false, skipped: true, reason: 'simulator' };
  const authUser = getFirebaseAuth()?.currentUser;
  if (!authUser) return { ok: false, skipped: true, reason: 'auth' };
  try {
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
    const push_prefs = pushPrefsOverride || await loadProductionPushPrefs();
    await warehouseMobileRequest('production-push-register', {
      expo_push_token: token,
      platform: Platform.OS,
      app_target: 'painting',
      push_prefs,
    });
    return { ok: true, token };
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/ExpoApplication|native module/i.test(msg)) {
      return { ok: false, skipped: true, reason: 'native_module' };
    }
    throw err;
  }
}

export function subscribeProductionPushListeners(navigationRef) {
  const Notifications = ensureNotificationHandler();
  if (!Notifications?.addNotificationResponseReceivedListener) {
    return () => {};
  }
  const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    navigateFromProductionNotification(navigationRef, data);
  });
  const subReceived = Notifications.addNotificationReceivedListener(() => {
    const { emitProductionRefresh } = require('./productionRefreshBus');
    emitProductionRefresh('push');
  });
  return () => {
    subResponse.remove();
    subReceived.remove();
  };
}

export function navigateFromProductionNotification(navigationRef, data) {
  navigateFromProductionPushData(navigationRef, data, {
    jobs: 'Jobs',
    repairs: 'Jobs',
  });
}
