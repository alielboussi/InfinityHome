import db from '../dataClient';
import {
  analyzeAssemblyPacketBom,
  assemblableUnits,
} from '../utils/warehouseAssemblyMath';
import { buildPacketsByAssembly } from '../utils/warehouseAssemblyPacketPool';
import { setWarehousePacketQuantity } from './warehouseCatalog';
import { resolvePacketFromScan } from '../utils/warehouseScanResolver';
import { sumInventoryQuantity, upsertInventoryQuantity } from '../utils/inventoryApi';
import { normalizeWarehouseSkuKey } from '../utils/warehouseAssemblyMath';

const ASSEMBLIES = 'warehouse_assemblies';
const PACKETS = 'warehouse_packets';
const INVENTORY = 'warehouse_packet_inventory';
const ASSEMBLY_LOCATIONS = 'warehouse_assembly_locations';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const ASSEMBLY_PACKETS = 'warehouse_assembly_packets';

async function loadPacketInventoryMap(locationId, packetIds) {
  const map = new Map();
  if (!locationId || !packetIds?.length) return map;
  const { data, error } = await db.from(INVENTORY).select('packet_id, quantity').eq('location_id', locationId);
  if (error) throw new Error(error.message || 'Failed to load packet stock');
  const idSet = new Set(packetIds.map(String));
  (data || []).forEach((row) => {
    if (!idSet.has(String(row.packet_id))) return;
    map.set(String(row.packet_id), Number(row.quantity) || 0);
  });
  packetIds.forEach((id) => {
    if (!map.has(String(id))) map.set(String(id), 0);
  });
  return map;
}

async function loadAssemblyPacketRows() {
  const { data, error } = await db.from(ASSEMBLY_PACKETS).select('*');
  if (error) throw new Error(error.message || 'Failed to load product packet links');
  return data || [];
}

async function packetsForAssembly(assemblyId, allPackets, assemblyPacketRows) {
  const byAssembly = buildPacketsByAssembly(assemblyPacketRows, allPackets);
  return byAssembly.get(String(assemblyId)) || [];
}

async function syncAssemblyInventoryFromPackets(
  assemblyId,
  locationId,
  packets,
  packetCount,
  assemblyPacketRows,
  catalogPackets,
) {
  const ids = (packets || []).map((p) => p.id);
  const invMap = await loadPacketInventoryMap(locationId, ids);
  const poolOpts = {
    assemblyId,
    assemblyPacketRows,
    catalogPackets,
  };
  const complete = assemblableUnits(packets, invMap, packetCount, poolOpts);
  await db.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: assemblyId,
    location_id: locationId,
    quantity: complete,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'assembly_id,location_id' });
  return complete;
}

/** Finished units at a location = min(packet qty ÷ required) for linked BOM. */
export function completeUnitsAtLocation(
  packets,
  inventoryRows,
  locationId,
  packetCount,
  { assemblyId, assemblyPacketRows, catalogPackets } = {},
) {
  const map = new Map();
  (inventoryRows || []).forEach((row) => {
    if (String(row.location_id) !== String(locationId)) return;
    map.set(String(row.packet_id), Number(row.quantity) || 0);
  });
  return assemblableUnits(packets, map, packetCount, {
    assemblyId,
    assemblyPacketRows,
    catalogPackets,
  });
}

/**
 * Move complete sets from one location to another by moving each required packet qty.
 * Finished product qty at destination is derived from packet stock there (min of packets).
 */
