import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../../src/constants/warehouseShowroomLocations.js';
import {
  buildSetItemsByAssemblyAndLocation,
  setItemsAssemblyLocationKey,
} from '../../../src/utils/warehouseSetItems.js';
import { isSetAssembly } from './warehouseCatalogProductCompleteness';

/** Product assembly ids used as set components (any recipe location). */
export function collectSetComponentAssemblyIds(setItems) {
  const ids = new Set();
  (setItems || []).forEach((row) => {
    const cid = String(row?.component_assembly_id || '').trim();
    if (cid) ids.add(cid);
  });
  return ids;
}

export function catalogSetRecipeLocationId() {
  return WAREHOUSE_FACTORY_LOCATION_ID;
}

/**
 * Sets with resolved components for the factory recipe (when present).
 */
export function buildWarehouseCatalogSetEntries(setItems, assemblies) {
  const setMap = buildSetItemsByAssemblyAndLocation(setItems, assemblies);
  const locId = catalogSetRecipeLocationId();
  return (assemblies || [])
    .filter((a) => isSetAssembly(a))
    .map((setAssembly) => {
      const key = setItemsAssemblyLocationKey(setAssembly.id, locId);
      const components = (setMap.get(key) || []).filter((line) => line?.component);
      return { setAssembly, components };
    })
    .filter((entry) => entry.components.length > 0)
    .sort((a, b) => String(a.setAssembly.name).localeCompare(String(b.setAssembly.name)));
}

export function expandKeySet(setId) {
  return `s:${setId}`;
}

export function expandKeySetProduct(setId, productId) {
  return `s:${setId}:p:${productId}`;
}

export function expandKeyProduct(productId) {
  return `p:${productId}`;
}
