import { isWarehouseProductAssembly } from './warehouseCatalogHierarchy.js';
import { isWarehouseSetAssembly } from './warehouseSetMath.js';
import { expandWarehouseSetItemsRows } from './warehouseSetItems.js';
import { isWarehouseSetRecipeLocation } from '../_repoConstants/warehouseShowroomLocations.js';

/** Warehouse sets with product components (factory / Kitwe / Lusaka recipes). */
export function listWarehouseSetComponentCandidates(assemblies, setItems) {
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  const sets = (assemblies || []).filter((a) => isWarehouseSetAssembly(a));
  const componentsBySet = new Map();

  expandWarehouseSetItemsRows(setItems || []).forEach((row) => {
    const setId = String(row?.set_assembly_id || '').trim();
    const compId = String(row?.component_assembly_id || '').trim();
    if (!setId || !compId) return;
    if (!isWarehouseSetRecipeLocation(row?.location_id, { portal: 'warehouse-products' })) return;
    const component = assemblyById.get(compId);
    if (!component || isWarehouseSetAssembly(component)) return;
    if (!isWarehouseProductAssembly(component)) return;
    if (!componentsBySet.has(setId)) componentsBySet.set(setId, new Map());
    const perSet = componentsBySet.get(setId);
    const qty = Math.max(1, Number(row.quantity) || 1);
    const prev = perSet.get(compId);
    if (!prev || qty > prev.qty_per_set) {
      perSet.set(compId, {
        id: compId,
        name: component.name,
        family_sku: component.family_sku,
        category_id: component.category_id || null,
        qty_per_set: qty,
      });
    }
  });

  return sets
    .map((set) => {
      const compMap = componentsBySet.get(String(set.id));
      const components = compMap
        ? [...compMap.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)))
        : [];
      return {
        id: set.id,
        name: set.name,
        family_sku: set.family_sku,
        category_id: set.category_id || null,
        components,
      };
    })
    .filter((entry) => entry.components.length > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
