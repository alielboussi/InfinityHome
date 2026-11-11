import { isWarehouseProductAssembly } from './warehouseCatalogHierarchy.js';
import { isStoreroomMaterialAssembly } from './warehouseCatalogProductCompleteness.js';
import { isWarehouseSetAssembly } from './warehouseSetMath.js';
import { normalizeMaterialUom } from '../constants/carpentryUom.js';
import { listWarehouseSetComponentCandidates } from './warehouseCatalogSetCandidates.js';
import { readWarehouseFloor2WipImageUrl } from './warehouseFloor2WipImage.js';
import {
  buildProductionPortalCatalogContext,
  filterSetCandidatesToPortalProducts,
} from './productionPortalCatalog.js';

export function parseCarpentryMeta(assembly) {
  const meta = assembly?.metadata || {};
  const carpentry = meta.carpentry && typeof meta.carpentry === 'object' ? meta.carpentry : {};
  return {
    selected: carpentry.selected === true,
    materials: Array.isArray(carpentry.materials) ? carpentry.materials : [],
  };
}

export function warehouseCatalogProductCandidates(assemblies) {
  return (assemblies || [])
    .filter((a) => isWarehouseProductAssembly(a) && !isWarehouseSetAssembly(a))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function listCarpentryCatalogProducts(assemblies) {
  return warehouseCatalogProductCandidates(assemblies)
    .filter((a) => !isStoreroomMaterialAssembly(a))
    .filter((a) => parseCarpentryMeta(a).selected)
    .map((a) => {
      const { materials } = parseCarpentryMeta(a);
      return {
        id: a.id,
        name: a.name,
        family_sku: a.family_sku,
        material_count: materials.length,
        floor2_image_url: readWarehouseFloor2WipImageUrl(a),
        image_url: String(a.image_url || '').trim(),
        materials: materials.map((m) => ({
          material_assembly_id: m.material_assembly_id,
          quantity: Number(m.quantity) || 0,
          uom: normalizeMaterialUom(m.uom),
          warehouse_location_id: m.warehouse_location_id || null,
        })),
      };
    });
}

export function buildCarpentryCatalogPayload(assemblies, setItems, portalInputs = {}) {
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
    listWarehouseSetComponentCandidates(rows, setItems),
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
    carpentryProducts: listCarpentryCatalogProducts(rows),
  };
}
