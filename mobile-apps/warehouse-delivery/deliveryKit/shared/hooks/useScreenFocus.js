import { useEffect } from 'react';

/**
 * Run callback when a stack screen gains focus — uses the navigation prop
 * (no NavigationContext required). Safer during auth transitions / Fast Refresh.
 */
export function useScreenFocus(navigation, onFocus) {
  useEffect(() => {
    if (!navigation?.addListener || typeof onFocus !== 'function') return undefined;
    const unsub = navigation.addListener('focus', onFocus);
    if (navigation.isFocused?.()) onFocus();
    return unsub;
  }, [navigation, onFocus]);
}
