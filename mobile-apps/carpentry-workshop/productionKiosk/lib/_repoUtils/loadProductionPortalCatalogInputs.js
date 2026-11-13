import db from '../dataClient';
import { cacheClear, cacheGet, cacheSet } from './staleCache.js';

const PORTAL_SNAPSHOT_CACHE_KEY = 'warehouse:productionPortalSnapshot:v1';
const PORTAL_SNAPSHOT_TTL_MS = 2 * 60 * 1000;

let inFlightSnapshot = null;

export function invalidateProductionPortalSnapshotCache() {
  inFlightSnapshot = null;
  cacheClear(PORTAL_SNAPSHOT_CACHE_KEY);
}

export function getCachedProductionPortalSnapshot() {
  return cacheGet(PORTAL_SNAPSHOT_CACHE_KEY);
}

/**
 * Shared reads for /carpentry, /upholstery, and /warehouse-floor-2 (Floor 1+2 products, storeroom materials, categories).
 * Deduplicates concurrent calls on the client.
 */
export async function loadProductionPortalCatalogInputs(customDb = db) {
  const [
    { data: inventory, error: invErr },
    { data: locations, error: locErr },
    { data: assemblyPackets, error: apErr },
    { data: packets, error: pktErr },
    { data: categories, error: catErr },
  ] = await Promise.all([
    customDb.from('warehouse_assembly_inventory').select('assembly_id, location_id, quantity'),
    customDb.from('locations').select('id, name'),
    customDb.from('warehouse_assembly_packets').select('assembly_id, packet_id, quantity_per_unit'),
    customDb.from('warehouse_packets').select('id'),
    customDb.from('categories').select('id, name').order('name'),
  ]);
  if (invErr) throw new Error(invErr.message || 'Failed to load warehouse assembly inventory');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  if (apErr) throw new Error(apErr.message || 'Failed to load assembly packet links');
  if (pktErr) throw new Error(pktErr.message || 'Failed to load warehouse packets');
  if (catErr) throw new Error(catErr.message || 'Failed to load categories');
  return {
    inventory: inventory || [],
    locations: locations || [],
    assemblyPackets: assemblyPackets || [],
    packets: packets || [],
    categories: categories || [],
  };
}

/**
 * Loads assemblies + setItems + portalInputs in a single parallel batch, with in-flight deduplication
 * and staleCache persistence so Carpentry, Upholstery, and Floor 2 load immediately.
 */
export async function fetchSharedProductionPortalSnapshot({ forceFresh = false } = {}) {
  if (!forceFresh) {
    const cached = getCachedProductionPortalSnapshot();
    if (cached && Array.isArray(cached.assemblies)) {
      return cached;
    }
  }
  if (inFlightSnapshot) {
    return inFlightSnapshot;
  }

  inFlightSnapshot = (async () => {
    const [
      { data: assemblies, error: asmErr },
      { data: setItems, error: setItemsErr },
      portalInputs,
    ] = await Promise.all([
      db.from('warehouse_assemblies').select('id, name, family_sku, item_kind, category_id, metadata, dim_length, dim_width, dim_height'),
      db.from('warehouse_set_items').select('set_assembly_id, component_assembly_id, quantity, location_id'),
      loadProductionPortalCatalogInputs(db),
    ]);
    if (asmErr) throw new Error(asmErr.message || 'Failed to load warehouse catalog');
    if (setItemsErr) throw new Error(setItemsErr.message || 'Failed to load warehouse set lines');
    const snapshot = {
      assemblies: assemblies || [],
      setItems: setItems || [],
      portalInputs,
    };
    cacheSet(PORTAL_SNAPSHOT_CACHE_KEY, snapshot, PORTAL_SNAPSHOT_TTL_MS);
    return snapshot;
  })().finally(() => {
    inFlightSnapshot = null;
  });

  return inFlightSnapshot;
}
