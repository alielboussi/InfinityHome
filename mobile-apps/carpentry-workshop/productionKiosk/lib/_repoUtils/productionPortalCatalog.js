/**
 * Production portal (/carpentry, /upholstery): products from Warehouse Floor 1 catalog only;
 * BOM materials from Storerooms 1–3 only. Floor 2 WIP is not added via these pages.
 */
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../_repoConstants/warehouseShowroomLocations.js';
import { resolveWarehouseFloor2Location } from '../_repoConstants/warehouseFloorLocations.js';
import { CARPENTRY_WAREHOUSE_NAMES } from '../_repoConstants/carpentryWarehouses.js';
import { normalizeMaterialUom } from '../_repoConstants/carpentryUom.js';
import { isWarehouseProductAssembly, isWarehouseSetAssembly } from './warehouseCatalogHierarchy.js';
import { buildPacketsByAssembly } from './warehouseAssemblyPacketPool.js';
import {
  assemblyUsesPacketBom,
  isCompleteCatalogProduct,
  isStoreroomMaterialAssembly,
} from './warehouseCatalogProductCompleteness.js';

function isWarehouseFloor1PortalProduct(assembly, pktList) {
  if (isStoreroomMaterialAssembly(assembly)) return false;
  if (isCompleteCatalogProduct(assembly, pktList)) return true;
  if (assemblyUsesPacketBom(assembly) && (pktList || []).length > 0) return true;
  return false;
}

export function resolveProductionPortalLocations(allLocations) {
  const floor2 = resolveWarehouseFloor2Location(allLocations || []);
  const byName = new Map((allLocations || []).map((r) => [String(r.name || '').trim(), r]));
  const storerooms = CARPENTRY_WAREHOUSE_NAMES.map((name) => byName.get(name)).filter(Boolean);
  return {
    floor1LocationId: WAREHOUSE_FACTORY_LOCATION_ID,
    floor2LocationId: floor2?.id ? String(floor2.id) : '',
    storeroomLocationIds: storerooms.map((l) => String(l.id)),
  };
}

/** Product ids eligible to add on /carpentry and /upholstery (Warehouse Floor 1 / warehouse-products scope). */
export function productionPortalProductIdSet(ctx) {
  const {
    assemblies,
    assemblyPackets,
    packets,
  } = ctx;
  const byAssembly = buildPacketsByAssembly(assemblyPackets || [], packets || []);
  const allowed = new Set();
  for (const assembly of assemblies || []) {
    if (!assembly?.id || !isWarehouseProductAssembly(assembly) || isWarehouseSetAssembly(assembly)) continue;
    const id = String(assembly.id);
    const pktList = byAssembly.get(id) || [];
    if (isWarehouseFloor1PortalProduct(assembly, pktList)) {
      allowed.add(id);
    }
  }
  return allowed;
}

export function listProductionPortalProductCandidates(assemblies, ctx) {
  const allowed = productionPortalProductIdSet(ctx);
  return (assemblies || [])
    .filter((a) => a?.id && allowed.has(String(a.id)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function parseStoreroomMaterialMeta(assembly) {
  const block = assembly?.metadata?.storeroom;
  const uom = block && typeof block === 'object'
    ? normalizeMaterialUom(block.default_uom)
    : '';
  return { default_uom: uom };
}

/** On-hand across storeroom locations on a catalog row (API or portal picker). */
export function storeroomMaterialOnHandTotal(row) {
  const locs = row?.locations || [];
  if (locs.length) {
    const fromLocs = locs.reduce(
      (sum, loc) => sum + Math.max(0, Number(loc.quantity) || 0),
      0,
    );
    if (fromLocs > 0) return fromLocs;
  }
  return Math.max(0, Number(row?.quantity ?? row?.storeroom_qty) || 0);
}

export function isStoreroomMaterialInStock(row) {
  return storeroomMaterialOnHandTotal(row) > 0;
}

/** Materials with stock in Storerooms 1–3 (BOM picker on /carpentry and /upholstery). */
export function listStoreroomMaterialOptions(assemblies, inventory, storeroomLocationIds) {
  const locIds = new Set((storeroomLocationIds || []).map((id) => String(id)));
  const qtyByAssembly = new Map();
  for (const row of inventory || []) {
    if (!locIds.has(String(row.location_id))) continue;
    const aid = String(row.assembly_id || '');
    if (!aid) continue;
    const q = Math.max(0, Number(row.quantity) || 0);
    if (q <= 0) continue;
    qtyByAssembly.set(aid, (qtyByAssembly.get(aid) || 0) + q);
  }
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  return [...qtyByAssembly.entries()]
    .filter(([id]) => {
      const a = assemblyById.get(id);
      return a && isStoreroomMaterialAssembly(a);
    })
    .map(([id, storeroom_qty]) => {
      const a = assemblyById.get(id);
      return {
        id,
        name: a?.name || id,
        family_sku: a?.family_sku || '',
        storeroom_qty,
        default_uom: a ? parseStoreroomMaterialMeta(a).default_uom : '',
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function filterSetCandidatesToPortalProducts(setCandidates, portalProductIds) {
  const allowed = portalProductIds instanceof Set ? portalProductIds : new Set(portalProductIds || []);
  return (setCandidates || [])
    .map((set) => ({
      ...set,
      components: (set.components || []).filter((c) => allowed.has(String(c.id))),
    }))
    .filter((set) => (set.components || []).length > 0);
}

export function buildProductionPortalCatalogContext({
  assemblies,
  assemblyPackets,
  packets,
  setItems,
  inventory,
  locations,
}) {
  const locs = resolveProductionPortalLocations(locations);
  const ctx = {
    assemblies: assemblies || [],
    assemblyPackets: assemblyPackets || [],
    packets: packets || [],
    setItems: setItems || [],
    inventory: inventory || [],
    ...locs,
  };
  const portalProductIds = productionPortalProductIdSet(ctx);
  return {
    ...ctx,
    portalProductIds,
    productCandidates: listProductionPortalProductCandidates(assemblies, ctx),
    storeroomMaterials: listStoreroomMaterialOptions(
      assemblies,
      inventory,
      locs.storeroomLocationIds,
    ),
  };
}
