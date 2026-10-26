import { KITWE_LOCATION_ID } from '../constants/warehouseShowroomLocations';
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

export function kitweProductAssemblyOptions(assemblies, assemblyInventory) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  return (assemblies || [])
    .filter((a) => !isWarehouseSetAssembly(a))
    .filter((a) => (qtyByAssembly.get(String(a.id)) ?? 0) > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
