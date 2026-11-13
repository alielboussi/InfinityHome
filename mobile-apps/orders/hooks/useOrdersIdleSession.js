import { useCallback, useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { signOutFirebase } from '../shared/firebase';
import { resetBiometricUnlock } from '../shared/biometricSession';
import { useFirebaseUser } from '../shared/AuthGate';

export const ORDERS_SESSION_IDLE_MS = 600_000;

/**
 * Signs the user out after {idleMs} without touch/foreground activity (default 10 minutes).
 */
export function useOrdersIdleSession(idleMs = ORDERS_SESSION_IDLE_MS) {
  const user = useFirebaseUser();
  const lastActivityRef = useRef(Date.now());
  const appStateRef = useRef(AppState.currentState);

  const bumpActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    bumpActivity();
    const signOutIdle = () => {
      resetBiometricUnlock();
      void signOutFirebase();
    };
    const appSub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        if (Date.now() - lastActivityRef.current >= idleMs) {
          signOutIdle();
        } else {
          bumpActivity();
        }
      }
    });
    const interval = setInterval(() => {
      if (appStateRef.current !== 'active') return;
      if (Date.now() - lastActivityRef.current >= idleMs) {
        signOutIdle();
      }
    }, 15_000);
    return () => {
      appSub.remove();
      clearInterval(interval);
    };
  }, [user?.uid, idleMs, bumpActivity]);

  return bumpActivity;
}

/** Wrap authed app tree so touches reset the idle timer. */
export function OrdersIdleActivityRoot({ children, bumpActivity }) {
  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={bumpActivity}
      onTouchEnd={bumpActivity}
      collapsable={false}
    >
      {children}
    </View>
  );
}
