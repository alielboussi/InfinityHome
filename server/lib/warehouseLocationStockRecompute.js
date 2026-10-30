/**
 * Server-side warehouse stock recompute (mirrors src/services/warehouseTransfer.js).
 */
import { isWarehouseKitShowroomLocation } from '../../src/constants/warehouseShowroomLocations.js';
import {
  analyzeAssemblyPacketBom,
  assemblableUnits,
  assemblyDerivesWarehouseStockFromPackets,
} from '../../src/utils/warehouseAssemblyMath.js';
import { buildPacketsByAssembly } from '../../src/utils/warehouseAssemblyPacketPool.js';
import { expandWarehouseSetItemsRows } from '../../src/utils/warehouseSetItems.js';
import {
  assemblyUsesFinishedBoxReceiving,
  assemblyUnitsPerCarton,
  finishedUnitsFromBoxCount,
} from '../../src/utils/warehouseUnitsPerCarton.js';
import { assemblableSetUnits, isWarehouseSetAssembly } from '../../src/utils/warehouseSetMath.js';

const ASSEMBLIES = 'warehouse_assemblies';
const PACKETS = 'warehouse_packets';
const INVENTORY = 'warehouse_packet_inventory';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const ASSEMBLY_PACKETS = 'warehouse_assembly_packets';
const SET_ITEMS = 'warehouse_set_items';
const INVENTORY_IN_CHUNK = 30;

async function loadPacketInventoryMap(sb, locationId, packetIds) {
  const map = new Map();
  const ids = [...new Set((packetIds || []).map(String).filter(Boolean))];
  if (!locationId || !ids.length) return map;
  let rows = [];
  for (let i = 0; i < ids.length; i += INVENTORY_IN_CHUNK) {
    const chunk = ids.slice(i, i + INVENTORY_IN_CHUNK);
    const { data, error } = await sb.from(INVENTORY)
      .select('packet_id, quantity')
      .eq('location_id', locationId)
      .in('packet_id', chunk);
    if (error) throw new Error(error.message || 'Failed to load packet stock');
    rows = rows.concat(data || []);
  }
  const idSet = new Set(ids);
  rows.forEach((row) => {
    if (!idSet.has(String(row.packet_id))) return;
    map.set(String(row.packet_id), Number(row.quantity) || 0);
  });
  ids.forEach((id) => {
    if (!map.has(String(id))) map.set(String(id), 0);
  });
  return map;
}

async function loadAssemblyPacketRows(sb) {
  const { data, error } = await sb.from(ASSEMBLY_PACKETS).select('*');
  if (error) throw new Error(error.message || 'Failed to load product packet links');
  return data || [];
}

async function loadAssemblyPacketRowsForAssemblies(sb, assemblyIds) {
  const ids = [...new Set((assemblyIds || []).map(String).filter(Boolean))];
  if (!ids.length) return [];
  if (ids.length === 1) {
    const { data, error } = await sb.from(ASSEMBLY_PACKETS).select('*').eq('assembly_id', ids[0]);
    if (error) throw new Error(error.message || 'Failed to load product packet links');
    return data || [];
  }
  const merged = [];
  for (let i = 0; i < ids.length; i += INVENTORY_IN_CHUNK) {
    const chunk = ids.slice(i, i + INVENTORY_IN_CHUNK);
    const { data, error } = await sb.from(ASSEMBLY_PACKETS).select('*').in('assembly_id', chunk);
    if (error) throw new Error(error.message || 'Failed to load product packet links');
    merged.push(...(data || []));
  }
  return merged;
}

async function syncAssemblyInventoryFromPackets(
  sb,
  assemblyId,
  locationId,
  packets,
  packetCount,
  assemblyPacketRows,
  catalogPackets,
) {
  const ids = (packets || []).map((p) => p.id);
  const invMap = await loadPacketInventoryMap(sb, locationId, ids);
  const poolOpts = {
    assemblyId,
    assemblyPacketRows,
    catalogPackets,
  };
  const complete = assemblableUnits(packets, invMap, packetCount, poolOpts);
  await sb.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: assemblyId,
    location_id: locationId,
    quantity: complete,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'assembly_id,location_id' });
  return complete;
}

