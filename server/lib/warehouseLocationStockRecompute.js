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

async function loadPacketInventoryMap(sb, locationId, packetIds) {
  const map = new Map();
  if (!locationId || !packetIds?.length) return map;
  const { data, error } = await sb.from(INVENTORY).select('packet_id, quantity').eq('location_id', locationId);
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

async function loadAssemblyPacketRows(sb) {
  const { data, error } = await sb.from(ASSEMBLY_PACKETS).select('*');
  if (error) throw new Error(error.message || 'Failed to load product packet links');
  return data || [];
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

export async function setWarehousePacketQuantityServer(sb, packetId, locationId, quantity) {
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
  await recomputeWarehouseLocationStockServer(sb, locId);
  return qty;
}
