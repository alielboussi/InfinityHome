/**
 * Warehouse catalog mobile lists (keep aligned with web packet_count / qty per product rules).
 *
 * Warehouse Products: finished-only (toggle on) OR packet-BOM with complete cartons.
 * Incomplete Products: packet-BOM only, carton sum ≠ packet_count (never finished-only).
 */

export const WAREHOUSE_INVENTORY_MODE = Object.freeze({
  FINISHED: 'finished',
  PACKETS: 'packets',
});

export function isSetAssembly(assembly) {
  return String(assembly?.item_kind || '').toLowerCase() === 'set';
}

export function assemblyInventoryMode(assembly) {
  return String(assembly?.inventory_mode || WAREHOUSE_INVENTORY_MODE.PACKETS).toLowerCase();
}

/** Product form: toggle off — built from warehouse packets (carton BOM). */
export function assemblyUsesPacketBom(assembly) {
  return assemblyInventoryMode(assembly) === WAREHOUSE_INVENTORY_MODE.PACKETS;
}

/** Product form: "Finished units only — no packet BOM". */
export function assemblyUsesFinishedInventory(assembly) {
  return assemblyInventoryMode(assembly) === WAREHOUSE_INVENTORY_MODE.FINISHED;
}

import { assemblyUsesFinishedBoxReceiving } from './warehouseUnitsPerCarton';

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

/** Finished qty from packet on-hand when BOM complete (not single-box finished receiving). */
export function assemblyDerivesWarehouseStockFromPackets(assembly, pktList) {
  const bom = analyzeAssemblyPacketBom(assembly?.packet_count, pktList);
  if (!bom.isComplete || !(pktList || []).length) return false;
  if (assemblyUsesFinishedBoxReceiving(assembly, pktList)) return false;
  return true;
}

/** Packet-BOM product whose linked carton totals do not match packet_count. */
export function hasIncompletePacketCartonBom(assembly, pktList) {
  if (!assembly || isSetAssembly(assembly)) return false;
  if (!assemblyUsesPacketBom(assembly)) return false;
  const required = Math.max(0, Number(assembly.packet_count) || 0);
  if (required <= 0) return false;
  const bom = analyzeAssemblyPacketBom(required, pktList || []);
  return !bom.isComplete;
}

/** Incomplete Products screen. */
export function isIncompletePacketBomProduct(assembly, pktList) {
  return hasIncompletePacketCartonBom(assembly, pktList);
}

/** Warehouse Products screen — finished-only or complete packet BOM (not incomplete BOM). */
export function isCompleteCatalogProduct(assembly, pktList) {
  if (!assembly || isSetAssembly(assembly)) return false;
  if (assemblyUsesFinishedInventory(assembly)) return true;
  if (hasIncompletePacketCartonBom(assembly, pktList)) return false;
  return true;
}

/** Production “Add stock” — finished units only, no carton/packet BOM. */
export function isFinishedProductWithoutPacketBom(assembly, pktList) {
  if (!assembly || isSetAssembly(assembly)) return false;
  if (!assemblyUsesFinishedInventory(assembly)) return false;
  if ((pktList || []).length > 0) return false;
  const packetCount = Number(assembly.packet_count);
  if (Number.isFinite(packetCount) && packetCount > 0) return false;
  return true;
}
