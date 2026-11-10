import { useEffect, useRef } from 'react';
import {
  registerDeliveryPushTokenWithServer,
  subscribeDeliveryPushListeners,
} from '../lib/deliveryPushNotifications';

export function useDeliveryPushNotifications(navigationRef, { allowed } = {}) {
  const registered = useRef(false);

  useEffect(() => {
    if (!allowed) return undefined;
    if (registered.current) return undefined;
    registered.current = true;
    registerDeliveryPushTokenWithServer().catch(() => {});
    return undefined;
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return undefined;
    try {
      return subscribeDeliveryPushListeners(navigationRef);
    } catch {
      return undefined;
    }
  }, [allowed, navigationRef]);
}
