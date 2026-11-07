import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import {
  navigateFromProductionNotification,
  registerProductionPushTokenWithServer,
} from '../lib/productionPushNotifications';
import { emitProductionRefresh } from '../lib/productionRefreshBus';

/**
 * Register Expo push for upholstery production alerts (quote orders, etc.).
 */
export function useProductionPushNotifications(navigationRef, { allowed } = {}) {
  const registered = useRef(false);

  useEffect(() => {
    if (!allowed) return undefined;
    if (registered.current) return undefined;
    registered.current = true;
    registerProductionPushTokenWithServer().catch(() => {});
    return undefined;
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return undefined;
    const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      navigateFromProductionNotification(navigationRef, data);
    });
    const subReceived = Notifications.addNotificationReceivedListener(() => {
      emitProductionRefresh('push');
    });
    return () => {
      subResponse.remove();
      subReceived.remove();
    };
  }, [allowed, navigationRef]);
}
