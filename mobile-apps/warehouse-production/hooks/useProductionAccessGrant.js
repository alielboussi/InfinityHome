import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ensureFirebaseAuthToken, getFirebaseAuth, subscribeFirebaseAuth } from '../shared/firebase';
import { verifyMobileLoginAccess } from '../shared/loginAccess';
import {
  defaultMobileAccessGrant,
  evaluateWarehouseProductionAppAccess,
  sanitizeMobileAccessGrantForUser,
} from '../shared/mobileAccessManifest';
import { formatWarehouseMobileApiError } from '../shared/warehouseMobileApi';
import { setProductionAppDisplayName } from '../lib/productionDispatcherLabel';

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
  const [bootstrapped, setBootstrapped] = useState(false);
  const [accessHint, setAccessHint] = useState('');
  const lastForegroundRefreshRef = useRef(0);

  const refresh = useCallback(async ({ background = false } = {}) => {
    if (!background) setLoading(true);
    if (!background) setAccessHint('');
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
      setProductionAppDisplayName(name);
      if (name) setUserDisplayName(name);

      const nextAllowed = productionAllowedFromAuthProfile(user);
      setAllowed(nextAllowed);

      if (!nextAllowed) {
        setAccessHint(
          'Production app access is off in User Access. On the web, open User Access → Production, enable access, Save, then tap Check access again.',
        );
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
