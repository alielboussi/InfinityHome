/**
 * Warehouse catalog list filters (keep aligned with mobile-apps/shared/warehouseCatalogProductCompleteness.js).
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

export function assemblyUsesPacketBom(assembly) {
  return assemblyInventoryMode(assembly) === WAREHOUSE_INVENTORY_MODE.PACKETS;
}

export function assemblyUsesFinishedInventory(assembly) {
  return assemblyInventoryMode(assembly) === WAREHOUSE_INVENTORY_MODE.FINISHED;
}

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

export function hasIncompletePacketCartonBom(assembly, pktList) {
  if (!assembly || isSetAssembly(assembly)) return false;
  if (!assemblyUsesPacketBom(assembly)) return false;
  const required = Math.max(0, Number(assembly.packet_count) || 0);
  if (required <= 0) return false;
  const bom = analyzeAssemblyPacketBom(required, pktList || []);
  return !bom.isComplete;
}

export function isIncompletePacketBomProduct(assembly, pktList) {
  return hasIncompletePacketCartonBom(assembly, pktList);
}

export function isCompleteCatalogProduct(assembly, pktList) {
  if (!assembly || isSetAssembly(assembly)) return false;
  if (assemblyUsesFinishedInventory(assembly)) return true;
  if (hasIncompletePacketCartonBom(assembly, pktList)) return false;
  return true;
}

/** Product has no category or category id does not resolve in the categories list. */
export function isUncategorizedWarehouseProduct(assembly, categories) {
  if (!assembly || isSetAssembly(assembly)) return false;
  const cid = assembly?.category_id;
  if (cid == null || cid === '') return true;
  const key = String(cid).trim();
  if (!key) return true;
  const known = (categories || []).some((c) => String(c?.id) === key);
  return !known;
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
