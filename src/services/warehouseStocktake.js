import db from '../dataClient';
import { resolveWarehouseLocation, showroomLocations } from './warehouseCatalog';
import { normalizeWarehouseSkuKey } from '../utils/warehouseAssemblyMath';
import { normalizeWarehouseScan } from '../utils/warehouseScanResolver';

const PACKETS = 'warehouse_packets';
const ASSEMBLIES = 'warehouse_assemblies';
const ASSEMBLY_LOCATIONS = 'warehouse_assembly_locations';
const PACKET_INVENTORY = 'warehouse_packet_inventory';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const ST_COUNTS_PACKET = 'stocktake_warehouse_counts';
const ST_COUNTS_ASSEMBLY = 'stocktake_assembly_counts';

export function isWarehouseLocationId(locationId, warehouseLocationId) {
  if (!locationId || !warehouseLocationId) return false;
  return String(locationId) === String(warehouseLocationId);
}

async function loadAllPackets() {
  const { data, error } = await db.from(PACKETS).select('*');
  if (error) throw error;
  return data || [];
}

async function loadAssemblyIdsForLocation(locationId) {
  const { data, error } = await db
    .from(ASSEMBLY_LOCATIONS)
    .select('assembly_id')
    .eq('location_id', locationId);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.assembly_id).filter(Boolean))];
}

function matchesTerm(row, fields, term) {
  const q = String(term || '').trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => String(row[field] || '').toLowerCase().includes(q));
}

/** Catalog rows for stocktake search at a location. */
export async function fetchWarehouseStocktakeCatalog(locationId, q = '') {
  const { data: locations, error: locErr } = await db.from('locations').select('id, name');
  if (locErr) throw locErr;
  const warehouse = resolveWarehouseLocation(locations);
  const warehouseId = warehouse?.id;

  if (isWarehouseLocationId(locationId, warehouseId)) {
    const packets = await loadAllPackets();
    const filtered = packets
      .filter((p) => matchesTerm(p, ['name', 'sku'], q))
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        type: 'warehouse_packet',
        packet_number: p.packet_number,
      }));
    return { warehouseMode: true, products: filtered, sets: [] };
  }

  const assemblyIds = await loadAssemblyIdsForLocation(locationId);
  if (!assemblyIds.length) {
    return { warehouseMode: false, products: [], sets: [] };
  }

  const { data: assemblies, error: aErr } = await db
    .from(ASSEMBLIES)
    .select('id, name, family_sku, category_id')
    .in('id', assemblyIds);
  if (aErr) throw aErr;

  const products = (assemblies || [])
    .filter((a) => matchesTerm({ ...a, sku: a.family_sku }, ['name', 'family_sku'], q))
    .map((a) => ({
      id: a.id,
      name: a.name,
      sku: a.family_sku,
      type: 'warehouse_product',
    }));

  return { warehouseMode: false, products, sets: [] };
}

async function assertCountingOpen(eventId) {
  const { data: event } = await db.from('stocktake_events').select('status, counting_enabled').eq('id', eventId).maybeSingle();
  if (!event || event.status !== 'counting') throw new Error('Counting session is not open.');
  if (!event.counting_enabled) throw new Error('Counting is paused for this session.');
}

export async function addWarehousePacketCount(eventId, packetId, qty, userEmail) {
  const add = Number(qty);
  if (!Number.isFinite(add) || add <= 0) throw new Error('qty must be > 0');
  if (!userEmail) throw new Error('userEmail required');
  await assertCountingOpen(eventId);

  const { data: existing } = await db
    .from(ST_COUNTS_PACKET)
    .select('id, qty')
    .eq('event_id', eventId)
    .eq('packet_id', packetId)
    .eq('user_email', userEmail)
    .maybeSingle();

  const nextQty = Number(existing?.qty || 0) + add;
  const { error } = await db.from(ST_COUNTS_PACKET).upsert([{
    event_id: eventId,
    packet_id: packetId,
    user_email: userEmail,
    qty: nextQty,
    updated_at: new Date().toISOString(),
  }], { onConflict: 'event_id,packet_id,user_email' });
  if (error) throw error;
  return { ok: true, qty: nextQty };
}

export async function addWarehouseProductCount(eventId, assemblyId, qty, userEmail) {
  const add = Number(qty);
  if (!Number.isFinite(add) || add <= 0) throw new Error('qty must be > 0');
  if (!userEmail) throw new Error('userEmail required');
  await assertCountingOpen(eventId);

  const { data: existing } = await db
    .from(ST_COUNTS_ASSEMBLY)
    .select('id, qty')
    .eq('event_id', eventId)
    .eq('assembly_id', assemblyId)
    .eq('user_email', userEmail)
    .maybeSingle();

  const nextQty = Number(existing?.qty || 0) + add;
  const { error } = await db.from(ST_COUNTS_ASSEMBLY).upsert([{
    event_id: eventId,
    assembly_id: assemblyId,
    user_email: userEmail,
    qty: nextQty,
    updated_at: new Date().toISOString(),
  }], { onConflict: 'event_id,assembly_id,user_email' });
  if (error) throw error;
  return { ok: true, qty: nextQty };
}

