import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ensureFirebaseAuthToken, getFirebaseAuth, subscribeFirebaseAuth } from '../shared/firebase';
import { verifyMobileLoginAccess } from '../shared/loginAccess';
import {
  defaultMobileAccessGrant,
  isWarehouseProductionAppAllowed,
  isWarehouseProductionOperatorAllowed,
  sanitizeMobileAccessGrantForUser,
} from '../shared/mobileAccessManifest';
import { fetchProductionAccess } from '../services/productionApi';
import { formatWarehouseMobileApiError } from '../shared/warehouseMobileApi';

function formatAccessHint(value, fallback = '') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  return formatWarehouseMobileApiError(value, fallback || 'Request failed');
}

function productionAllowedFromGrant(rawGrant, sanitizedGrant) {
  return isWarehouseProductionOperatorAllowed(sanitizedGrant)
    || isWarehouseProductionAppAllowed(rawGrant)
    || isWarehouseProductionAppAllowed(sanitizedGrant)
    || rawGrant?.warehouse_production_app === 'allow'
    || rawGrant?.warehouse_production_app === true;
}

export function useProductionAccessGrant() {
  const [grant, setGrant] = useState(defaultMobileAccessGrant());
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessHint, setAccessHint] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setAccessHint('');
    try {
      await ensureFirebaseAuthToken(true);
      const fbEmail = String(getFirebaseAuth().currentUser?.email || '').trim();
      if (fbEmail) setUserEmail(fbEmail);

      let clientAllowed = false;
      let nextGrant = defaultMobileAccessGrant();

      const access = await verifyMobileLoginAccess();
      if (access.ok && access.user) {
        const email = access.user?.email || fbEmail;
        if (email) setUserEmail(email);
        const rawGrant = access.user?.mobile_access || defaultMobileAccessGrant();
        nextGrant = sanitizeMobileAccessGrantForUser(rawGrant, email);
        setGrant(nextGrant);
        const name = String(access.user?.mobile_display_name || '').trim()
          || String(access.user?.display_name || '').trim();
        if (name) setUserDisplayName(name);
        clientAllowed = productionAllowedFromGrant(rawGrant, nextGrant);
      } else if (access.error) {
        setAccessHint(formatAccessHint(access.error, 'Login check failed.'));
      }

      let serverAllowed = false;
      try {
        const prod = await fetchProductionAccess();
        serverAllowed = Boolean(prod.allowed)
          || prod.productionApp === 'allow';
        if (prod.displayName) {
          setUserDisplayName(String(prod.displayName).trim());
        }
        if (!serverAllowed && prod.productionApp === 'deny') {
          setAccessHint((hint) => hint || 'Production app access is off in User Access. Save Upholstery Production access on the web, then tap Check access again.');
        }
      } catch (err) {
        setAccessHint((hint) => hint || formatAccessHint(err?.message, 'Could not reach production access API.'));
      }

      setAllowed(serverAllowed || clientAllowed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!alive) return;
      await refresh();
    };
    run();
    const unsubAuth = subscribeFirebaseAuth((user) => {
      if (!user) {
        setAllowed(false);
        setUserEmail('');
        setUserDisplayName('');
        setGrant(defaultMobileAccessGrant());
        setAccessHint('');
        setLoading(false);
        return;
      }
      run();
    });
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      alive = false;
      unsubAuth();
      appSub.remove();
    };
  }, [refresh]);

  return {
    grant, loading, userEmail, userDisplayName, allowed, refresh, accessHint,
  };
}
