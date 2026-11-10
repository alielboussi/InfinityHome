import { KITWE_LOCATION_ID } from '../_repoConstants/warehouseShowroomLocations.js';
import { isKitweCatalogLooseAssembly } from './kitweCatalogComponentVisibility.js';
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

export const KITWE_PORTAL_SET_META = 'kitwe_portal_set';

/** Set created on /kitwe-products (not factory delivery recipe mirror). */
export function isKitwePortalCreatedSet(assembly) {
  if (!assembly?.id || !isWarehouseSetAssembly(assembly)) return false;
  return (assembly?.metadata || {})[KITWE_PORTAL_SET_META] === true;
}

/** Component ids consumed only in Kitwe portal sets (hidden from product rows unless loose). */
export function buildKitweCatalogSetComponentIds(setItems, assemblies) {
  const portalSetIds = new Set(
    (assemblies || []).filter(isKitwePortalCreatedSet).map((a) => String(a.id)),
  );
  const ids = new Set();
  expandWarehouseSetItemsRows(setItems || []).forEach((row) => {
    if (String(row.location_id) !== KITWE_LOCATION_ID) return;
    if (!portalSetIds.has(String(row.set_assembly_id))) return;
    const cid = String(row.component_assembly_id || '').trim();
    if (cid) ids.add(cid);
  });
  return ids;
}

export function isKitweWarehouseSetAssembly(assembly) {
  return isKitwePortalCreatedSet(assembly);
}

export function listKitweWarehouseSets(assemblies, setItems, assemblyInventory) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  return (assemblies || [])
    .filter((a) => isKitweWarehouseSetAssembly(a))
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

/** Factory→Kitwe delivery accepted at Kitwe (Hassan accept in production app). */
export function isKitweFactoryDeliveryAcceptedProduct(assembly, qtyByAssembly) {
  if (!assembly?.id || !isWarehouseProductAssembly(assembly) || isWarehouseSetAssembly(assembly)) {
    return false;
  }
  const kitweQty = qtyByAssembly.get(String(assembly.id)) ?? 0;
  if (kitweQty < 1) return false;
  const meta = assembly?.metadata || {};
  return meta.kitwe_from_factory_delivery === true
    || Boolean(meta.kitwe_factory_delivery_at)
    || Number(meta.kitwe_factory_delivery_units) > 0;
}

/** True when assembly belongs on /kitwe-products (portal create or factory delivery accept). */
export function isKitweProductsPortalAssembly(assembly, assemblyInventoryOrQtyMap) {
  if (!assembly?.id) return false;
  if (!isWarehouseProductAssembly(assembly) || isWarehouseSetAssembly(assembly)) return false;
  const qtyByAssembly = assemblyInventoryOrQtyMap instanceof Map
    ? assemblyInventoryOrQtyMap
    : kitweQtyByAssembly(assemblyInventoryOrQtyMap);
  if (isKitwePortalListedProduct(assembly)) return true;
  return isKitweFactoryDeliveryAcceptedProduct(assembly, qtyByAssembly);
}

/** /kitwe-products table: deliveries + portal create; hides set components unless loose. */
export function filterKitweCatalogProducts(assemblies, assemblyInventory, setItems) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  const hiddenComponents = buildKitweCatalogSetComponentIds(setItems, assemblies);
  return (assemblies || [])
    .filter((a) => isKitweProductsPortalAssembly(a, qtyByAssembly))
    .filter((a) => !hiddenComponents.has(String(a.id)) || isKitweCatalogLooseAssembly(a))
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
export function kitweProductAssemblyOptions(assemblies, assemblyInventory, setItems) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  const catalogIds = new Set(
    filterKitweCatalogProducts(assemblies, assemblyInventory, setItems).map((a) => String(a.id)),
  );
  return (assemblies || [])
    .filter((a) => isWarehouseProductAssembly(a))
    .filter((a) => catalogIds.has(String(a.id)))
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
  filterKitweCatalogProducts(assemblies || [], assemblyInventory || [], []).forEach(addAssembly);
  kitweProductAssemblyOptions(assemblies || [], assemblyInventory || [], []).forEach(addAssembly);
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
