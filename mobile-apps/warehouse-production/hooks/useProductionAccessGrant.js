import { useEffect, useState } from 'react';
import { verifyMobileLoginAccess } from '../shared/loginAccess';
import {
  defaultMobileAccessGrant,
  isWarehouseProductionAppAllowed,
  sanitizeMobileAccessGrantForUser,
} from '../shared/mobileAccessManifest';

export function useProductionAccessGrant() {
  const [grant, setGrant] = useState(defaultMobileAccessGrant());
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const access = await verifyMobileLoginAccess();
      if (!alive) return;
      if (access.ok) {
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
        setAllowed(isWarehouseProductionAppAllowed(nextGrant));
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return { grant, loading, userEmail, userDisplayName, allowed };
}
