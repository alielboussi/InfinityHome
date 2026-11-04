import { WAREHOUSE_TO_LOCATION_ID } from './warehouseDelivery.js';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../constants/warehouseShowroomLocations.js';
import { isWarehouseSetAssembly } from './warehouseCatalogHierarchy.js';
import { expandWarehouseSetItemsRows } from './warehouseSetItems.js';

export const KITWE_SET_DELIVERY_LOCATION_ID = WAREHOUSE_TO_LOCATION_ID;
export const FACTORY_SET_RECIPE_LOCATION_ID = WAREHOUSE_FACTORY_LOCATION_ID;

export function setRecipeRowsForLocation(setAssemblyId, setItems, locationId) {
  const setId = String(setAssemblyId || '').trim();
  const locId = String(locationId || '').trim();
  if (!setId || !locId) return [];
  return expandWarehouseSetItemsRows(setItems || []).filter(
    (row) => String(row.set_assembly_id) === setId
      && String(row.location_id) === locId,
  );
}

/**
 * Kitwe recipe wins when present; otherwise use central Warehouse (factory) recipe
 * for Factory → Kitwe truck deliveries.
 */
export function resolveSetDeliveryRecipeLocationId(setAssemblyId, setItems) {
  const kitwe = setRecipeRowsForLocation(
    setAssemblyId,
    setItems,
    KITWE_SET_DELIVERY_LOCATION_ID,
  );
  if (kitwe.length) return KITWE_SET_DELIVERY_LOCATION_ID;
  const factory = setRecipeRowsForLocation(
    setAssemblyId,
    setItems,
    FACTORY_SET_RECIPE_LOCATION_ID,
  );
  if (factory.length) return FACTORY_SET_RECIPE_LOCATION_ID;
  return KITWE_SET_DELIVERY_LOCATION_ID;
}

export function resolveSetComponentsForDelivery(setAssemblyId, setUnits, setItems, assemblies) {
  const setId = String(setAssemblyId || '').trim();
  const u = Math.max(1, Number(setUnits) || 1);
  const recipeLocId = resolveSetDeliveryRecipeLocationId(setId, setItems);
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  const rows = setRecipeRowsForLocation(setId, setItems, recipeLocId);
  return rows
    .map((row) => {
      const product = assemblyById.get(String(row.component_assembly_id));
      if (!product || isWarehouseSetAssembly(product)) return null;
      const perSet = Math.max(1, Number(row.quantity) || 1);
      return {
        assembly_id: product.id,
        assembly_name: product.name,
        quantity_per_set: perSet,
        product_qty: u * perSet,
        recipe_location_id: recipeLocId,
      };
    })
    .filter(Boolean);
}

/** Factory recipe lines used to seed Kitwe set_items (same SKU / assembly id). */
export function factorySetRecipeComponentLines(setAssemblyId, setItems) {
  return setRecipeRowsForLocation(setAssemblyId, setItems, FACTORY_SET_RECIPE_LOCATION_ID)
    .map((row) => ({
      component_assembly_id: row.component_assembly_id,
      quantity: Math.max(1, Number(row.quantity) || 1),
    }))
    .filter((line) => String(line.component_assembly_id || '').trim());
}
