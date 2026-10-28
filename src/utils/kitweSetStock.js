import { KITWE_LOCATION_ID } from '../constants/warehouseShowroomLocations';
import { isWarehouseProductAssembly } from './warehouseCatalogHierarchy';
import { isWarehouseSetAssembly } from './warehouseSetMath';
import { assemblableSetUnits } from './warehouseSetMath';
import { expandWarehouseSetItemsRows } from './warehouseSetItems';

export function kitweQtyByAssembly(assemblyInventory) {
  const map = new Map();
  (assemblyInventory || []).forEach((row) => {
    if (String(row.location_id) !== KITWE_LOCATION_ID) return;
    map.set(String(row.assembly_id), Number(row.quantity) || 0);
  });
  return map;
}

export function computeKitweSetBuildableQty(setAssemblyId, setItems, qtyByAssembly) {
  const lines = expandWarehouseSetItemsRows(setItems || []).filter(
    (row) => String(row.set_assembly_id) === String(setAssemblyId)
      && String(row.location_id) === KITWE_LOCATION_ID,
  );
  return assemblableSetUnits(lines, (componentId) => qtyByAssembly.get(String(componentId)) ?? 0);
}

export function listKitweWarehouseSets(assemblies, setItems, assemblyInventory) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  return (assemblies || [])
    .filter((a) => isWarehouseSetAssembly(a))
    .map((setAsm) => {
      const buildable = computeKitweSetBuildableQty(setAsm.id, setItems, qtyByAssembly);
      const components = expandWarehouseSetItemsRows(setItems || [])
        .filter(
          (row) => String(row.set_assembly_id) === String(setAsm.id)
            && String(row.location_id) === KITWE_LOCATION_ID,
        )
        .map((row) => {
          const comp = (assemblies || []).find(
            (a) => String(a.id) === String(row.component_assembly_id),
          );
          return {
            component_assembly_id: row.component_assembly_id,
            name: comp?.name || row.component_assembly_id,
            per_set: Math.max(1, Number(row.quantity) || 1),
            kitwe_qty: qtyByAssembly.get(String(row.component_assembly_id)) ?? 0,
          };
        });
      return {
        ...setAsm,
        kitweBuildableQty: buildable,
        kitweListedQty: qtyByAssembly.get(String(setAsm.id)) ?? buildable,
        components,
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** True when product was added on /kitwe-products (listed even at Kitwe qty 0). */
export function isKitwePortalListedProduct(assembly) {
  const meta = assembly?.metadata || {};
  return meta.kitwe_portal_listed === true;
}

/** /kitwe-products table: Hassan-accepted deliveries (Kitwe qty > 0) + portal-created rows. */
export function filterKitweCatalogProducts(assemblies, assemblyInventory) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  return (assemblies || [])
    .filter((a) => isWarehouseProductAssembly(a) && !isWarehouseSetAssembly(a))
    .filter((a) => {
      if (isKitwePortalListedProduct(a)) return true;
      const meta = a?.metadata || {};
      if (!meta.kitwe_from_factory_delivery) return false;
      return (qtyByAssembly.get(String(a.id)) ?? 0) > 0;
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** @deprecated use filterKitweCatalogProducts */
export function filterKitweFactoryDeliveredProducts(assemblies, assemblyInventory) {
  return filterKitweCatalogProducts(assemblies, assemblyInventory);
}

/** @deprecated use filterKitweFactoryDeliveredProducts — qty>0 only, any source */
export function filterKitweTransferredProducts(assemblies, assemblyInventory) {
  return kitweProductAssemblyOptions(assemblies, assemblyInventory);
}

/** Kitwe products with stock > 0 — for set create dropdown (stock re-checked on save). */
export function kitweProductAssemblyOptions(assemblies, assemblyInventory) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  return (assemblies || [])
    .filter((a) => isWarehouseProductAssembly(a))
    .filter((a) => (qtyByAssembly.get(String(a.id)) ?? 0) > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
