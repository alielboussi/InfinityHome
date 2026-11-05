/**
 * Send Delivery — Warehouse Floor 1 only (`/warehouse-products` + warehouse packets).
 * Floor 2 WIP is consumed by upholstery/painting and credited to Floor 1 before truck delivery.
 * See docs/factory-warehouse-flow.md
 */
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

function isWarehouseFloor1DeliveryProduct(assembly, pktList, ctx) {
  const id = String(assembly.id);

  if (isSetAssembly(assembly)) {
    return true;
  }

  if (ctx.setComponentIds.has(id)) {
    const leftover = Math.max(0, Number(ctx.leftoverById[id] ?? 0) || 0);
    if (leftover <= 0) return false;
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
    return isWarehouseFloor1DeliveryProduct(assembly, pktList, ctx);
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
