import { createContext, useContext } from 'react';
import { defaultMobileAccessGrant } from './mobileAccessManifest';

const MobileAccessGrantContext = createContext(null);

export function MobileAccessGrantProvider({ grant, children }) {
  const value = grant || defaultMobileAccessGrant();
  return (
    <MobileAccessGrantContext.Provider value={value}>
      {children}
    </MobileAccessGrantContext.Provider>
  );
}

/** Grant from MainStack — avoids a second async fetch per screen. */
export function useSharedMobileAccessGrant() {
  const grant = useContext(MobileAccessGrantContext);
  return grant || defaultMobileAccessGrant();
}
