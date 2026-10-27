import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ensureFirebaseAuthToken, getFirebaseAuth, subscribeFirebaseAuth } from '../shared/firebase';
import { verifyMobileLoginAccess } from '../shared/loginAccess';
import {
  defaultMobileAccessGrant,
  evaluateWarehouseProductionAppAccess,
  sanitizeMobileAccessGrantForUser,
} from '../shared/mobileAccessManifest';
import { formatWarehouseMobileApiError } from '../shared/warehouseMobileApi';

function formatAccessHint(value, fallback = '') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  return formatWarehouseMobileApiError(value, fallback || 'Request failed');
}

function productionAllowedFromAuthProfile(user) {
  if (!user || typeof user !== 'object') return false;
  if (user.production_app_allowed === true) return true;
  const email = user.email || '';
  const grant = user.mobile_access || defaultMobileAccessGrant();
  const sanitized = sanitizeMobileAccessGrantForUser(grant, email);
  return evaluateWarehouseProductionAppAccess(sanitized, email);
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

      const access = await verifyMobileLoginAccess();
      if (!access.ok || !access.user) {
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
      if (name) setUserDisplayName(name);

      const nextAllowed = productionAllowedFromAuthProfile(user);
      setAllowed(nextAllowed);

      if (!nextAllowed) {
        setAccessHint(
          'Production app access is off in User Access. On the web, open User Access → Production, enable access, Save, then tap Check access again.',
        );
      }
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
