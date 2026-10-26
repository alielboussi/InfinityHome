import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ensureFirebaseAuthToken, subscribeFirebaseAuth } from '../shared/firebase';
import { verifyMobileLoginAccess } from '../shared/loginAccess';
import {
  defaultMobileAccessGrant,
  isWarehouseProductionOperatorAllowed,
  sanitizeMobileAccessGrantForUser,
} from '../shared/mobileAccessManifest';
import { fetchProductionAccess } from '../services/productionApi';

export function useProductionAccessGrant() {
  const [grant, setGrant] = useState(defaultMobileAccessGrant());
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await ensureFirebaseAuthToken(true);
      const access = await verifyMobileLoginAccess();
      if (!access.ok) {
        setAllowed(false);
        return;
      }
      const email = access.user?.email || '';
      setUserEmail(email);
      const name = String(access.user?.mobile_display_name || '').trim()
        || String(access.user?.display_name || '').trim();
      setUserDisplayName(name);
      const nextGrant = sanitizeMobileAccessGrantForUser(
        access.user?.mobile_access || defaultMobileAccessGrant(),
        email,
      );
      setGrant(nextGrant);

      let serverAllowed = false;
      try {
        const prod = await fetchProductionAccess();
        serverAllowed = Boolean(prod.allowed);
        if (prod.displayName) {
          setUserDisplayName(String(prod.displayName).trim());
        }
      } catch {
        serverAllowed = isWarehouseProductionOperatorAllowed(nextGrant);
      }
      setAllowed(serverAllowed);
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

  return { grant, loading, userEmail, userDisplayName, allowed, refresh };
}
