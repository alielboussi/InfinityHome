/**
 * Send Delivery — Warehouse Floor 1 only (`/warehouse-products` + warehouse packets).
 * Floor 2 WIP (including items sent to painting) is not deliverable until credited to Floor 1.
 * See docs/factory-warehouse-flow.md
 */
import { FACTORY_LOCATION_ID } from '../shared/locationIds.js';
import { catalogStockMaps } from '../shared/warehouseCatalogStockMaps.js';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping.js';
import {
  assemblyUsesPacketBom,
  isCompleteCatalogProduct,
  isSetAssembly,
} from '../shared/warehouseCatalogProductCompleteness.js';

function isWarehouseProductKind(assembly) {
  return String(assembly?.item_kind || 'product').toLowerCase() === 'product';
}

function isStoreroomMaterial(assembly) {
  return assembly?.metadata?.storeroom?.is_storeroom_material === true;
}

/** True when catalog-list stock maps were bound to Floor 2 WIP instead of Floor 1. */
export function isDeliveryCatalogBoundToFloor2(catalog) {
  const floor2Id = String(catalog?.floor2LocationId || '').trim();
  const locId = String(catalog?.warehouseLocationId || '').trim();
  if (locId && locId === String(FACTORY_LOCATION_ID)) return false;
  if (floor2Id && locId && locId === floor2Id) return true;
  const name = String(catalog?.warehouseLocationName || '').trim().toLowerCase();
  return name === 'warehouse floor 2' || name.includes('floor 2');
}

function warehouseProductsCatalogContext(catalog) {
  const { assemblyWarehouseQty, assemblyWarehouseLeftoverQty } = catalogStockMaps(catalog);
  const setComponentIds = new Set();
  for (const row of catalog?.setItems || []) {
    const compId = String(row?.component_assembly_id || '').trim();
    if (compId) setComponentIds.add(compId);
  }
  return {
    assemblyWarehouseQty,
    leftoverById: assemblyWarehouseLeftoverQty || {},
    setComponentIds,
  };
}

function isWarehouseFloor1DeliveryProduct(assembly, pktList, ctx, catalog) {
  if (!assembly?.id) return false;
  if (isStoreroomMaterial(assembly)) return false;
  if (isDeliveryCatalogBoundToFloor2(catalog)) return false;

  const locId = String(catalog?.warehouseLocationId || '').trim();
  if (locId && locId !== String(FACTORY_LOCATION_ID)) {
    const name = String(catalog?.warehouseLocationName || '').trim().toLowerCase();
    if (name.startsWith('carpentry warehouse') || /^storeroom\s*[123]$/.test(name)) {
      return false;
    }
  }

  const id = String(assembly.id);
  const floor1Qty = Math.max(0, Number(ctx.assemblyWarehouseQty?.[id] ?? 0) || 0);

  if (isSetAssembly(assembly)) {
    return floor1Qty > 0;
  }

  if (ctx.setComponentIds.has(id)) {
    const leftover = Math.max(0, Number(ctx.leftoverById[id] ?? 0) || 0);
    if (leftover <= 0) return false;
  } else if (floor1Qty <= 0) {
    return false;
  }

  if (isCompleteCatalogProduct(assembly, pktList)) {
    return true;
  }

  if (isWarehouseProductKind(assembly) && assemblyUsesPacketBom(assembly) && (pktList || []).length > 0) {
    return true;
  }

  return false;
}

/**
 * @param {object|null|undefined} catalog catalog-list payload
 * @returns {object[]} assemblies eligible for Send Delivery search / scan / add
 */
export function filterAssembliesForDeliveryWarehouse(catalog) {
  const list = catalog?.assemblies;
  if (!Array.isArray(list) || !list.length) return [];

  const byAssembly = buildPacketsByAssembly(
    catalog.assemblyPackets || [],
    catalog.packets || [],
  );
  const ctx = warehouseProductsCatalogContext(catalog);

  return list.filter((assembly) => {
    if (!assembly?.id) return false;
    const pktList = byAssembly.get(String(assembly.id)) || [];
    return isWarehouseFloor1DeliveryProduct(assembly, pktList, ctx, catalog);
  });
}

/** @param {object|null|undefined} catalog */
export function deliveryWarehouseAssemblyIdSet(catalog) {
  return new Set(filterAssembliesForDeliveryWarehouse(catalog).map((a) => String(a.id)));
}

export function filterAssembliesToDeliveryWarehouse(catalog, assemblies) {
  const allowed = deliveryWarehouseAssemblyIdSet(catalog);
  return (assemblies || []).filter((a) => a?.id && allowed.has(String(a.id)));
}
