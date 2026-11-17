import { WAREHOUSE_FROM_LOCATION_ID } from '../../src/utils/warehouseDelivery.js';
import { assemblyDerivesWarehouseStockFromPackets } from '../../src/utils/warehouseAssemblyMath.js';
import { packetUpdatesForAssemblyTargetUnits } from '../../src/utils/warehouseAssemblyProductQuantity.js';
import { currentAssemblyWarehouseUnits } from '../../src/utils/warehouseAssemblyProductQuantity.js';
import {
  excludedSetComponentsForGroup,
  isPartialSetDeliveryGroup,
  setComponentIncludedInDelivery,
} from '../../src/utils/warehouseSetPartialDelivery.js';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import {
  computeSetComponentUnitsReserved,
  computeWarehouseComponentLeftoverQty,
  computeWarehouseFactorySetBuildableQty,
} from '../../src/utils/warehouseSetMath.js';
import { adjustAssemblyStock, getAssemblyStockQty } from './warehouseReturnStock.js';
import { adjustPacketStock } from './warehouseDeliveryStock.js';
import { recomputeWarehouseLocationStockServer, recomputeWarehouseStockForPacketTouch } from './warehouseLocationStockRecompute.js';

async function getPacketStockQty(sb, packetId, locationId) {
  const { data } = await sb
    .from('warehouse_packet_inventory')
    .select('quantity')
    .eq('packet_id', packetId)
    .eq('location_id', locationId)
    .maybeSingle();
  return Math.max(0, Number(data?.quantity) || 0);
}

/** Credit component units back onto Floor 1 as loose stock (post partial set dismantle). */
async function creditComponentUnitsOnFloor1(sb, {
  assembly,
  packetRows,
  locationId,
  addUnits,
}) {
  const loc = String(locationId || WAREHOUSE_FROM_LOCATION_ID);
  const add = Math.max(0, Math.floor(Number(addUnits) || 0));
  if (add < 1 || !assembly?.id) return;

  const pktList = packetRows || [];
  if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList) && pktList.length) {
    const invByPacket = new Map();
    for (const p of pktList) {
      const qty = await getPacketStockQty(sb, p.id, loc);
      invByPacket.set(String(p.id), qty);
    }
    const assemblyInv = await getAssemblyStockQty(sb, assembly.id, loc);
    const assemblyInventoryByLoc = new Map([[String(assembly.id), new Map([[loc, assemblyInv]])]]);
    const current = currentAssemblyWarehouseUnits(assembly, pktList, loc, {
      inventoryByPacketId: invByPacket,
      assemblyInventoryByLoc,
    });
    const target = current + add;
    const updates = packetUpdatesForAssemblyTargetUnits(assembly, pktList, target);
    const touched = new Set();
    for (const row of updates) {
      const pid = String(row.packetId);
      const desired = Math.max(0, Math.floor(Number(row.quantity) || 0));
      const have = await getPacketStockQty(sb, pid, loc);
      const delta = desired - have;
      if (delta !== 0) {
        await adjustPacketStock(sb, pid, loc, delta);
        touched.add(pid);
      }
    }
    for (const pid of touched) {
      await recomputeWarehouseStockForPacketTouch(sb, pid, loc);
    }
    const { upsertFinishedAssemblyInventoryQuantity } = await import('./warehouseCatalogMobile.js');
    await upsertFinishedAssemblyInventoryQuantity(sb, {
      assemblyId: assembly.id,
      locationId: loc,
      quantity: target,
    });
    return;
  }

  await adjustAssemblyStock(sb, assembly.id, loc, add);
}

export async function loadFactoryAssemblyQtyMap(sb, locationId) {
  const loc = String(locationId || WAREHOUSE_FROM_LOCATION_ID);
  const { data, error } = await sb
    .from('warehouse_assembly_inventory')
    .select('assembly_id, quantity')
    .eq('location_id', loc);
  if (error) throw new Error(error.message || 'Failed to load assembly stock');
  const map = new Map();
  (data || []).forEach((row) => {
    map.set(String(row.assembly_id), Math.max(0, Number(row.quantity) || 0));
  });
  return map;
}

export function factoryComponentLeftoverFromMap(componentId, qtyMap, setItems, locationId) {
  const loc = String(locationId || WAREHOUSE_FACTORY_LOCATION_ID);
  const resolveBuildable = (setId) => computeWarehouseFactorySetBuildableQty(
    setId,
    setItems,
    (cid) => qtyMap.get(String(cid)) ?? 0,
  );
  const reserved = computeSetComponentUnitsReserved(setItems, resolveBuildable, { locationId: loc });
  const onHand = qtyMap.get(String(componentId)) ?? 0;
  return computeWarehouseComponentLeftoverQty(onHand, reserved.get(String(componentId)) ?? 0);
}

/** Split set shipment: assembled rows on Floor 1 vs loose components (buildable sets). */
export async function computeFloor1SetDeliveryStockPlan(sb, {
  setAssemblyId,
  units,
  locationId = WAREHOUSE_FROM_LOCATION_ID,
}) {
  const setId = String(setAssemblyId || '').trim();
  const u = Math.max(1, Math.floor(Number(units) || 1));
  const loc = String(locationId || WAREHOUSE_FROM_LOCATION_ID);
  const setOnHand = await getAssemblyStockQty(sb, setId, loc);
  const assembledUnits = Math.min(u, setOnHand);
  const looseSetUnits = u - assembledUnits;
  return {
    locationId: loc,
    units: u,
    setOnHand,
    assembledUnits,
    looseSetUnits,
  };
}

/**
 * After a Floor 1 set shipment: reduce set qty; credit excluded components when partial.
 */
export async function applyFloor1SetDeliveryDismantle(sb, {
  group,
  assemblyById,
  byAssembly,
  locationId = WAREHOUSE_FROM_LOCATION_ID,
  now = new Date().toISOString(),
}) {
  const setId = String(group?.set_assembly_id || '').trim();
  const units = Math.max(1, Number(group?.units) || 1);
  if (!setId) return { skipped: true };

  const partial = isPartialSetDeliveryGroup(group)
    || group?.partial_set_delivery === true;
  const excluded = excludedSetComponentsForGroup(group);

  const setOnHand = await getAssemblyStockQty(sb, setId, locationId);
  const deductSetUnits = Math.min(units, setOnHand);
  if (deductSetUnits > 0) {
    await adjustAssemblyStock(sb, setId, locationId, -deductSetUnits);
  }

  if (partial && excluded.length) {
    for (const row of excluded) {
      const assemblyId = String(row.assembly_id || '').trim();
      const assembly = assemblyById.get(assemblyId);
      if (!assembly) continue;
      const packetRows = byAssembly.get(assemblyId) || [];
      await creditComponentUnitsOnFloor1(sb, {
        assembly,
        packetRows,
        locationId,
        addUnits: row.product_qty,
      });
    }
  }

  await recomputeWarehouseLocationStockServer(sb, locationId);

  return {
    set_assembly_id: setId,
    units_deducted: deductSetUnits,
    partial,
    credited_components: excluded.map((r) => r.assembly_id),
    dismantled_at: now,
  };
}

export function filterSetGroupComponentsForShipment(group) {
  return (group?.components || []).filter(setComponentIncludedInDelivery);
}