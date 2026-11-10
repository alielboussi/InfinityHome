import { WAREHOUSE_FACTORY_LOCATION_ID } from '../_repoConstants/warehouseShowroomLocations';
import { completeUnitsAtLocation } from '../services/warehouseTransfer';
import { buildPacketsByAssembly } from './warehouseAssemblyPacketPool';
import { assemblyDerivesWarehouseStockFromPackets } from './warehouseAssemblyMath';
import {
  assemblyUsesPacketBom,
  isCompleteCatalogProduct,
  isSetAssembly,
  isStoreroomMaterialAssembly,
} from './warehouseCatalogProductCompleteness';
import {
  buildWarehouseAssemblyLeftoverQtyMap,
  computeWarehouseFactorySetBuildableQty,
  isWarehouseSetAssembly,
} from './warehouseSetMath';

function stockMapsFromCatalog(catalog) {
  const whId = String(catalog?.warehouseLocationId || WAREHOUSE_FACTORY_LOCATION_ID);
  const packetsByAssembly = buildPacketsByAssembly(
    catalog?.assemblyPackets || [],
    catalog?.packets || [],
  );
  const assemblyWarehouseQty = {};
  const invRows = catalog?.assemblyInventory || [];
  const inventory = catalog?.inventory || [];

  const qtyForProduct = (assembly) => {
    const id = String(assembly.id);
    const pktList = packetsByAssembly.get(id) || [];
    if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList)) {
      return completeUnitsAtLocation(pktList, inventory, whId, assembly.packet_count, {
        assemblyId: assembly.id,
        assemblyPacketRows: catalog?.assemblyPackets || [],
        catalogPackets: catalog?.packets || [],
      });
    }
    const row = invRows.find(
      (r) => String(r.assembly_id) === id && String(r.location_id) === whId,
    );
    return Math.max(0, Number(row?.quantity) || 0);
  };

  const setComponentIds = new Set();
  for (const row of catalog?.setItems || []) {
    const comp = String(row?.component_assembly_id || '').trim();
    if (comp) setComponentIds.add(comp);
  }

  const resolveComponentQty = (componentId) => {
    const comp = (catalog?.assemblies || []).find((row) => String(row.id) === String(componentId));
    if (!comp) return 0;
    return qtyForProduct(comp);
  };

  (catalog?.assemblies || []).forEach((a) => {
    const id = String(a.id);
    if (isWarehouseSetAssembly(a)) {
      assemblyWarehouseQty[id] = Math.max(
        qtyForProduct(a),
        computeWarehouseFactorySetBuildableQty(a.id, catalog?.setItems, resolveComponentQty),
      );
    } else {
      assemblyWarehouseQty[id] = qtyForProduct(a);
    }
  });

  const leftoverRecord = buildWarehouseAssemblyLeftoverQtyMap(
    assemblyWarehouseQty,
    catalog?.setItems || [],
    catalog?.assemblies || [],
  );

  return { packetsByAssembly, assemblyWarehouseQty, leftoverRecord, setComponentIds, whId };
}

function mapDeliveryRow(assembly, packetsByAssembly, assemblyWarehouseQty, leftoverRecord, setComponentIds) {
  const id = String(assembly.id);
  const pktList = packetsByAssembly.get(id) || [];
  const isSet = isSetAssembly(assembly);
  let onHand = Math.max(0, Number(assemblyWarehouseQty[id] ?? 0));
  if (!isSet && setComponentIds.has(id)) {
    onHand = Math.max(0, Number(leftoverRecord[id] ?? 0));
  }
  return {
    assembly,
    pktList,
    onHand,
    kind: isSet ? 'set' : 'product',
  };
}

/**
 * Floor 1 products and sets eligible for Factory → Kitwe delivery.
 * Sets use built qty from recipe + component stock (same as Warehouse Sets view).
 * @param {object} catalog fetchWarehouseCatalog payload
 */
export function filterFulfillmentFloor1DeliveryProducts(catalog) {
  const list = catalog?.assemblies;
  if (!Array.isArray(list) || !list.length) return { products: [], packetsByAssembly: new Map() };

  const { packetsByAssembly, assemblyWarehouseQty, leftoverRecord, setComponentIds } = stockMapsFromCatalog(catalog);

  const products = list.filter((assembly) => {
    if (!assembly?.id) return false;
    if (isStoreroomMaterialAssembly(assembly)) return false;

    const id = String(assembly.id);
    const pktList = packetsByAssembly.get(id) || [];
    const isSet = isSetAssembly(assembly);
    let onHand = Math.max(0, Number(assemblyWarehouseQty[id] ?? 0));
    if (!isSet && setComponentIds.has(id)) {
      onHand = Math.max(0, Number(leftoverRecord[id] ?? 0));
    }
    if (onHand <= 0) return false;

    if (isSet) return true;
    if (isCompleteCatalogProduct(assembly, pktList)) return true;
    if (assemblyUsesPacketBom(assembly) && pktList.length > 0) return true;
    return false;
  }).map((assembly) => mapDeliveryRow(
    assembly,
    packetsByAssembly,
    assemblyWarehouseQty,
    leftoverRecord,
    setComponentIds,
  ));

  products.sort((a, b) => String(a.assembly.name || '').localeCompare(String(b.assembly.name || '')));

  return { products, packetsByAssembly };
}

export function searchFulfillmentDeliveryProducts(productRows, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return productRows.slice(0, 40);
  return productRows.filter(({ assembly }) => (
    String(assembly.name || '').toLowerCase().includes(q)
      || String(assembly.family_sku || '').toLowerCase().includes(q)
  )).slice(0, 40);
}
