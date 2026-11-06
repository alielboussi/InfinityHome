import { KITWE_LOCATION_ID } from '../_repoConstants/warehouseShowroomLocations.js';
import { isWarehouseProductAssembly } from './warehouseCatalogHierarchy.js';
import { isWarehouseSetAssembly, assemblableSetUnits } from './warehouseSetMath.js';
import { expandWarehouseSetItemsRows } from './warehouseSetItems.js';

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

/** True when assembly belongs on /kitwe-products (portal create or factory delivery accept). */
export function isKitweProductsPortalAssembly(assembly, assemblyInventoryOrQtyMap) {
  if (!assembly?.id) return false;
  if (!isWarehouseProductAssembly(assembly) || isWarehouseSetAssembly(assembly)) return false;
  const qtyByAssembly = assemblyInventoryOrQtyMap instanceof Map
    ? assemblyInventoryOrQtyMap
    : kitweQtyByAssembly(assemblyInventoryOrQtyMap);
  const kitweQty = qtyByAssembly.get(String(assembly.id)) ?? 0;
  if (isKitwePortalListedProduct(assembly)) return true;
  const meta = assembly?.metadata || {};
  if (kitweQty < 1) return false;
  if (meta.kitwe_from_factory_delivery === true) return true;
  if (meta.kitwe_factory_delivery_at) return true;
  if (Number(meta.kitwe_factory_delivery_units) > 0) return true;
  return false;
}

/** /kitwe-products table: Hassan-accepted deliveries (Kitwe qty > 0) + portal-created rows. */
export function filterKitweCatalogProducts(assemblies, assemblyInventory) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  return (assemblies || [])
    .filter((a) => isKitweProductsPortalAssembly(a, qtyByAssembly))
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

/** Kitwe /warehouse-returns product picker — catalog + any product assembly with Kitwe stock. */
export function buildKitweReturnProductOptions(assemblies, assemblyInventory) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  const map = new Map();
  const addAssembly = (a) => {
    if (!a?.id) return;
    if (!isWarehouseProductAssembly(a) || isWarehouseSetAssembly(a)) return;
    const kitwe_qty = qtyByAssembly.get(String(a.id)) ?? 0;
    if (kitwe_qty < 1) return;
    map.set(String(a.id), {
      assembly_id: a.id,
      name: a.name,
      sku: a.family_sku,
      kitwe_qty,
    });
  };
  filterKitweCatalogProducts(assemblies || [], assemblyInventory || []).forEach(addAssembly);
  kitweProductAssemblyOptions(assemblies || [], assemblyInventory || []).forEach(addAssembly);
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
