import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  fetchWarehouseCatalogCached,
  getWarehouseCatalogCache,
  invalidateWarehouseCatalogCache,
  isWarehouseCatalogStale,
  mergeWarehouseCatalogPatch,
  setWarehouseCatalogCache,
} from './warehouseCatalogStore';

const WarehouseCatalogContext = createContext(null);

export function WarehouseCatalogProvider({ children }) {
  const [catalog, setCatalog] = useState(() => getWarehouseCatalogCache());
  const [initialLoading, setInitialLoading] = useState(() => !getWarehouseCatalogCache());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const applyCatalog = useCallback((next) => {
    setWarehouseCatalogCache(next);
    setCatalog(next);
  }, []);

  const patchCatalog = useCallback((patch) => {
    setCatalog((prev) => {
      const merged = mergeWarehouseCatalogPatch(prev, patch);
      if (merged) setWarehouseCatalogCache(merged);
      return merged;
    });
  }, []);

  const refresh = useCallback(async ({ force = false, background = false } = {}) => {
    const hasData = Boolean(catalog || getWarehouseCatalogCache());
    if (!background || !hasData) {
      if (!hasData) setInitialLoading(true);
      else setRefreshing(true);
    }
    setError('');
    try {
      const data = await fetchWarehouseCatalogCached({ force });
      applyCatalog(data);
      return data;
    } catch (err) {
      if (!hasData) {
        setError(err?.message || 'Failed to load catalog');
      }
      throw err;
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [applyCatalog, catalog]);

  const ensureFresh = useCallback(() => {
    if (!isWarehouseCatalogStale()) return Promise.resolve(catalog || getWarehouseCatalogCache());
    return refresh({ background: true }).catch(() => null);
  }, [catalog, refresh]);

  useEffect(() => {
    if (getWarehouseCatalogCache()) return;
    refresh({ background: false }).catch(() => {});
    // Warm catalog once after login; refresh identity is stable enough for bootstrap only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({
    catalog,
    initialLoading,
    refreshing,
    error,
    refresh,
    ensureFresh,
    applyCatalog,
    patchCatalog,
    invalidate: invalidateWarehouseCatalogCache,
  }), [
    catalog,
    initialLoading,
    refreshing,
    error,
    refresh,
    ensureFresh,
    applyCatalog,
    patchCatalog,
  ]);

  return (
    <WarehouseCatalogContext.Provider value={value}>
      {children}
    </WarehouseCatalogContext.Provider>
  );
}

export function useWarehouseCatalog() {
  const ctx = useContext(WarehouseCatalogContext);
  if (!ctx) {
    throw new Error('useWarehouseCatalog must be used within WarehouseCatalogProvider');
  }
  return ctx;
}