export async function transferWarehouseAssemblyUnits({
  assemblyId,
  fromLocationId,
  toLocationId,
  units,
  movePacketsToDestination = true,
}) {
  const n = Math.floor(Number(units));
  if (!Number.isFinite(n) || n < 1) throw new Error('Enter how many complete products to transfer.');

  const { data: assembly, error: aErr } = await db
    .from(ASSEMBLIES)
    .select('id, name, packet_count')
    .eq('id', assemblyId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message || 'Failed to load product');
  if (!assembly) throw new Error('Product not found');

  const { data: locLinks, error: lErr } = await db
    .from(ASSEMBLY_LOCATIONS)
    .select('location_id')
    .eq('assembly_id', assemblyId);
  if (lErr) throw new Error(lErr.message || 'Failed to load product locations');
  const allowed = new Set((locLinks || []).map((r) => String(r.location_id)));
  if (!allowed.has(String(toLocationId))) {
    throw new Error('Target location is not enabled on this product.');
  }

  const { data: allPackets, error: allPErr } = await db
    .from(PACKETS)
    .select('id, sku, name, packet_number, qty_per_unit, assembly_id');
  if (allPErr) throw new Error(allPErr.message || 'Failed to load packets');
  const assemblyPacketRows = await loadAssemblyPacketRows();
  const packets = await packetsForAssembly(assemblyId, allPackets, assemblyPacketRows);

  const bom = analyzeAssemblyPacketBom(assembly.packet_count, packets);
  if (!bom.isComplete) {
    throw new Error(
      `Cartons per unit must total ${assembly.packet_count} (sum of qty per product on each linked packet). Currently ${bom.cartonsPerUnit}.`,
    );
  }

  const packetIds = (packets || []).map((p) => p.id);
  const fromMap = await loadPacketInventoryMap(fromLocationId, packetIds);
  const poolOpts = { assemblyId, assemblyPacketRows, catalogPackets: allPackets };
  const available = assemblableUnits(packets, fromMap, assembly.packet_count, poolOpts);
  if (available < n) {
    throw new Error(`Only ${available} complete unit(s) available to move from source.`);
  }

  const toMap = movePacketsToDestination
    ? await loadPacketInventoryMap(toLocationId, packetIds)
    : new Map();

  const packetsDeducted = [];
  for (const packet of packets || []) {
    const perUnit = Math.max(1, Number(packet.qty_per_unit) || 1);
    const moveQty = n * perUnit;
    const fromQty = fromMap.get(String(packet.id)) ?? 0;
    if (fromQty < moveQty) {
      throw new Error(
        `Not enough ${packet.sku || 'packet'} at source (on hand ${fromQty}, need ${moveQty}).`,
      );
    }
    await setWarehousePacketQuantity(packet.id, fromLocationId, fromQty - moveQty);
    if (movePacketsToDestination) {
      const toQty = toMap.get(String(packet.id)) ?? 0;
      await setWarehousePacketQuantity(packet.id, toLocationId, toQty + moveQty);
    }
    packetsDeducted.push({
      packet_id: packet.id,
      sku: packet.sku,
      quantity: moveQty,
    });
  }

  await syncAssemblyInventoryFromPackets(
    assemblyId,
    fromLocationId,
    packets,
    assembly.packet_count,
    assemblyPacketRows,
    allPackets,
  );
  let atDest = null;
  if (movePacketsToDestination) {
    atDest = await syncAssemblyInventoryFromPackets(
      assemblyId,
      toLocationId,
      packets,
      assembly.packet_count,
      assemblyPacketRows,
      allPackets,
    );
  }

  return { ok: true, units: n, completeAtDestination: atDest, packetsDeducted };
}

function requireNonEmptyTransferField(value, label) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

async function recordCatalogBridgeTransferSession({
  fromLocationId,
  toLocationId,
  catalogProductId,
  units,
  deliveryNoteNumber,
  reference,
  assemblyId,
  assemblyName,
  packetsDeducted,
  user,
}) {
  const capturedAt = new Date();
  const { data: session, error: sessionErr } = await db
    .from('stock_transfer_sessions')
    .insert({
      from_location: fromLocationId,
      to_location: toLocationId,
      user_uid: user?.id || null,
      transfer_date: capturedAt.toISOString().slice(0, 10),
      created_at: capturedAt.toISOString(),
      transfer_datetime: capturedAt.toISOString(),
      delivery_number: deliveryNoteNumber,
      status: 'approved',
      total_qty: units,
      notes: reference,
      metadata: {
        flow: 'warehouse-catalog-bridge',
        reference,
        delivery_note_number: deliveryNoteNumber,
        warehouse_assembly_id: assemblyId,
        warehouse_assembly_name: assemblyName || '',
        created_by_email: user?.email || null,
        packets_deducted: packetsDeducted || [],
      },
    })
    .select()
    .single();
  if (sessionErr) throw new Error(sessionErr.message || 'Failed to record transfer session');

  const { error: entriesErr } = await db.from('stock_transfer_entries').insert([{
    session_id: session.id,
    product_id: catalogProductId,
    quantity: units,
  }]);
  if (entriesErr) throw new Error(entriesErr.message || 'Failed to record transfer lines');

  return session;
}

