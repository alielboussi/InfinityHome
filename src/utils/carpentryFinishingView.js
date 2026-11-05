import { listCarpentryCatalogProducts } from './carpentryCatalogView.js';

/** Unfinished WIP on Floor 2 for carpentry catalog products. */
export function buildCarpentryFinishingCandidates(assemblies, inventoryRows, floor2LocationId) {
  const floor2 = String(floor2LocationId || '');
  if (!floor2) return [];
  const qtyByAssembly = new Map();
  for (const row of inventoryRows || []) {
    if (String(row.location_id) !== floor2) continue;
    const q = Math.max(0, Number(row.quantity) || 0);
    if (q <= 0) continue;
    qtyByAssembly.set(String(row.assembly_id || ''), q);
  }
  return listCarpentryCatalogProducts(assemblies || [])
    .filter((p) => qtyByAssembly.get(String(p.id)) > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      family_sku: p.family_sku,
      material_count: p.material_count,
      floor2_qty: qtyByAssembly.get(String(p.id)) || 0,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
