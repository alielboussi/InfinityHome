import { isWarehouseSetAssembly as isSetAssembly } from './warehouseCatalogHierarchy';

/** How many complete sets can be built from component product stock. */
export function assemblableSetUnits(setLines, resolveCompleteUnits) {
  const lines = setLines || [];
  if (!lines.length || typeof resolveCompleteUnits !== 'function') return 0;
  let min = Infinity;
  for (const line of lines) {
    const componentId = line?.component_assembly_id;
    if (!componentId) continue;
    const need = Math.max(1, Number(line.quantity) || 1);
    const available = Math.max(0, Number(resolveCompleteUnits(componentId)) || 0);
    min = Math.min(min, Math.floor(available / need));
  }
  return min === Infinity ? 0 : Math.max(0, min);
}

export function isWarehouseSetAssembly(assembly) {
  return isSetAssembly(assembly);
}
