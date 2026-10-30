import AsyncStorage from '@react-native-async-storage/async-storage';
import { warehouseMobileRequest } from './warehouseMobileApi';

const STALE_MS = 120_000;
const STORAGE_KEY = '@infinity_warehouse_catalog_v1';
const STORAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let cache = null;
let fetchedAt = 0;
let inflight = null;

function mergeCatalogResponses(prev, next, packetLoad) {
  if (!next) return prev;
  if (packetLoad === 'all' || !prev?.packets?.length) {
    return next;
  }
  const byId = new Map((prev.packets || []).map((p) => [String(p.id), p]));
  (next.packets || []).forEach((p) => byId.set(String(p.id), p));
  const packet_load = next?.catalog_meta?.packet_load === 'all'
    || prev?.catalog_meta?.packet_load === 'all'
    ? 'all'
    : 'linked';
  return {
    ...next,
    packets: [...byId.values()],
    catalog_meta: { ...(next.catalog_meta || {}), packet_load },
  };
}

function persistCatalogToDisk(data) {
  if (!data?.assemblies) return;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
    savedAt: Date.now(),
    data,
  })).catch(() => {});
}

export function getWarehouseCatalogCache() {
  return cache;
}

export function setWarehouseCatalogCache(next) {
  cache = next;
  fetchedAt = Date.now();
  persistCatalogToDisk(next);
  return cache;
}

export function invalidateWarehouseCatalogCache() {
  cache = null;
  fetchedAt = 0;
  inflight = null;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
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

export async function loadPersistedWarehouseCatalog() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data?.assemblies || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * @param {{ force?: boolean, fullPackets?: boolean }} opts
 * @returns {Promise<object>}
 */
export async function fetchWarehouseCatalogCached(opts = {}) {
  const force = opts.force === true;
  const fullPackets = opts.fullPackets === true;
  const packetLoad = fullPackets ? 'all' : 'linked';
  const now = Date.now();
  if (!force && cache && now - fetchedAt <= STALE_MS) {
    if (fullPackets && cache?.catalog_meta?.packet_load !== 'all') {
      /* fall through — need full packet list */
    } else {
      return cache;
    }
  }
  if (inflight) {
    return inflight;
  }
  inflight = warehouseMobileRequest('catalog-list', {
    packet_load: packetLoad,
    include_colors: fullPackets,
  })
    .then((data) => {
      const merged = mergeCatalogResponses(cache, data, packetLoad);
      cache = merged;
      fetchedAt = Date.now();
      persistCatalogToDisk(merged);
      inflight = null;
      return merged;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}
