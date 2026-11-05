import { buildWarehouseAssemblyLeftoverQtyMap } from '../lib/_repoUtils/warehouseSetMath.js';

/** Use server-computed qty maps from catalog-list when present (avoids heavy client recompute). */
export function catalogStockMaps(catalog) {
  if (!catalog) {
    return {
      assemblyWarehouseQty: {},
      assemblyWarehouseLeftoverQty: {},
      packetWarehouseQty: {},
    };
  }
  const assemblyWarehouseQty = catalog.assemblyWarehouseQty || {};
  let assemblyWarehouseLeftoverQty = catalog.assemblyWarehouseLeftoverQty;
  if (
    assemblyWarehouseLeftoverQty == null
    && (catalog.setItems || []).length
    && Object.keys(assemblyWarehouseQty).length
  ) {
    assemblyWarehouseLeftoverQty = buildWarehouseAssemblyLeftoverQtyMap(
      assemblyWarehouseQty,
      catalog.setItems,
      catalog.assemblies,
    );
  }
  return {
    assemblyWarehouseQty,
    assemblyWarehouseLeftoverQty: assemblyWarehouseLeftoverQty || {},
    packetWarehouseQty: catalog.packetWarehouseQty || {},
  };
}