async function ensureCatalogProductAtLocation(productId, locationId) {
  const pid = String(productId || '');
  const loc = String(locationId || '');
  if (!pid || !loc) return;
  const { data, error } = await db
    .from('product_locations')
    .select('product_id')
    .eq('product_id', pid)
    .eq('location_id', loc)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to check product locations');
  if (data) return;
  const { error: insErr } = await db.from('product_locations').upsert({
    product_id: pid,
    location_id: loc,
  }, { onConflict: 'product_id,location_id' });
  if (insErr) throw new Error(insErr.message || 'Failed to link product to location');
}

async function creditCatalogProductInventory(productId, locationId, deltaUnits) {
  const delta = Math.floor(Number(deltaUnits));
  if (!Number.isFinite(delta) || delta < 1) {
    throw new Error('Enter how many units to add to the catalog product.');
  }
  const pid = String(productId || '');
  const loc = String(locationId || '');
  if (!pid || !loc) throw new Error('Catalog product and location are required.');

  await ensureCatalogProductAtLocation(pid, loc);

  const { data: rows, error } = await db
    .from('inventory')
    .select('*')
    .eq('product_id', pid)
    .eq('location', loc);
  if (error) throw new Error(error.message || 'Failed to read catalog inventory');

  const current = sumInventoryQuantity(rows || [], pid, loc);
  await upsertInventoryQuantity({
    productId: pid,
    locationId: loc,
    quantity: current + delta,
  }, db);

  return { previousQty: current, newQty: current + delta };
}

/**
 * Warehouse packet transfer + credit a legacy /products-list product at the destination.
 * Temporary bridge until warehouse catalog fully replaces products-list.
 */
export async function transferWarehouseAssemblyToCatalogProduct({
  assemblyId,
  fromLocationId,
  toLocationId,
  units,
  catalogProductId,
  deliveryNoteNumber,
  reference,
  user,
}) {
  if (!catalogProductId) {
    throw new Error('Select which Products List item receives this stock.');
  }
  const deliveryNote = requireNonEmptyTransferField(deliveryNoteNumber, 'Delivery note #');
  const transferReference = requireNonEmptyTransferField(reference, 'Reference');

  const { data: assembly } = await db
    .from(ASSEMBLIES)
    .select('id, name')
    .eq('id', assemblyId)
    .maybeSingle();

  const transfer = await transferWarehouseAssemblyUnits({
    assemblyId,
    fromLocationId,
    toLocationId,
    units,
    movePacketsToDestination: false,
  });
  const inventory = await creditCatalogProductInventory(catalogProductId, toLocationId, transfer.units);
  const session = await recordCatalogBridgeTransferSession({
    fromLocationId,
    toLocationId,
    catalogProductId,
    units: transfer.units,
    deliveryNoteNumber: deliveryNote,
    reference: transferReference,
    assemblyId,
    assemblyName: assembly?.name,
    packetsDeducted: transfer.packetsDeducted,
    user,
  });
  return {
    ...transfer,
    catalogProductId,
    catalogInventory: inventory,
    deliveryNoteNumber: deliveryNote,
    reference: transferReference,
    sessionId: session?.id,
  };
}

/** Suggest catalog products whose SKU matches the warehouse assembly family SKU. */
export function matchCatalogProductsByAssemblySku(assembly, catalogProducts) {
  const key = normalizeWarehouseSkuKey(assembly?.family_sku);
  if (!key) return [];
  return (catalogProducts || []).filter(
    (p) => normalizeWarehouseSkuKey(p.sku) === key,
  );
}

/**
 * Move stock by packet SKU / scan lines (for truck load, handheld scanning).
 * Derives which finished products are affected from each packet's assembly_id.
 *
 * @param {object} params
 * @param {string} params.fromLocationId
 * @param {string} params.toLocationId
 * @param {Array<{ packetId?: string, scan?: string, quantity: number }>} params.lines
 */
