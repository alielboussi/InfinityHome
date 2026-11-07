import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps a hub "view" in the URL query (?view= / ?floor= / ?room= / ?report=).
 */
export function usePortalHubView(paramName, options, defaultValue) {
  const [searchParams, setSearchParams] = useSearchParams();
  const allowed = useMemo(
    () => new Set((options || []).map((o) => String(o.value))),
    [options],
  );
  const raw = searchParams.get(paramName);
  const value = allowed.has(String(raw)) ? String(raw) : defaultValue;

  const setValue = useCallback((next) => {
    const v = String(next);
    if (!allowed.has(v)) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(paramName, v);
    setSearchParams(nextParams, { replace: true });
  }, [allowed, paramName, searchParams, setSearchParams]);

  return [value, setValue];
}
