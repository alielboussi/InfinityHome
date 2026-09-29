import { useEffect, useState } from 'react';
import { verifyMobileLoginAccess } from './loginAccess';
import { defaultMobileAccessGrant } from './mobileAccessManifest';

function normalizeGrant(raw) {
  const base = defaultMobileAccessGrant();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    screens: { ...base.screens, ...(raw.screens || {}) },
  };
}

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
        if (access.user?.mobile_access) {
          setGrant(normalizeGrant(access.user.mobile_access));
        }
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return { grant, loading, userEmail, userDisplayName };
}
