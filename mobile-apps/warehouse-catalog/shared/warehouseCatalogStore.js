import { warehouseMobileRequest } from './warehouseMobileApi';

const STALE_MS = 60_000;

let cache = null;
let fetchedAt = 0;
let inflight = null;

export function getWarehouseCatalogCache() {
  return cache;
}

export function setWarehouseCatalogCache(next) {
  cache = next;
  fetchedAt = Date.now();
  return cache;
}

export function invalidateWarehouseCatalogCache() {
  cache = null;
  fetchedAt = 0;
  inflight = null;
}

export function isWarehouseCatalogStale() {
  if (!cache) return true;
  return Date.now() - fetchedAt > STALE_MS;
}

/** Merge qty maps (and optional full catalog) after packet/product qty API calls. */
export function mergeWarehouseCatalogPatch(catalog, patch) {
  if (!catalog || !patch) return catalog;
  return {
    ...catalog,
    warehouseLocationId: patch.warehouseLocationId ?? catalog.warehouseLocationId,
    assemblyWarehouseQty: {
      ...(catalog.assemblyWarehouseQty || {}),
      ...(patch.assemblyWarehouseQty || {}),
    },
    packetWarehouseQty: {
      ...(catalog.packetWarehouseQty || {}),
      ...(patch.packetWarehouseQty || {}),
    },
  };
}

/**
 * @param {{ force?: boolean }} opts
 * @returns {Promise<object>}
 */
export async function fetchWarehouseCatalogCached(opts = {}) {
  const force = opts.force === true;
  const now = Date.now();
  if (!force && cache && now - fetchedAt <= STALE_MS) {
    return cache;
  }
  if (inflight) {
    return inflight;
  }
  inflight = warehouseMobileRequest('catalog-list')
    .then((data) => {
      cache = data;
      fetchedAt = Date.now();
      inflight = null;
      return data;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}
