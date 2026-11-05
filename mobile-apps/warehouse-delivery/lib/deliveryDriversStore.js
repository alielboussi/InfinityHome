import AsyncStorage from '@react-native-async-storage/async-storage';
import { sortDeliveryDriversByName } from '../deliveryKit/lib/sortDeliveryDrivers';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

const STALE_MS = 10 * 60 * 1000;
const STORAGE_KEY = '@infinity_delivery_drivers_v1';
const STORAGE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** @type {Array<{ id: string, name: string }> | null} */
let cache = null;
let fetchedAt = 0;
/** @type {Promise<Array<object>> | null} */
let inflight = null;
/** @type {Set<(drivers: Array<object>) => void>} */
const listeners = new Set();

function notify(list) {
  const sorted = sortDeliveryDriversByName(list);
  listeners.forEach((fn) => {
    try {
      fn(sorted);
    } catch {
      // ignore
    }
  });
  return sorted;
}

function persistDriversToDisk(drivers) {
  if (!Array.isArray(drivers)) return;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
    savedAt: Date.now(),
    drivers,
  })).catch(() => {});
}

export function getDeliveryDriversCacheSync() {
  return cache ? sortDeliveryDriversByName(cache) : null;
}

export function subscribeDeliveryDrivers(listener) {
  listeners.add(listener);
  if (cache?.length) listener(sortDeliveryDriversByName(cache));
  return () => listeners.delete(listener);
}

export function invalidateDeliveryDriversCache() {
  cache = null;
  fetchedAt = 0;
  inflight = null;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

export async function loadPersistedDeliveryDrivers() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.drivers) || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS) return null;
    return parsed.drivers;
  } catch {
    return null;
  }
}

/**
 * @param {{ force?: boolean }} opts
 * @returns {Promise<Array<object>>}
 */
export async function fetchDeliveryDriversCached(opts = {}) {
  const force = opts.force === true;
  const now = Date.now();
  if (!force && cache && now - fetchedAt <= STALE_MS) {
    return sortDeliveryDriversByName(cache);
  }
  if (inflight) return inflight;

  inflight = warehouseMobileRequest('delivery-drivers-list')
    .then((res) => {
      const drivers = Array.isArray(res?.drivers) ? res.drivers : [];
      cache = drivers;
      fetchedAt = Date.now();
      persistDriversToDisk(drivers);
      inflight = null;
      return notify(drivers);
    })
    .catch((err) => {
      inflight = null;
      if (cache?.length) return sortDeliveryDriversByName(cache);
      throw err;
    });

  return inflight;
}

/** Warm memory from disk, then refresh from API when stale. Safe to call often. */
export function prefetchDeliveryDrivers() {
  if (!cache) {
    loadPersistedDeliveryDrivers().then((persisted) => {
      if (!persisted?.length || cache) return;
      cache = persisted;
      fetchedAt = Date.now();
      notify(persisted);
    }).catch(() => {});
  }
  fetchDeliveryDriversCached().catch(() => {});
}
