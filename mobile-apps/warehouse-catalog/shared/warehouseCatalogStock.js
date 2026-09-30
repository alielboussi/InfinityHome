/**
 * Mobile copy of src/utils/warehouseCatalogStock.js (+ minimal assembly math).
 * Keep in sync when warehouse stock totals logic changes on web.
 */
import { buildPacketsByAssembly } from './warehousePacketGrouping';

const COMPOSITE_KEYS = {
  warehouse_packet_inventory: ['packet_id', 'location_id'],
  warehouse_assembly_inventory: ['assembly_id', 'location_id'],
};

function normalizeQtyRow(row) {
  const qty = Number(row?.quantity ?? row?.qty ?? 0);
  return { ...row, quantity: Number.isFinite(qty) ? qty : 0 };
}

function hydrateCompositeTableRows(table, rows, { locations } = {}) {
  const keys = COMPOSITE_KEYS[table];
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

function normalizeWarehouseInventoryCatalog(catalog) {
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

function assemblyUsesPacketBom(assembly) {
  const mode = String(assembly?.inventory_mode || 'packets');
  return mode === 'packets';
}

function analyzeAssemblyPacketBom(packetCount, packets) {
  const required = Math.max(0, Number(packetCount) || 0);
  const list = packets || [];
  const cartonsPerUnit = list.reduce(
    (sum, p) => sum + Math.max(1, Number(p.qty_per_unit) || 1),
    0,
  );
  const isComplete = required > 0 && cartonsPerUnit === required;
  return { required, linked: list.length, cartonsPerUnit, isComplete };
}

function legacyAssemblyPacketRows(packets) {
  return (packets || [])
    .filter((p) => p.assembly_id)
    .map((p) => ({
      assembly_id: p.assembly_id,
      packet_id: p.id,
      qty_per_unit: Math.max(1, Number(p.qty_per_unit) || 1),
    }));
}

function normalizeAssemblyPacketRows(assemblyPacketRows, packets) {
  const rowKey = (r) => `${String(r.assembly_id)}|${String(r.packet_id)}`;
  const map = new Map();
  legacyAssemblyPacketRows(packets).forEach((r) => map.set(rowKey(r), r));
  (assemblyPacketRows || []).forEach((r) => {
    const prev = map.get(rowKey(r));
    map.set(rowKey(r), {
      assembly_id: r.assembly_id,
      packet_id: r.packet_id,
      qty_per_unit: Math.max(1, Number(r.qty_per_unit ?? prev?.qty_per_unit) || 1),
    });
  });
  return [...map.values()];
}

function effectivePacketOnHandForAssembly(packetId, assemblyId, onHand, assemblyPacketRows) {
  const pid = String(packetId);
  const aid = String(assemblyId);
  const links = (assemblyPacketRows || []).filter((r) => String(r.packet_id) === pid);
  const my = links.find((r) => String(r.assembly_id) === aid);
  const onHandNum = Math.max(0, Number(onHand) || 0);
  if (!my) return onHandNum;

  const myQ = Math.max(1, Number(my.qty_per_unit) || 1);
  if (links.length <= 1) return onHandNum;

  const qtySumPerRound = links.reduce(
    (s, r) => s + Math.max(1, Number(r.qty_per_unit) || 1),
    0,
  );
  const completeRounds = Math.floor(onHandNum / qtySumPerRound);
  return completeRounds * myQ;
}

function readPacketOnHand(inventoryByPacketId, packetId) {
  const key = String(packetId);
  if (inventoryByPacketId instanceof Map) return Number(inventoryByPacketId.get(key)) || 0;
  return Number(inventoryByPacketId?.[key]) || 0;
}

function assemblableUnits(
  packets,
  inventoryByPacketId,
  packetCount,
  { assemblyId, assemblyPacketRows, catalogPackets } = {},
) {
  const bom = analyzeAssemblyPacketBom(packetCount, packets);
  if (packetCount != null && Number(packetCount) > 0 && !bom.isComplete) return 0;

  const list = packets || [];
  if (!list.length) return 0;

  const sharedRows = assemblyId && catalogPackets
    ? normalizeAssemblyPacketRows(assemblyPacketRows, catalogPackets)
    : (assemblyPacketRows?.length ? assemblyPacketRows : null);

  let min = Infinity;
  for (const packet of list) {
    const need = Math.max(1, Number(packet.qty_per_unit) || 1);
    const rawOnHand = readPacketOnHand(inventoryByPacketId, packet.id);
    let onHand = rawOnHand;
    if (sharedRows) {
      onHand = effectivePacketOnHandForAssembly(packet.id, assemblyId, rawOnHand, sharedRows);
      if (onHand === 0 && rawOnHand > 0) {
        const hasLink = sharedRows.some(
          (r) => String(r.packet_id) === String(packet.id)
            && String(r.assembly_id) === String(assemblyId),
        );
        if (!hasLink) onHand = rawOnHand;
      }
    }
    min = Math.min(min, Math.floor(onHand / need));
  }
  return min === Infinity ? 0 : Math.max(0, min);
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
