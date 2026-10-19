/** Use server-computed qty maps from catalog-list when present (avoids heavy client recompute). */
export function catalogStockMaps(catalog) {
  if (!catalog) {
    return { assemblyWarehouseQty: {}, packetWarehouseQty: {} };
  }
  return {
    assemblyWarehouseQty: catalog.assemblyWarehouseQty || {},
    packetWarehouseQty: catalog.packetWarehouseQty || {},
  };
}
