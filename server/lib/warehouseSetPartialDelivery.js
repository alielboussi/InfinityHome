import { WAREHOUSE_FROM_LOCATION_ID } from '../../src/utils/warehouseDelivery.js';
import { assemblyDerivesWarehouseStockFromPackets } from '../../src/utils/warehouseAssemblyMath.js';
import { packetUpdatesForAssemblyTargetUnits } from '../../src/utils/warehouseAssemblyProductQuantity.js';
import { currentAssemblyWarehouseUnits } from '../../src/utils/warehouseAssemblyProductQuantity.js';
import {
  excludedSetComponentsForGroup,
  isPartialSetDeliveryGroup,
  setComponentIncludedInDelivery,
} from '../../src/utils/warehouseSetPartialDelivery.js';
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

  await adjustAssemblyStock(sb, setId, locationId, -units);

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
    units_deducted: units,
    partial,
    credited_components: excluded.map((r) => r.assembly_id),
    dismantled_at: now,
  };
}

export function filterSetGroupComponentsForShipment(group) {
  return (group?.components || []).filter(setComponentIncludedInDelivery);
}