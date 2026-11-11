import { normalizeMaterialUom } from '../constants/carpentryUom.js';
import { isWarehouseProductAssembly } from './warehouseCatalogHierarchy.js';
import { isStoreroomMaterialAssembly } from './warehouseCatalogProductCompleteness.js';
import { isWarehouseSetAssembly } from './warehouseSetMath.js';
import { listWarehouseSetComponentCandidates } from './warehouseCatalogSetCandidates.js';
import {
  buildProductionPortalCatalogContext,
  filterSetCandidatesToPortalProducts,
} from './productionPortalCatalog.js';
import { readWarehouseFloor2WipImageUrl } from './warehouseFloor2WipImage.js';

export function parseUpholsteryMeta(assembly) {
  const meta = assembly?.metadata || {};
  const upholstery = meta.upholstery && typeof meta.upholstery === 'object' ? meta.upholstery : {};
  const rawId = String(upholstery.raw_assembly_id || '').trim();
  return {
    selected: upholstery.selected === true,
    raw_assembly_id: rawId || null,
    materials: Array.isArray(upholstery.materials) ? upholstery.materials : [],
  };
}

export function warehouseCatalogProductCandidates(assemblies) {
  return (assemblies || [])
    .filter((a) => isWarehouseProductAssembly(a) && !isWarehouseSetAssembly(a))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function listUpholsteryCatalogProducts(assemblies) {
  return warehouseCatalogProductCandidates(assemblies)
    .filter((a) => !isStoreroomMaterialAssembly(a))
    .filter((a) => parseUpholsteryMeta(a).selected)
    .map((a) => {
      const meta = parseUpholsteryMeta(a);
      return {
        id: a.id,
        name: a.name,
        family_sku: a.family_sku,
        raw_assembly_id: meta.raw_assembly_id,
        material_count: meta.materials.length,
        floor2_image_url: readWarehouseFloor2WipImageUrl(a) || String(a.image_url || '').trim(),
        image_url: readWarehouseFloor2WipImageUrl(a) || String(a.image_url || '').trim(),
        materials: meta.materials.map((m) => ({
          material_assembly_id: m.material_assembly_id,
          quantity: Number(m.quantity) || 0,
          uom: normalizeMaterialUom(m.uom),
          warehouse_location_id: m.warehouse_location_id || null,
        })),
      };
    });
}

/** Finished warehouse row linked to a carpentry raw assembly id. */
export function findUpholsteryFinishedForRawAssembly(assemblies, rawAssemblyId) {
  const rawId = String(rawAssemblyId || '').trim();
  if (!rawId) return null;
  for (const a of assemblies || []) {
    if (!parseUpholsteryMeta(a).selected) continue;
    const meta = parseUpholsteryMeta(a);
    const linkedRaw = meta.raw_assembly_id || '';
    if (linkedRaw === rawId) return a;
  }
  return null;
}

export function listUpholsterySetCandidates(assemblies, setItems) {
  return listWarehouseSetComponentCandidates(assemblies, setItems);
}

export function buildUpholsteryCatalogPayload(assemblies, setItems, portalInputs = {}) {
  const rows = assemblies || [];
  const portal = buildProductionPortalCatalogContext({
    assemblies: rows,
    assemblyPackets: portalInputs.assemblyPackets || [],
    packets: portalInputs.packets || [],
    setItems: setItems || [],
    inventory: portalInputs.inventory || [],
    locations: portalInputs.locations || [],
  });
  const setCandidates = filterSetCandidatesToPortalProducts(
    listUpholsterySetCandidates(rows, setItems),
    portal.portalProductIds,
  );
  return {
    ok: true,
    categories: (portalInputs.categories || []).map((c) => ({
      id: String(c.id),
      name: String(c.name || '').trim(),
    })),
    candidates: portal.productCandidates.map((a) => ({
      id: a.id,
      name: a.name,
      family_sku: a.family_sku,
      category_id: a.category_id ? String(a.category_id) : null,
    })),
    setCandidates,
    storeroomMaterials: portal.storeroomMaterials,
    upholsteryProducts: listUpholsteryCatalogProducts(rows),
  };
}

export function isUpholsteryCatalogAssembly(assembly) {
  return parseUpholsteryMeta(assembly).selected;
}
