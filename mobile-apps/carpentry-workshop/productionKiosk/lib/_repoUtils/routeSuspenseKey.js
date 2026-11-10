/**
 * Coarse Suspense remount key — keeps warehouse Floor 1 view tabs on one shell.
 * Navigation-only; does not change inventory or API payloads.
 */
export function routeSuspenseKey(pathname = '') {
  const p = String(pathname || '');
  if (p.startsWith('/warehouse-products') || p.startsWith('/warehouse-floors')) return '/warehouse-products';
  if (p.startsWith('/production-catalogs')) return '/production-catalogs';
  if (p.startsWith('/production-jobs')) return '/production-jobs';
  if (p.startsWith('/production-intake')) return '/production-intake';
  if (p.startsWith('/stocktake')) return '/stocktake';
  if (p.startsWith('/products-list')) return '/products-list';
  if (p.startsWith('/carpentry-warehouse')) return '/carpentry-warehouse';
  return p || '/';
}

export function warehouseCatalogViewFromPath(pathname = '', search = '') {
  const params = new URLSearchParams(search || '');
  const fromQuery = String(params.get('view') || '').trim().toLowerCase();
  if (fromQuery) return fromQuery;
  const p = String(pathname || '');
  if (p.includes('/sets')) return 'sets';
  if (p.includes('/incomplete')) return 'incomplete';
  if (p.includes('/uncategorized')) return 'uncategorized';
  if (p.includes('/sales-storage')) return 'sales-storage';
  return 'products';
}