export async function transferWarehousePacketLines({
  fromLocationId,
  toLocationId,
  lines,
}) {
  if (!fromLocationId || !toLocationId) {
    throw new Error('Source and destination locations are required.');
  }
  if (String(fromLocationId) === String(toLocationId)) {
    throw new Error('Source and destination must be different.');
  }
  if (!Array.isArray(lines) || !lines.length) {
    throw new Error('Add at least one packet line to transfer.');
  }

  const { data: allPackets, error: pErr } = await db.from(PACKETS).select(
    'id, sku, name, assembly_id, qty_per_unit, packet_number',
  );
  if (pErr) throw new Error(pErr.message || 'Failed to load packets');

  const merged = new Map();
  for (const line of lines) {
    let packet = null;
    if (line.packetId) {
      packet = (allPackets || []).find((p) => String(p.id) === String(line.packetId));
    }
    if (!packet && line.scan) {
      packet = resolvePacketFromScan(line.scan, allPackets || []);
    }
    if (!packet) {
      const hint = String(line.scan || line.packetId || '').slice(0, 48);
      throw new Error(`No warehouse packet matches: ${hint}`);
    }
    const qty = Math.floor(Number(line.quantity));
    if (!Number.isFinite(qty) || qty < 1) {
      throw new Error(`Invalid quantity for packet ${packet.sku}`);
    }
    const key = String(packet.id);
    const prev = merged.get(key);
    merged.set(key, {
      packet,
      quantity: (prev?.quantity || 0) + qty,
    });
  }

  const assemblyPacketRows = await loadAssemblyPacketRows();
  const assemblyIds = new Set();
  const movedPackets = [];

  for (const { packet, quantity } of merged.values()) {
    const packetIds = [packet.id];
    const fromMap = await loadPacketInventoryMap(fromLocationId, packetIds);
    const toMap = await loadPacketInventoryMap(toLocationId, packetIds);
    const fromQty = fromMap.get(String(packet.id)) ?? 0;
    if (fromQty < quantity) {
      throw new Error(
        `Not enough ${packet.sku} at source (on hand ${fromQty}, requested ${quantity}).`,
      );
    }
    const toQty = toMap.get(String(packet.id)) ?? 0;
    await setWarehousePacketQuantity(packet.id, fromLocationId, fromQty - quantity);
    await setWarehousePacketQuantity(packet.id, toLocationId, toQty + quantity);

    const linkedAssemblyIds = assemblyPacketRows
      .filter((r) => String(r.packet_id) === String(packet.id))
      .map((r) => String(r.assembly_id));
    if (!linkedAssemblyIds.length && packet.assembly_id) {
      linkedAssemblyIds.push(String(packet.assembly_id));
    }
    linkedAssemblyIds.forEach((aid) => assemblyIds.add(aid));

    movedPackets.push({
      packet_id: packet.id,
      sku: packet.sku,
      name: packet.name,
      quantity,
      assembly_ids: linkedAssemblyIds,
    });
  }

  const products = [];
  for (const assemblyId of assemblyIds) {
    const { data: assembly, error: aErr } = await db
      .from(ASSEMBLIES)
      .select('id, name, family_sku, packet_count')
      .eq('id', assemblyId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message || 'Failed to load product');

    const assemblyPackets = await packetsForAssembly(assemblyId, allPackets, assemblyPacketRows);

    const atSource = await syncAssemblyInventoryFromPackets(
      assemblyId,
      fromLocationId,
      assemblyPackets,
      assembly?.packet_count,
      assemblyPacketRows,
      allPackets,
    );
    const atDestination = await syncAssemblyInventoryFromPackets(
      assemblyId,
      toLocationId,
      assemblyPackets,
      assembly?.packet_count,
      assemblyPacketRows,
      allPackets,
    );

    const movedForProduct = movedPackets.filter(
      (row) => (row.assembly_ids || []).some((aid) => String(aid) === String(assemblyId)),
    );

    products.push({
      assembly_id: assemblyId,
      name: assembly?.name || '',
      family_sku: assembly?.family_sku || '',
      complete_units_at_source: atSource,
      complete_units_at_destination: atDestination,
      packets_moved: movedForProduct,
    });
  }

  const orphanMoved = movedPackets.filter((row) => !(row.assembly_ids || []).length);

  return {
    ok: true,
    moved_packets: movedPackets,
    products,
    unassigned_packets: orphanMoved,
  };
}
