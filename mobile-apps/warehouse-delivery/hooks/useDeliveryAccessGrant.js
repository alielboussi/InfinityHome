import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ensureFirebaseAuthToken, getFirebaseAuth, subscribeFirebaseAuth, waitForFirebaseAuthReady } from '../shared/firebase';
import { verifyMobileLoginAccess } from '../shared/loginAccess';
import { invalidateDeliveryDriversCache, prefetchDeliveryDrivers } from '../lib/deliveryDriversStore';
import {
  buildDeliveryAppAdminFallbackGrant,
  defaultMobileAccessGrant,
  evaluateWarehouseDeliveryDriverAppAccess,
  isProductionLoginAccessAdminEmail,
  sanitizeMobileAccessGrantForUser,
} from '../shared/mobileAccessManifest';
import { formatWarehouseMobileApiError } from '../shared/warehouseMobileApi';
import { setProductionAppDisplayName } from '../deliveryKit/lib/productionDispatcherLabel';

function formatAccessHint(value, fallback = '') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  return formatWarehouseMobileApiError(value, fallback || 'Request failed');
}

export function useDeliveryAccessGrant() {
  const [grant, setGrant] = useState(defaultMobileAccessGrant());
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [accessHint, setAccessHint] = useState('');
  const lastForegroundRefreshRef = useRef(0);

  const refresh = useCallback(async ({ background = false } = {}) => {
    if (!background) setLoading(true);
    if (!background) setAccessHint('');
    try {
      await waitForFirebaseAuthReady();
      await ensureFirebaseAuthToken(false);
      const fbEmail = String(getFirebaseAuth().currentUser?.email || '').trim();
      if (fbEmail) setUserEmail(fbEmail);

      const access = await verifyMobileLoginAccess();
      if (!access.ok || !access.user) {
        if (isProductionLoginAccessAdminEmail(fbEmail)) {
          const fallbackGrant = buildDeliveryAppAdminFallbackGrant();
          setGrant(fallbackGrant);
          setAllowed(true);
          setAccessHint(
            formatAccessHint(
              access.error,
              'Profile could not load from the server; using administrator delivery access. Tap Check access again after the site is healthy.',
            ),
          );
          prefetchDeliveryDrivers();
          return;
        }
        setAllowed(false);
        if (access.reason === 'disabled') {
          setAccessHint(formatAccessHint(access.error, 'Your account has been disabled.'));
        } else {
          setAccessHint(formatAccessHint(access.error, 'Could not verify login. Check connection and try again.'));
        }
        return;
      }

      const user = access.user;
      const email = String(user.email || fbEmail || '').trim();
      if (email) setUserEmail(email);

      const rawGrant = user.mobile_access || defaultMobileAccessGrant();
      const nextGrant = sanitizeMobileAccessGrantForUser(rawGrant, email);
      setGrant(nextGrant);

      const name = String(user.mobile_display_name || '').trim()
        || String(user.display_name || '').trim();
      setProductionAppDisplayName(name);
      if (name) setUserDisplayName(name);

      const nextAllowed = evaluateWarehouseDeliveryDriverAppAccess(nextGrant, email);
      setAllowed(nextAllowed);

      if (!nextAllowed) {
        setAccessHint(
          'Delivery app access is off. On the web, open User Access → Delivery, enable Warehouse Delivery (Android), Save, then tap Check access again.',
        );
      } else {
        prefetchDeliveryDrivers();
      }
    } finally {
      if (!background) setLoading(false);
      setBootstrapped(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async (background) => {
      if (!alive) return;
      await refresh({ background });
    };

    run(false);

    const unsubAuth = subscribeFirebaseAuth((user) => {
      if (!user) {
        setAllowed(false);
        setUserEmail('');
        setUserDisplayName('');
        setGrant(defaultMobileAccessGrant());
        setAccessHint('');
        invalidateDeliveryDriversCache();
        setLoading(false);
        setBootstrapped(true);
        return;
      }
      run(true);
    });

    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastForegroundRefreshRef.current < 12000) return;
      lastForegroundRefreshRef.current = now;
      run(true);
    });

    return () => {
      alive = false;
      unsubAuth();
      appSub.remove();
    };
  }, [refresh]);

  return {
    grant,
    loading,
    bootstrapped,
    userEmail,
    userDisplayName,
    allowed,
    refresh,
    accessHint,
  };
}
