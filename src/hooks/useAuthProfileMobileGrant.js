import { useEffect, useState } from 'react';
import { defaultMobileAccessGrant, sanitizeMobileAccessGrantForUser } from '../mobile/mobileAccessManifest';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';

export function useAuthProfileMobileGrant() {
  const [grant, setGrant] = useState(defaultMobileAccessGrant());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await firebaseGetAccessToken();
        if (!token) {
          if (alive) setLoading(false);
          return;
        }
        const response = await fetch(apiUrl('/api/auth-profile'), {
          method: 'GET',
          headers: withApiHeaders({ Authorization: `Bearer ${token}` }),
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!alive) return;
        if (response.ok && payload?.user) {
          const email = payload.user.email || '';
          setGrant(sanitizeMobileAccessGrantForUser(
            payload.user.mobile_access || defaultMobileAccessGrant(),
            email,
          ));
        }
      } catch (_) {
        // keep default deny grant
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { grant, loading };
}
