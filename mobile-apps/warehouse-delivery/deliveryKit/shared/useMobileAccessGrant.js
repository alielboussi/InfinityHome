import { useEffect, useState } from 'react';
import { verifyMobileLoginAccess } from './loginAccess';
import {
  defaultMobileAccessGrant,
  sanitizeMobileAccessGrantForUser,
} from './mobileAccessManifest';

export function useMobileAccessGrant() {
  const [grant, setGrant] = useState(defaultMobileAccessGrant());
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const access = await verifyMobileLoginAccess();
      if (!alive) return;
      if (access.ok) {
        setUserEmail(access.user?.email || '');
        const name = String(access.user?.mobile_display_name || '').trim()
          || String(access.user?.display_name || '').trim()
          || String(access.user?.full_name || '').trim();
        setUserDisplayName(name);
        const email = access.user?.email || '';
        setGrant(sanitizeMobileAccessGrantForUser(
          access.user?.mobile_access || defaultMobileAccessGrant(),
          email,
        ));
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return { grant, loading, userEmail, userDisplayName };
}
