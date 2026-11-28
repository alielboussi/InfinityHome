/**
 * Warehouse catalog levels (strict):
 *   packets → products (packet BOM)
 *   products → sets (showroom kit BOM per location)
 * Packets never go into sets; sets never include packets or other sets.
 */
import { isWarehouseAccessory, isWarehouseAccessorySubcategory } from './warehouseAccessoryCatalog.js';

export const WAREHOUSE_CATALOG_LEVEL = Object.freeze({
  PACKET: 'packet',
  PRODUCT: 'product',
  SET: 'set',
});

export function normalizeWarehouseItemKind(assembly) {
  return String(assembly?.item_kind || WAREHOUSE_CATALOG_LEVEL.PRODUCT).toLowerCase();
}

export function isWarehouseProductAssembly(assembly) {
  if (isWarehouseAccessory(assembly) || isWarehouseAccessorySubcategory(assembly)) return false;
  return normalizeWarehouseItemKind(assembly) === WAREHOUSE_CATALOG_LEVEL.PRODUCT;
}

export function isWarehouseSetAssembly(assembly) {
  return normalizeWarehouseItemKind(assembly) === WAREHOUSE_CATALOG_LEVEL.SET;
}

export function validateSetComponentAssembly(component, { setAssemblyId } = {}) {
  if (!component) {
    throw new Error('Set components must be warehouse products (built from packets).');
  }
  if (setAssemblyId && String(component.id) === String(setAssemblyId)) {
    throw new Error('A set cannot include itself.');
  }
  if (isWarehouseSetAssembly(component)) {
    throw new Error('Sets combine products only — not other sets.');
  }
  if (isWarehouseAccessory(component) || isWarehouseAccessorySubcategory(component)) {
    throw new Error('Sets combine products only — not accessories.');
  }
  if (!isWarehouseProductAssembly(component)) {
    throw new Error('Sets combine products only — link packets on a product, not on a set.');
  }
}
