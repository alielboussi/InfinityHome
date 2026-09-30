import { DOC_ID_FIELDS } from '../db/docIds.js';
import {
  analyzeAssemblyPacketBom,
  assemblyUsesPacketBom,
  assemblableUnits,
} from './warehouseAssemblyMath.js';
import { buildPacketsByAssembly } from './warehouseAssemblyPacketPool.js';

function normalizeQtyRow(row) {
  const qty = Number(row?.quantity ?? row?.qty ?? 0);
  return { ...row, quantity: Number.isFinite(qty) ? qty : 0 };
}

/** Firestore composite docs may only store qty in data — recover keys from doc id. */
export function hydrateCompositeTableRows(table, rows, { locations } = {}) {
  const keys = DOC_ID_FIELDS[table];
  if (!Array.isArray(keys) || keys.length !== 2) {
    return (rows || []).map(normalizeQtyRow);
  }
  const [keyA, keyB] = keys;
  const locationIds = (locations || []).map((l) => String(l.id)).filter(Boolean);

  return (rows || []).map((row) => {
    const next = normalizeQtyRow(row);
    if (next[keyA] != null && next[keyA] !== '' && next[keyB] != null && next[keyB] !== '') {
      return next;
    }
    const docId = String(next.id || '');
    if (!docId) return next;

    if (keyB === 'location_id' && locationIds.length) {
      const locId = locationIds.find((id) => docId.endsWith(`_${id}`));
      if (locId) {
        const prefix = docId.slice(0, docId.length - locId.length - 1);
        if (next[keyA] == null || next[keyA] === '') next[keyA] = prefix;
        if (next[keyB] == null || next[keyB] === '') next[keyB] = locId;
        return next;
      }
    }

    const split = docId.lastIndexOf('_');
    if (split > 0) {
      if (next[keyA] == null || next[keyA] === '') next[keyA] = docId.slice(0, split);
      if (next[keyB] == null || next[keyB] === '') next[keyB] = docId.slice(split + 1);
    }
    return next;
  });
}

export function normalizeWarehouseInventoryCatalog(catalog) {
  const locations = catalog?.locations || [];
  return {
    ...catalog,
    inventory: hydrateCompositeTableRows('warehouse_packet_inventory', catalog?.inventory, { locations }),
    assemblyInventory: hydrateCompositeTableRows(
      'warehouse_assembly_inventory',
      catalog?.assemblyInventory,
      { locations },
    ),
  };
}

function packetQtyAtLocation(inventory, locationId) {
  const map = new Map();
  (inventory || []).forEach((row) => {
    if (!locationId || String(row.location_id) !== String(locationId)) return;
    map.set(String(row.packet_id), Number(row.quantity) || 0);
  });
  return map;
}

function assemblyQtyAtLocation(assemblyInventory, locationId) {
  const map = new Map();
  (assemblyInventory || []).forEach((row) => {
    if (!locationId || String(row.location_id) !== String(locationId)) return;
    map.set(String(row.assembly_id), Number(row.quantity) || 0);
  });
  return map;
}

/** Adds assemblyWarehouseQty and packetWarehouseQty maps for the resolved warehouse location. */
export function attachWarehouseStockTotals(catalog) {
  const normalized = normalizeWarehouseInventoryCatalog(catalog || {});
  const warehouseLocationId = normalized?.warehouseLocationId ?? null;
  const inventory = normalized?.inventory || [];
  const assemblyInventory = normalized?.assemblyInventory || [];
  const assemblies = normalized?.assemblies || [];
  const packets = normalized?.packets || [];
  const assemblyPackets = normalized?.assemblyPackets || [];

  const packetWarehouseQty = {};
  const assemblyWarehouseQty = {};

  const packetQtyMap = packetQtyAtLocation(inventory, warehouseLocationId);
  (packets || []).forEach((p) => {
    packetWarehouseQty[String(p.id)] = packetQtyMap.get(String(p.id)) ?? 0;
  });

  if (!warehouseLocationId) {
    return { ...normalized, packetWarehouseQty, assemblyWarehouseQty };
  }

  const assemblyInvMap = assemblyQtyAtLocation(assemblyInventory, warehouseLocationId);
  const packetsByAssembly = buildPacketsByAssembly(assemblyPackets, packets);

  assemblies.forEach((assembly) => {
    const id = String(assembly.id);
    const pktList = packetsByAssembly.get(id) || [];
    const bom = analyzeAssemblyPacketBom(assembly.packet_count, pktList);
    const usePacketMath = assemblyUsesPacketBom(assembly) && bom.isComplete;

    if (usePacketMath) {
      assemblyWarehouseQty[id] = assemblableUnits(pktList, packetQtyMap, assembly.packet_count, {
        assemblyId: assembly.id,
        assemblyPacketRows: assemblyPackets,
        catalogPackets: packets,
      });
    } else {
      assemblyWarehouseQty[id] = assemblyInvMap.get(id) ?? 0;
    }
  });

  return {
    ...normalized,
    packetWarehouseQty,
    assemblyWarehouseQty,
  };
}
