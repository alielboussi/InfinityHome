import { applyInventoryDeduction } from '../lib/inventoryDeduction.js';
import { applyFirestoreInventoryDeduction } from '../lib/firestoreInventoryDeduction.js';
import { getDataClient } from '../lib/getDataClient.js';
import { getFirestore } from '../lib/firestoreDb.js';
import {
  applyExpectedQtyToInventoryRows,
  computeExpectedInventoryMap,
  fetchActiveStockPeriod,
} from '../../src/utils/computedInventoryQty.js';

const chunkArray = (list, size) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
};

const fetchAllInventoryRows = async ({ db, locationList }) => {
  const pageSize = 1000;
  let offset = 0;
  let allRows = [];

  while (true) {
    let query = db
      .from('inventory')
      .select('id, product_id, location, quantity, updated_at')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (locationList.length === 1) query = query.eq('location', locationList[0]);
    if (locationList.length > 1) query = query.in('location', locationList);

    const { data, error } = await query;
    if (error) return { data: null, error };

    const rows = data || [];
    allRows = allRows.concat(rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return { data: allRows, error: null };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_RE.test(String(value || '').trim());

const OPEN_STATUSES = ['open', 'open_locked'];

const mergeOpeningStockSnapshot = async ({ db, inventoryRows, locationList }) => {
  let periodQuery = db
    .from('stock_periods')
    .select('id, location_id, status, opened_at, updated_at')
    .in('status', OPEN_STATUSES)
    .order('opened_at', { ascending: false });
  if (locationList.length === 1) periodQuery = periodQuery.eq('location_id', locationList[0]);
  if (locationList.length > 1) periodQuery = periodQuery.in('location_id', locationList);

  const { data: periodRows, error: periodErr } = await periodQuery;
  if (periodErr) return inventoryRows || [];

  const latestByLocation = new Map();
  (periodRows || []).forEach((row) => {
    const key = String(row.location_id || '');
    if (!key || latestByLocation.has(key)) return;
    latestByLocation.set(key, row);
  });
  const sessionIds = Array.from(latestByLocation.values()).map(row => row.id).filter(Boolean);
  if (!sessionIds.length) return inventoryRows || [];

  const { data: openingRows, error: openingErr } = await db
    .from('opening_stock_entries')
    .select('session_id, product_id, qty')
    .in('session_id', sessionIds);
  if (openingErr) return inventoryRows || [];

  const locationBySession = new Map();
  latestByLocation.forEach((row) => {
    locationBySession.set(String(row.id), String(row.location_id));
  });

  const merged = [...(inventoryRows || [])];
  const inventoryIndexByKey = new Map();
  merged.forEach((row, idx) => {
    inventoryIndexByKey.set(`${row.product_id}::${row.location}`, idx);
  });

  (openingRows || []).forEach((row) => {
    const locationId = locationBySession.get(String(row.session_id)) || null;
    if (!row.product_id || !locationId) return;
    const key = `${row.product_id}::${locationId}`;
    const existingIndex = inventoryIndexByKey.get(key);
    const openingQty = Number(row.qty || 0);
    if (existingIndex === undefined) {
      inventoryIndexByKey.set(key, merged.length);
      const period = latestByLocation.get(String(locationId));
      merged.push({
        id: `opening-${row.session_id}-${row.product_id}`,
        product_id: row.product_id,
        location: locationId,
        quantity: openingQty,
        updated_at: period?.updated_at || period?.opened_at || null,
      });
    }
    // Never replace live inventory qty with opening_stock_entries — opening is variance baseline only.
  });

  return merged;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const routeAction = String(req.query?.action || req.query?.a || '').trim().toLowerCase();
    const body = req.body || {};
    const bodyAction = String(body.action || '').trim().toLowerCase();
    const action = routeAction || bodyAction;
    const { inserts, updates, locations } = body;
    const nowIso = new Date().toISOString();
    const locationList = Array.isArray(locations) ? locations.filter(Boolean).map(v => String(v)) : (locations ? [String(locations)] : []);

    const shouldSnapshot = action === 'snapshot';

    if (action === 'sale-deduction') {
      const { items, locationId, saleId, receiptNumber, userUid, userId } = body;
      if (!locationId || !Array.isArray(items) || !items.length) {
        res.status(400).json({ ok: false, error: 'items and locationId are required' });
        return;
      }
      const adjustedProducts = await applyFirestoreInventoryDeduction(getFirestore(), {
        items,
        locationId: String(locationId),
        saleId: saleId ?? null,
        receiptNumber: receiptNumber || null,
        userUid: userUid || null,
        userId: userId ?? null,
      });
      res.status(200).json({ ok: true, adjustedProducts });
      return;
    }

    if (shouldSnapshot) {
      const db = getDataClient();
      const { data, error } = await fetchAllInventoryRows({ db: db, locationList });
      if (error) {
        res.status(500).json({ ok: false, error: error.message || String(error) });
        return;
      }
      const merged = await mergeOpeningStockSnapshot({
        db: db,
        inventoryRows: data || [],
        locationList,
      });
      let computed = merged || [];
      const targets = locationList.length
        ? locationList
        : [...new Set(computed.map((row) => String(row?.location || '')).filter(Boolean))];
      for (const locationId of targets) {
        const period = await fetchActiveStockPeriod(db, locationId);
        if (!period?.id) continue;
        const expectedMap = await computeExpectedInventoryMap(db, locationId);
        computed = applyExpectedQtyToInventoryRows(computed, locationId, expectedMap);
      }
      res.status(200).json({ ok: true, data: computed || [] });
      return;
    }

    if (action === 'opening-stock-entry' || action === 'opening') {
      const { sessionId, productId, qty } = body;
      const entryAction = bodyAction;
      if (!entryAction || !sessionId || !productId) {
        res.status(400).json({ ok: false, error: 'Missing fields' });
        return;
      }

      const db = getDataClient();
      if (entryAction === 'delete') {
        const { error } = await db
          .from('opening_stock_entries')
          .delete()
          .eq('session_id', sessionId)
          .eq('product_id', productId);
        if (error) {
          res.status(500).json({ ok: false, error: error.message || String(error) });
          return;
        }
        res.status(200).json({ ok: true });
        return;
      }

      if (entryAction === 'upsert') {
        if (qty === undefined || qty === null || Number.isNaN(Number(qty))) {
          res.status(400).json({ ok: false, error: 'Invalid qty' });
          return;
        }
        const { error } = await db
          .from('opening_stock_entries')
          .upsert([
            { session_id: sessionId, product_id: productId, qty: Number(qty) },
          ], { onConflict: 'session_id,product_id' });
        if (error) {
          res.status(500).json({ ok: false, error: error.message || String(error) });
          return;
        }
        const { data: row, error: readErr } = await db
          .from('opening_stock_entries')
          .select('qty')
          .eq('session_id', sessionId)
          .eq('product_id', productId)
          .maybeSingle();
        if (readErr) {
          res.status(200).json({ ok: true });
          return;
        }
        res.status(200).json({ ok: true, qty: row?.qty ?? null });
        return;
      }

      res.status(400).json({ ok: false, error: 'Unknown action' });
      return;
    }

    const rawInserts = Array.isArray(inserts) ? inserts : [];
    const invalidLocations = rawInserts
      .filter(row => row?.location !== undefined && row?.location !== null && !isUuid(row.location))
      .map(row => ({ product_id: row?.product_id || null, location: row?.location }));
    if (invalidLocations.length > 0) {
      res.status(400).json({
        ok: false,
        error: 'Invalid inventory location id',
        details: { invalidLocations }
      });
      return;
    }

    const cleanInserts = rawInserts
      .filter(row => row?.product_id && row?.location)
      .map(row => ({
        product_id: row.product_id,
        location: row.location,
        quantity: Number(row.quantity ?? 0),
        updated_at: row.updated_at || nowIso,
      }));

    const cleanUpdates = (Array.isArray(updates) ? updates : [])
      .filter(row => row?.id)
      .map(row => ({
        id: row.id,
        quantity: Number(row.quantity ?? 0),
        updated_at: row.updated_at || nowIso,
      }));

    if (cleanInserts.length === 0 && cleanUpdates.length === 0) {
      if (shouldSnapshot || locationList.length > 0) {
        const db = getDataClient();
        const { data, error } = await fetchAllInventoryRows({ db, locationList });
        if (error) {
          res.status(500).json({ ok: false, error: error.message || String(error) });
          return;
        }
        const merged = await mergeOpeningStockSnapshot({
          db,
          inventoryRows: data || [],
          locationList,
        });
        res.status(200).json({ ok: true, data: merged || [] });
        return;
      }
      res.status(400).json({ ok: false, error: 'No valid inventory rows supplied' });
      return;
    }

    const db = getDataClient();

    if (cleanInserts.length > 0) {
      const { error: insErr } = await db
        .from('inventory')
        .upsert(cleanInserts, { onConflict: 'product_id,location' });
      if (insErr) {
        res.status(500).json({ ok: false, error: insErr.message || String(insErr) });
        return;
      }
    }

    if (cleanUpdates.length > 0) {
      const chunks = chunkArray(cleanUpdates, 200);
      for (const chunk of chunks) {
        const results = await Promise.all(
          chunk.map(row => db
            .from('inventory')
            .update({ quantity: row.quantity, updated_at: row.updated_at })
            .eq('id', row.id))
        );
        const failed = results.find(res => res.error);
        if (failed?.error) {
          res.status(500).json({ ok: false, error: failed.error.message || String(failed.error) });
          return;
        }
      }
    }

    res.status(200).json({
      ok: true,
      inserted: cleanInserts.length,
      updated: cleanUpdates.length,
    });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({ ok: false, error: err.message || 'Unexpected error', details: err.details || null });
  }
}
