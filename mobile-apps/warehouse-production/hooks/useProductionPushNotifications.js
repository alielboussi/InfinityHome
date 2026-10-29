import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { isWarehouseProductionKitweDeliveryAllowed } from '../shared/mobileAccessManifest';
import {
  navigateFromProductionNotification,
  registerProductionPushTokenWithServer,
} from '../lib/productionPushNotifications';

/**
 * Register Expo push + open Sold/Returns when Hassan creates returns or storage sends.
 */
export function useProductionPushNotifications(navigationRef, { grant, allowed } = {}) {
  const registered = useRef(false);
  const kitwe = grant && isWarehouseProductionKitweDeliveryAllowed(grant);

  useEffect(() => {
    if (!allowed || !kitwe) return undefined;
    if (registered.current) return undefined;
    registered.current = true;
    registerProductionPushTokenWithServer().catch(() => {});
    return undefined;
  }, [allowed, kitwe]);

  useEffect(() => {
    if (!allowed || !kitwe) return undefined;
    const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      navigateFromProductionNotification(navigationRef, data);
    });
    const subReceived = Notifications.addNotificationReceivedListener(() => {
      // Foreground: list screens refresh on focus via useFocusEffect.
    });
    return () => {
      subResponse.remove();
      subReceived.remove();
    };
  }, [allowed, kitwe, navigationRef]);
}
