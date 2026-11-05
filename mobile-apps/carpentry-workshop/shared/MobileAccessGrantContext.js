import { createContext, useContext, useMemo } from 'react';
import { defaultMobileAccessGrant } from './mobileAccessManifest';

const MobileAccessGrantContext = createContext({ grant: null, userEmail: '' });

export function MobileAccessGrantProvider({ grant, userEmail = '', children }) {
  const value = useMemo(() => ({
    grant: grant || defaultMobileAccessGrant(),
    userEmail: String(userEmail || '').trim(),
  }), [grant, userEmail]);
  return (
    <MobileAccessGrantContext.Provider value={value}>
      {children}
    </MobileAccessGrantContext.Provider>
  );
}

/** Grant from MainStack — avoids a second async fetch per screen. */
export function useSharedMobileAccessGrant() {
  const ctx = useContext(MobileAccessGrantContext);
  return ctx?.grant || defaultMobileAccessGrant();
}

export function useSharedMobileAccessUserEmail() {
  const ctx = useContext(MobileAccessGrantContext);
  return ctx?.userEmail || '';
}
