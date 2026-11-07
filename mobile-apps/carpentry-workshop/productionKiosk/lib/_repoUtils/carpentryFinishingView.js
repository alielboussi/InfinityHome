import { isWarehouseProductAssembly } from './warehouseCatalogHierarchy.js';
import { isWarehouseSetAssembly } from './warehouseSetMath.js';
import { parseCarpentryMeta } from './carpentryCatalogView.js';
import { findUpholsteryFinishedForRawAssembly } from './upholsteryCatalogView.js';
import {
  readWarehouseFloor2WipFamilyImageUrl,
  readWarehouseFloor2WipImageUrl,
} from './warehouseFloor2WipImage.js';

/** Unfinished WIP on Floor 2 for carpentry / Floor 2 products. */
export function buildCarpentryFinishingCandidates(assemblies, inventoryRows, floor2LocationId) {
  const floor2 = String(floor2LocationId || '');
  if (!floor2) return [];
  const qtyByAssembly = new Map();
  for (const row of inventoryRows || []) {
    if (String(row.location_id) !== floor2) continue;
    const q = Math.max(0, Math.floor(Number(row.quantity) || 0));
    qtyByAssembly.set(String(row.assembly_id || ''), q);
  }
  const allRows = assemblies || [];
  const results = [];
  for (const row of allRows) {
    if (!row?.id || !isWarehouseProductAssembly(row) || isWarehouseSetAssembly(row)) continue;
    if (row?.metadata?.storeroom?.is_storeroom_material === true) continue;
    const aid = String(row.id);
    const qty = qtyByAssembly.get(aid) || 0;
    const carpentryMeta = parseCarpentryMeta(row);
    const inCarpentry = carpentryMeta.selected;
    const linkedUpholstery = Boolean(findUpholsteryFinishedForRawAssembly(allRows, aid));
    const hasFloor2WipPhoto = Boolean(
      readWarehouseFloor2WipImageUrl(row) || readWarehouseFloor2WipFamilyImageUrl(row),
    );
    if (qty <= 0 && !inCarpentry && !linkedUpholstery && !hasFloor2WipPhoto) continue;
    const wipImage = readWarehouseFloor2WipImageUrl(row) || '';
    const familyImage = readWarehouseFloor2WipFamilyImageUrl(row) || '';
    results.push({
      id: aid,
      assembly_id: aid,
      name: String(row.name || aid).trim(),
      family_sku: String(row.family_sku || '').trim(),
      material_count: (carpentryMeta.materials || []).length,
      floor2_qty: qty,
      floor2_image_url: wipImage,
      image_url: wipImage || familyImage,
      family_image_url: familyImage,
    });
  }
  return results.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
