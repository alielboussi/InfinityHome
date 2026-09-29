import {
  effectivePacketOnHandForAssembly,
  normalizeAssemblyPacketRows,
} from './warehouseAssemblyPacketPool.js';

function resolveSharedPacketRows({ assemblyId, assemblyPacketRows, catalogPackets } = {}) {
  if (!assemblyId) return null;
  if (catalogPackets) {
    const rows = normalizeAssemblyPacketRows(assemblyPacketRows, catalogPackets);
    return rows.length ? rows : null;
  }
  if (assemblyPacketRows?.length) return assemblyPacketRows;
  return null;
}

function effectiveOnHandForAssembly(packetId, assemblyId, rawOnHand, sharedRows) {
  if (!sharedRows) return rawOnHand;
  const effective = effectivePacketOnHandForAssembly(
    packetId,
    assemblyId,
    rawOnHand,
    sharedRows,
  );
  if (effective === 0 && rawOnHand > 0) {
    const hasLink = sharedRows.some(
      (r) => String(r.packet_id) === String(packetId)
        && String(r.assembly_id) === String(assemblyId),
    );
    if (!hasLink) return rawOnHand;
  }
  return effective;
}

/** Normalize warehouse / packet SKU for comparison (preserve length; trim only). */
export function normalizeWarehouseSku(value) {
  return String(value || '').trim();
}

export function normalizeWarehouseSkuKey(value) {
  return normalizeWarehouseSku(value).toLowerCase();
}

/** @readonly */
export const WAREHOUSE_INVENTORY_MODE = Object.freeze({
  FINISHED: 'finished',
  PACKETS: 'packets',
});

export function assemblyUsesPacketBom(assembly) {
  const mode = String(assembly?.inventory_mode || WAREHOUSE_INVENTORY_MODE.PACKETS);
  return mode === WAREHOUSE_INVENTORY_MODE.PACKETS;
}

/** Case-insensitive key for warehouse variant color names. */
export function normalizeWarehouseColorKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * How many complete assemblies can be built from per-packet on-hand qty.
 * @param {Array<{ id: string, qty_per_unit?: number }>} packets
 * @param {Map<string, number> | Record<string, number>} inventoryByPacketId
 */
/**
 * BOM completeness: product packet_count = cartons per finished unit;
 * complete when sum(qty_per_unit) on linked packet rows equals that total.
 * Packet # on each row is the label box number (may repeat across different SKUs).
 */
export function analyzeAssemblyPacketBom(packetCount, packets) {
  const required = Math.max(0, Number(packetCount) || 0);
  const list = packets || [];
  const cartonsPerUnit = list.reduce(
    (sum, p) => sum + Math.max(1, Number(p.qty_per_unit) || 1),
    0,
  );
  const isComplete = required > 0 && cartonsPerUnit === required;
  return {
    required,
    linked: list.length,
    cartonsPerUnit,
    isComplete,
  };
}

function readPacketOnHand(inventoryByPacketId, packetId) {
  const key = String(packetId);
  if (inventoryByPacketId instanceof Map) return Number(inventoryByPacketId.get(key)) || 0;
  return Number(inventoryByPacketId?.[key]) || 0;
}

/** Which linked packet limits how many complete units can be built (lowest floor(on_hand ÷ qty per product)). */
export function packetBomBottleneck(
  packets,
  inventoryByPacketId,
  { assemblyId, assemblyPacketRows, catalogPackets } = {},
) {
  const list = packets || [];
  const sharedRows = resolveSharedPacketRows({
    assemblyId,
    assemblyPacketRows,
    catalogPackets,
  });
  let worst = null;
  for (const packet of list) {
    const need = Math.max(1, Number(packet.qty_per_unit) || 1);
    const rawOnHand = readPacketOnHand(inventoryByPacketId, packet.id);
    const onHand = effectiveOnHandForAssembly(
      packet.id,
      assemblyId,
      rawOnHand,
      sharedRows,
    );
    const buildable = Math.floor(onHand / need);
    if (!worst || buildable < worst.buildable) {
      worst = { packet, need, onHand, buildable };
    }
  }
  return worst;
}

export function assemblableUnits(
  packets,
  inventoryByPacketId,
  packetCount,
  { assemblyId, assemblyPacketRows, catalogPackets } = {},
) {
  const bom = analyzeAssemblyPacketBom(packetCount, packets);
  if (packetCount != null && Number(packetCount) > 0 && !bom.isComplete) return 0;

  const list = packets || [];
  if (!list.length) return 0;

  const sharedRows = resolveSharedPacketRows({
    assemblyId,
    assemblyPacketRows,
    catalogPackets,
  });
  let min = Infinity;
  for (const packet of list) {
    const need = Math.max(1, Number(packet.qty_per_unit) || 1);
    const rawOnHand = readPacketOnHand(inventoryByPacketId, packet.id);
    const onHand = effectiveOnHandForAssembly(
      packet.id,
      assemblyId,
      rawOnHand,
      sharedRows,
    );
    min = Math.min(min, Math.floor(onHand / need));
  }
  return min === Infinity ? 0 : Math.max(0, min);
}
