import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Refresh on focus without flashing empty/loading when cached data exists.
 */
export function useStaleFocusRefresh(loadFn, { enabled = true, minIntervalMs = 0 } = {}) {
  const hasDataRef = useRef(false);
  const lastLoadRef = useRef(0);

  const wrappedLoad = useCallback(async (opts = {}) => {
    const forceLoading = opts.forceLoading === true;
    const now = Date.now();
    if (minIntervalMs > 0 && now - lastLoadRef.current < minIntervalMs && !forceLoading) {
      return;
    }
    lastLoadRef.current = now;
    await loadFn({
      showLoading: forceLoading || !hasDataRef.current,
      background: hasDataRef.current && !forceLoading,
    });
    hasDataRef.current = true;
  }, [loadFn, minIntervalMs]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      wrappedLoad();
      return undefined;
    }, [enabled, wrappedLoad]),
  );

  return { refresh: wrappedLoad, markEmpty: () => { hasDataRef.current = false; } };
}
