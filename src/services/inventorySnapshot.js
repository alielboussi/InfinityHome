import { fromPublic } from '../dbSchema';
import { dedupeInventoryRows } from '../utils/inventoryApi';
import {
  applyExpectedQtyToInventoryRows,
  computeExpectedInventoryMap,
  fetchActiveStockPeriod,
} from '../utils/computedInventoryQty';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

const OPEN_STATUSES = ['open', 'open_locked'];

const getApiBase = () => {
  const base = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
  if (!base) return '';
  return base.replace(/\/+$/, '');
};

const isLocalHost = () => {
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return /^(localhost|127\.0\.0\.1)$/i.test(host);
  } catch {
    return false;
  }
};

const shouldUseApi = () => {
  const forceApi = String(process.env.REACT_APP_FORCE_API || '').trim() === '1';
  if (forceApi) return true;
  if (isLocalHost()) return false;
  const apiBase = getApiBase();
  if (apiBase) return true;
  return process.env.NODE_ENV === 'production';
};

const fetchAllInventoryRows = async (locationList) => {
  const pageSize = 1000;
  let offset = 0;
  let allRows = [];

  while (true) {
    let invQuery = fromPublic('inventory')
      .select('id, product_id, location, quantity, updated_at')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (locationList.length === 1) invQuery = invQuery.eq('location', locationList[0]);
    if (locationList.length > 1) invQuery = invQuery.in('location', locationList);

    const { data, error } = await invQuery;
    if (error) return { data: null, error };

    const rows = data || [];
    allRows = allRows.concat(rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return { data: allRows, error: null };
};

const fetchInventoryViaApi = async (locations) => {
  const apiBase = getApiBase();
  const url = isLocalHost()
    ? '/api/inventory-bulk'
    : (apiBase ? `${apiBase}/api/inventory-bulk` : '/api/inventory-bulk');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'snapshot', locations: Array.isArray(locations) ? locations : (locations ? [locations] : []) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || 'Failed to load inventory snapshot.');
  }
  return data?.data || [];
};

