import { buildCarpentryFinishingCandidates } from './carpentryFinishingView.js';
import { readWarehouseFloor2WipImageUrl } from './warehouseFloor2WipImage.js';

/**
 * Farm Warehouse 1 — same inclusion rules and WIP images as Floor 2; quantities from farm location.
 */
export function buildFarmWarehouseCandidates(assemblies, floor2InventoryRows, farmInventoryRows, floor2LocationId, farmLocationId) {
  const floor2 = String(floor2LocationId || '');
  const farm = String(farmLocationId || '');
  const farmQtyByAssembly = new Map();
  for (const row of farmInventoryRows || []) {
    if (String(row.location_id) !== farm) continue;
    farmQtyByAssembly.set(String(row.assembly_id || ''), Math.max(0, Math.floor(Number(row.quantity) || 0)));
  }
  const floor2Inv = (floor2InventoryRows || []).map((row) => ({ ...row, location_id: floor2 }));
  const candidates = buildCarpentryFinishingCandidates(assemblies, floor2Inv, floor2);
  return candidates.map((row) => {
    const aid = String(row.assembly_id || row.id);
    const farmQty = farmQtyByAssembly.get(aid) || 0;
    const wipImage = readWarehouseFloor2WipImageUrl(row);
    return {
      id: aid,
      assembly_id: aid,
      name: row.name,
      family_sku: row.family_sku,
      floor2_qty: row.floor2_qty,
      farm_qty: farmQty,
      quantity: farmQty,
      floor2_image_url: wipImage,
      image_url: wipImage,
    };
  });
}

/** Delivery picker — Floor 2 assemblies with on-hand &gt; 0 (WIP photos unchanged). */
/** Delivery picker — Farm assemblies with on-hand &gt; 0 (return to Floor 2). */
export function buildFarmReturnSendCatalogRows(
  assemblies,
  floor2InventoryRows,
  farmInventoryRows,
  floor2LocationId,
  farmLocationId,
) {
  return buildFarmWarehouseCandidates(
    assemblies,
    floor2InventoryRows,
    farmInventoryRows,
    floor2LocationId,
    farmLocationId,
  ).filter((row) => Math.max(0, Math.floor(Number(row.farm_qty) || 0)) > 0);
}

export function buildFarmSendCatalogRows(assemblies, floor2InventoryRows, floor2LocationId) {
  const floor2 = String(floor2LocationId || '');
  const floor2Inv = (floor2InventoryRows || []).map((row) => ({ ...row, location_id: floor2 }));
  return buildCarpentryFinishingCandidates(assemblies, floor2Inv, floor2)
    .filter((row) => Math.max(0, Math.floor(Number(row.floor2_qty) || 0)) > 0)
  .map((row) => {
    const aid = String(row.assembly_id || row.id);
    const wipImage = readWarehouseFloor2WipImageUrl(row);
    return {
      assembly_id: aid,
      name: row.name,
      family_sku: row.family_sku,
      floor2_qty: row.floor2_qty,
      floor2_image_url: wipImage,
    };
  });
}
