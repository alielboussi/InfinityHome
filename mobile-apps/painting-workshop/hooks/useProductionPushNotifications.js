import { useEffect, useRef } from 'react';
import {
  registerProductionPushTokenWithServer,
  subscribeProductionPushListeners,
} from '../lib/productionPushNotifications';

/**
 * Register Expo push for painting production alerts.
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
    try {
      return subscribeProductionPushListeners(navigationRef);
    } catch {
      return undefined;
    }
  }, [allowed, navigationRef]);
}