export async function fetchInventorySnapshot(locations = null) {
  const locationList = Array.isArray(locations)
    ? locations.filter(Boolean).map(v => String(v)).filter(isUuid)
    : (locations && isUuid(locations) ? [String(locations)] : []);

  let inventoryRows = [];
  let inventoryErr = null;
  let apiUsed = false;
  if (shouldUseApi()) {
    try {
      inventoryRows = await fetchInventoryViaApi(locationList);
      apiUsed = true;
    } catch (err) {
      inventoryErr = err;
    }
  }
  if (apiUsed && process.env.NODE_ENV !== 'production' && inventoryRows.length === 1000) {
    const { data: fallbackRows, error: fallbackErr } = await fetchAllInventoryRows(locationList);
    if (!fallbackErr && Array.isArray(fallbackRows) && fallbackRows.length >= inventoryRows.length) {
      inventoryRows = fallbackRows;
    }
  }
  if (!inventoryRows.length) {
    const { data, error } = await fetchAllInventoryRows(locationList);
    if (error) return { error: error || inventoryErr };
    inventoryRows = data || [];
  }

  const inventoryList = inventoryRows || [];
  if (inventoryList.length > 0) {
    let periodQuery = fromPublic('stock_periods')
      .select('id, location_id, status, opened_at, updated_at')
      .in('status', OPEN_STATUSES)
      .order('opened_at', { ascending: false });
    if (locationList.length === 1) periodQuery = periodQuery.eq('location_id', locationList[0]);
    if (locationList.length > 1) periodQuery = periodQuery.in('location_id', locationList);
    const { data: periodRows, error: periodErr } = await periodQuery;
    if (periodErr) return { data: dedupeInventoryRows(inventoryList), source: 'inventory' };

    const latestByLocation = new Map();
    (periodRows || []).forEach(row => {
      const key = String(row.location_id || '');
      if (!key || latestByLocation.has(key)) return;
      latestByLocation.set(key, row);
    });
    const sessionIds = Array.from(latestByLocation.values()).map(row => row.id).filter(Boolean);
    if (!sessionIds.length) {
      return { data: dedupeInventoryRows(inventoryList), source: 'inventory' };
    }

    const { data: openingRows, error: openingErr } = await fromPublic('opening_stock_entries')
      .select('session_id, product_id, qty')
      .in('session_id', sessionIds);
    if (openingErr) return { data: dedupeInventoryRows(inventoryList), source: 'inventory' };

    const locationBySession = new Map();
    latestByLocation.forEach(row => {
      locationBySession.set(String(row.id), String(row.location_id));
    });

    const inventoryIndexByKey = new Map();
    const merged = [...inventoryList];
    inventoryList.forEach((row, idx) => {
      inventoryIndexByKey.set(`${row.product_id}::${row.location}`, idx);
    });
    (openingRows || []).forEach(row => {
      const locationId = locationBySession.get(String(row.session_id)) || null;
      if (!row.product_id || !locationId) return;
      const key = `${row.product_id}::${locationId}`;
      const existingIndex = inventoryIndexByKey.get(key);
      if (existingIndex === undefined) {
        inventoryIndexByKey.set(key, merged.length);
        merged.push({
          id: `opening-${row.session_id}-${row.product_id}`,
          product_id: row.product_id,
          location: locationId,
          quantity: Number(row.qty || 0),
        });
      }
      // Never replace live inventory qty with opening_stock_entries — opening is variance baseline only.
    });

    return { data: dedupeInventoryRows(merged), source: 'inventory+opening_stock_entries' };
  }

  let periodQuery = fromPublic('stock_periods')
    .select('id, location_id, status, opened_at')
    .in('status', OPEN_STATUSES)
    .order('opened_at', { ascending: false });
  if (locationList.length === 1) periodQuery = periodQuery.eq('location_id', locationList[0]);
  if (locationList.length > 1) periodQuery = periodQuery.in('location_id', locationList);
  const { data: periodRows, error: periodErr } = await periodQuery;
  if (periodErr) return { data: [], source: 'none' };

  const latestByLocation = new Map();
  (periodRows || []).forEach(row => {
    const key = String(row.location_id || '');
    if (!key || latestByLocation.has(key)) return;
    latestByLocation.set(key, row);
  });
  const sessionIds = Array.from(latestByLocation.values()).map(row => row.id).filter(Boolean);
  if (!sessionIds.length) return { data: [], source: 'none' };

  const { data: openingRows, error: openingErr } = await fromPublic('opening_stock_entries')
    .select('session_id, product_id, qty')
    .in('session_id', sessionIds);
  if (openingErr) return { data: [], source: 'none' };

  const locationBySession = new Map();
  latestByLocation.forEach(row => {
    locationBySession.set(String(row.id), String(row.location_id));
  });

  const mapped = (openingRows || []).map((row) => ({
    id: `opening-${row.session_id}-${row.product_id}`,
    product_id: row.product_id,
    location: locationBySession.get(String(row.session_id)) || null,
    quantity: Number(row.qty || 0),
  }));

  return { data: mapped, source: 'opening_stock_entries' };
}

async function overlayComputedInventory(db, inventoryRows, locationList) {
  const targets = locationList.length
    ? locationList
    : [...new Set((inventoryRows || []).map((row) => String(row?.location || '')).filter(Boolean))];
  let merged = inventoryRows || [];
  for (const locationId of targets) {
    const period = await fetchActiveStockPeriod(db, locationId);
    if (!period?.id) continue;
    const expectedMap = await computeExpectedInventoryMap(db, locationId);
    merged = applyExpectedQtyToInventoryRows(merged, locationId, expectedMap);
  }
  return merged;
}

export async function fetchComputedInventorySnapshot(locations = null) {
  const snapshot = await fetchInventorySnapshot(locations);
  if (snapshot.error) return snapshot;
  const locationList = Array.isArray(locations)
    ? locations.filter(Boolean).map((v) => String(v)).filter(isUuid)
    : (locations && isUuid(locations) ? [String(locations)] : []);
  try {
    const data = await overlayComputedInventory(fromPublic, snapshot.data || [], locationList);
    return { ...snapshot, data: dedupeInventoryRows(data), source: 'computed_inventory' };
  } catch (err) {
    console.warn('[inventorySnapshot] computed overlay failed', err?.message || err);
    return snapshot;
  }
}