export async function fetchMyWarehouseCounts(eventId, userEmail) {
  const [{ data: packetRows, error: pErr }, { data: assemblyRows, error: aErr }] = await Promise.all([
    db.from(ST_COUNTS_PACKET)
      .select('packet_id, qty, updated_at')
      .eq('event_id', eventId)
      .eq('user_email', userEmail)
      .order('updated_at', { ascending: false }),
    db.from(ST_COUNTS_ASSEMBLY)
      .select('assembly_id, qty, updated_at')
      .eq('event_id', eventId)
      .eq('user_email', userEmail)
      .order('updated_at', { ascending: false }),
  ]);
  if (pErr) throw pErr;
  if (aErr) throw aErr;

  const packetIds = (packetRows || []).map((r) => r.packet_id).filter(Boolean);
  const assemblyIds = (assemblyRows || []).map((r) => r.assembly_id).filter(Boolean);

  const [{ data: packets }, { data: assemblies }] = await Promise.all([
    packetIds.length
      ? db.from(PACKETS).select('id, name, sku').in('id', packetIds)
      : Promise.resolve({ data: [] }),
    assemblyIds.length
      ? db.from(ASSEMBLIES).select('id, name, family_sku').in('id', assemblyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const packetMap = new Map((packets || []).map((p) => [String(p.id), p]));
  const assemblyMap = new Map((assemblies || []).map((a) => [String(a.id), a]));

  const rows = [
    ...(packetRows || []).map((r) => {
      const p = packetMap.get(String(r.packet_id));
      return {
        line_id: r.packet_id,
        product_id: r.packet_id,
        qty: r.qty,
        updated_at: r.updated_at,
        name: p?.name || 'Packet',
        sku: p?.sku || '',
        type: 'warehouse_packet',
      };
    }),
    ...(assemblyRows || []).map((r) => {
      const a = assemblyMap.get(String(r.assembly_id));
      return {
        line_id: r.assembly_id,
        product_id: r.assembly_id,
        qty: r.qty,
        updated_at: r.updated_at,
        name: a?.name || 'Product',
        sku: a?.family_sku || '',
        type: 'warehouse_product',
      };
    }),
  ].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

  return { ok: true, rows };
}

export async function removeMyWarehousePacketCount(eventId, packetId, userEmail) {
  const { error } = await db.from(ST_COUNTS_PACKET).delete()
    .eq('event_id', eventId)
    .eq('packet_id', packetId)
    .eq('user_email', userEmail);
  if (error) throw error;
  return { ok: true };
}

export async function removeMyWarehouseProductCount(eventId, assemblyId, userEmail) {
  const { error } = await db.from(ST_COUNTS_ASSEMBLY).delete()
    .eq('event_id', eventId)
    .eq('assembly_id', assemblyId)
    .eq('user_email', userEmail);
  if (error) throw error;
  return { ok: true };
}

export async function clearMyWarehouseCounts(eventId, userEmail) {
  await db.from(ST_COUNTS_PACKET).delete().eq('event_id', eventId).eq('user_email', userEmail);
  await db.from(ST_COUNTS_ASSEMBLY).delete().eq('event_id', eventId).eq('user_email', userEmail);
  return { ok: true };
}

/** Apply summed stocktake counts to warehouse inventory (called on event submit). */
export async function applyWarehouseStocktakeSubmit(eventId, locationId, warehouseLocationId) {
  const now = new Date().toISOString();

  if (isWarehouseLocationId(locationId, warehouseLocationId)) {
    const { data: countRows, error } = await db
      .from(ST_COUNTS_PACKET)
      .select('packet_id, qty')
      .eq('event_id', eventId);
    if (error) throw error;

    const totals = new Map();
    (countRows || []).forEach((r) => {
      if (!r.packet_id) return;
      totals.set(String(r.packet_id), (totals.get(String(r.packet_id)) || 0) + Number(r.qty || 0));
    });

    const packets = await loadAllPackets();
    packets.forEach((p) => {
      if (!totals.has(String(p.id))) totals.set(String(p.id), 0);
    });

    for (const [packetId, quantity] of totals.entries()) {
      await db.from(PACKET_INVENTORY).upsert({
        packet_id: packetId,
        location_id: warehouseLocationId,
        quantity: Math.max(0, Number(quantity) || 0),
        updated_at: now,
      }, { onConflict: 'packet_id,location_id' });
    }
    return { ok: true, mode: 'packets', lines: totals.size };
  }

  const { data: countRows, error } = await db
    .from(ST_COUNTS_ASSEMBLY)
    .select('assembly_id, qty')
    .eq('event_id', eventId);
  if (error) throw error;

  const totals = new Map();
  (countRows || []).forEach((r) => {
    if (!r.assembly_id) return;
    totals.set(String(r.assembly_id), (totals.get(String(r.assembly_id)) || 0) + Number(r.qty || 0));
  });

  const assemblyIds = await loadAssemblyIdsForLocation(locationId);
  assemblyIds.forEach((id) => {
    if (!totals.has(String(id))) totals.set(String(id), 0);
  });

  for (const [assemblyId, quantity] of totals.entries()) {
    await db.from(ASSEMBLY_INVENTORY).upsert({
      assembly_id: assemblyId,
      location_id: locationId,
      quantity: Math.max(0, Number(quantity) || 0),
      updated_at: now,
    }, { onConflict: 'assembly_id,location_id' });
  }
  return { ok: true, mode: 'products', lines: totals.size };
}

export async function findPacketByScan(scan, packets) {
  const list = packets || await loadAllPackets();
  const rawKey = normalizeWarehouseSkuKey(scan);
  const normKey = normalizeWarehouseSkuKey(normalizeWarehouseScan(scan));
  const hit = list.find((p) => {
    const k = normalizeWarehouseSkuKey(p.sku);
    return k === rawKey || k === normKey;
  });
  return hit || null;
}

export { showroomLocations };
