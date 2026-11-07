import { useQuery } from '@tanstack/react-query';
import { fetchWarehouseCatalog } from '../services/warehouseCatalog';
import { cacheGet } from '../utils/staleCache';

export const WAREHOUSE_CATALOG_QUERY_KEY = ['warehouse', 'catalog', 'v2'];
const WAREHOUSE_CATALOG_CACHE_KEY = 'warehouse:catalog:v2';

export function useWarehouseCatalogQuery(options = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: WAREHOUSE_CATALOG_QUERY_KEY,
    queryFn: () => fetchWarehouseCatalog(),
    staleTime: 90_000,
    placeholderData: () => cacheGet(WAREHOUSE_CATALOG_CACHE_KEY) || undefined,
    enabled,
  });
}