export async function recomputeWarehouseLocationStockServer(sb, locationId) {
  const locId = String(locationId || '');
  if (!locId) return;

  const [
    { data: assemblies, error: aErr },
    { data: allPackets, error: pErr },
    { data: assemblyInvRows, error: aiErr },
  ] = await Promise.all([
    sb.from(ASSEMBLIES).select('id, packet_count, inventory_mode, item_kind, units_per_carton'),
    sb.from(PACKETS).select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
    sb.from(ASSEMBLY_INVENTORY).select('assembly_id, location_id, quantity'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load warehouse products');
  if (pErr) throw new Error(pErr.message || 'Failed to load warehouse packets');
  if (aiErr) throw new Error(aiErr.message || 'Failed to load finished stock');

  const assemblyPacketRows = await loadAssemblyPacketRows(sb);
  const packetsByAssembly = buildPacketsByAssembly(assemblyPacketRows, allPackets);
  const productStockByAssembly = new Map();

  for (const assembly of assemblies || []) {
    if (isWarehouseSetAssembly(assembly)) continue;
    const pktList = packetsByAssembly.get(String(assembly.id)) || [];
    analyzeAssemblyPacketBom(assembly.packet_count, pktList);
    const usePacketMath = assemblyDerivesWarehouseStockFromPackets(assembly, pktList);
    if (usePacketMath) {
      const complete = await syncAssemblyInventoryFromPackets(
        sb,
        assembly.id,
        locId,
        pktList,
        assembly.packet_count,
        assemblyPacketRows,
        allPackets,
      );
      productStockByAssembly.set(String(assembly.id), complete);
      continue;
    }
    if (assemblyUsesFinishedBoxReceiving(assembly, pktList)) {
      const packet = pktList[0];
      const invMap = await loadPacketInventoryMap(sb, locId, [packet.id]);
      const boxes = invMap.get(String(packet.id)) ?? 0;
      const finished = finishedUnitsFromBoxCount(boxes, assemblyUnitsPerCarton(assembly));
      await sb.from(ASSEMBLY_INVENTORY).upsert({
        assembly_id: assembly.id,
        location_id: locId,
        quantity: finished,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'assembly_id,location_id' });
      productStockByAssembly.set(String(assembly.id), finished);
      continue;
    }
    const invRow = (assemblyInvRows || []).find(
      (r) => String(r.assembly_id) === String(assembly.id)
        && String(r.location_id) === locId,
    );
    productStockByAssembly.set(String(assembly.id), Number(invRow?.quantity) || 0);
  }

  if (!isWarehouseKitShowroomLocation(locId)) return;

  const { data: setItems, error: sErr } = await sb.from(SET_ITEMS).select('*');
  if (sErr) throw new Error(sErr.message || 'Failed to load set components');

  const expanded = expandWarehouseSetItemsRows(setItems || []);
  const now = new Date().toISOString();
  const setAssemblies = (assemblies || []).filter((a) => isWarehouseSetAssembly(a));

  for (const setAsm of setAssemblies) {
    const lines = expanded.filter(
      (row) => String(row.set_assembly_id) === String(setAsm.id)
        && String(row.location_id) === locId,
    );
    if (!lines.length) continue;
    const units = assemblableSetUnits(lines, (componentId) => (
      productStockByAssembly.get(String(componentId)) ?? 0
    ));
    const { error } = await sb.from(ASSEMBLY_INVENTORY).upsert({
      assembly_id: setAsm.id,
      location_id: locId,
      quantity: units,
      updated_at: now,
    }, { onConflict: 'assembly_id,location_id' });
    if (error) throw new Error(error.message || 'Failed to update set stock');
  }
}

/**
 * After one packet qty change — recompute only linked products (mobile fast path).
 * @returns {Record<string, number>} assemblyWarehouseQty by assembly id
 */
export async function recomputeWarehouseStockForPacketTouch(sb, packetId, locationId) {
  const pid = String(packetId || '');
  const locId = String(locationId || '');
  const assemblyWarehouseQty = {};
  if (!pid || !locId) return assemblyWarehouseQty;

  const { data: linksForPacket, error: linkErr } = await sb
    .from(ASSEMBLY_PACKETS)
    .select('*')
    .eq('packet_id', pid);
  if (linkErr) throw new Error(linkErr.message || 'Failed to load product packet links');

  const affectedIds = new Set();
  (linksForPacket || []).forEach((row) => {
    if (row?.assembly_id) affectedIds.add(String(row.assembly_id));
  });
  const { data: packetRow } = await sb
    .from(PACKETS)
    .select('assembly_id')
    .eq('id', pid)
    .maybeSingle();
  if (packetRow?.assembly_id) affectedIds.add(String(packetRow.assembly_id));
  if (!affectedIds.size) return assemblyWarehouseQty;

  const assemblyPacketRows = await loadAssemblyPacketRowsForAssemblies(sb, [...affectedIds]);
  const packetIdSet = new Set([pid]);
  assemblyPacketRows.forEach((row) => {
    if (row?.packet_id) packetIdSet.add(String(row.packet_id));
  });
  const packetIdList = [...packetIdSet];

  const [
    { data: assemblies, error: aErr },
    { data: allPackets, error: pErr },
  ] = await Promise.all([
    sb.from(ASSEMBLIES)
      .select('id, packet_count, inventory_mode, item_kind, units_per_carton')
      .in('id', [...affectedIds]),
    packetIdList.length === 1
      ? sb.from(PACKETS).select('id, sku, name, packet_number, qty_per_unit, assembly_id').eq('id', packetIdList[0])
      : sb.from(PACKETS).select('id, sku, name, packet_number, qty_per_unit, assembly_id').in('id', packetIdList),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load warehouse products');
  if (pErr) throw new Error(pErr.message || 'Failed to load warehouse packets');

  const packetsByAssembly = buildPacketsByAssembly(assemblyPacketRows, allPackets || []);
  const productStockByAssembly = new Map();

  for (const assembly of assemblies || []) {
    const aid = String(assembly.id);
    const pktList = packetsByAssembly.get(aid) || [];
    const usePacketMath = assemblyDerivesWarehouseStockFromPackets(assembly, pktList);
    if (usePacketMath) {
      const complete = await syncAssemblyInventoryFromPackets(
        sb,
        assembly.id,
        locId,
        pktList,
        assembly.packet_count,
        assemblyPacketRows,
        allPackets,
      );
      assemblyWarehouseQty[aid] = complete;
      productStockByAssembly.set(aid, complete);
      continue;
    }
    if (assemblyUsesFinishedBoxReceiving(assembly, pktList)) {
      const packet = pktList[0];
      if (packet?.id) {
        const invMap = await loadPacketInventoryMap(sb, locId, [packet.id]);
        const boxes = invMap.get(String(packet.id)) ?? 0;
        const finished = finishedUnitsFromBoxCount(boxes, assemblyUnitsPerCarton(assembly));
        await sb.from(ASSEMBLY_INVENTORY).upsert({
          assembly_id: assembly.id,
          location_id: locId,
          quantity: finished,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'assembly_id,location_id' });
        assemblyWarehouseQty[aid] = finished;
        productStockByAssembly.set(aid, finished);
      }
    }
  }

  if (!isWarehouseKitShowroomLocation(locId) || !productStockByAssembly.size) {
    return assemblyWarehouseQty;
  }

  const { data: setItems, error: sErr } = await sb.from(SET_ITEMS).select('*');
  if (sErr) throw new Error(sErr.message || 'Failed to load set components');
  const expanded = expandWarehouseSetItemsRows(setItems || []);
  const now = new Date().toISOString();
  const { data: allAssembliesForSets } = await sb
    .from(ASSEMBLIES)
    .select('id, packet_count, inventory_mode, item_kind, units_per_carton');
  const setAssemblies = (allAssembliesForSets || []).filter((a) => isWarehouseSetAssembly(a));
  const { data: allAssemblyInv } = await sb
    .from(ASSEMBLY_INVENTORY)
    .select('assembly_id, location_id, quantity')
    .eq('location_id', locId);

  for (const setAsm of setAssemblies || []) {
    const lines = expanded.filter(
      (row) => String(row.set_assembly_id) === String(setAsm.id)
        && String(row.location_id) === locId,
    );
    if (!lines.length) continue;
    const touchesSet = lines.some((row) => affectedIds.has(String(row.component_assembly_id)));
    if (!touchesSet) continue;

    const units = assemblableSetUnits(lines, (componentId) => {
      const cid = String(componentId);
      if (productStockByAssembly.has(cid)) return productStockByAssembly.get(cid) ?? 0;
      const invRow = (allAssemblyInv || []).find((r) => String(r.assembly_id) === cid);
      return Number(invRow?.quantity) || 0;
    });
    await sb.from(ASSEMBLY_INVENTORY).upsert({
      assembly_id: setAsm.id,
      location_id: locId,
      quantity: units,
      updated_at: now,
    }, { onConflict: 'assembly_id,location_id' });
    assemblyWarehouseQty[String(setAsm.id)] = units;
  }

  return assemblyWarehouseQty;
}

export async function setWarehousePacketQuantityServer(sb, packetId, locationId, quantity, options = {}) {
  const qty = Math.max(0, Number(quantity) || 0);
  const pid = String(packetId || '');
  const locId = String(locationId || '');
  if (!pid || !locId) throw new Error('Packet and location are required');
  const { error } = await sb.from(INVENTORY).upsert({
    packet_id: pid,
    location_id: locId,
    quantity: qty,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'packet_id,location_id' });
  if (error) throw new Error(error.message || 'Failed to update quantity');
  if (options.mobileFast) {
    const assemblyWarehouseQty = await recomputeWarehouseStockForPacketTouch(sb, pid, locId);
    return { quantity: qty, assemblyWarehouseQty };
  }
  await recomputeWarehouseLocationStockServer(sb, locId);
  return { quantity: qty, assemblyWarehouseQty: {} };
}
