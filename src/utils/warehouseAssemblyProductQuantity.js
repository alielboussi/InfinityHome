import {
  assemblableUnits,
  assemblyDerivesWarehouseStockFromPackets,
} from './warehouseAssemblyMath.js';
import {
  assemblyUnitsPerCarton,
  assemblyUsesFinishedBoxReceiving,
  boxCountFromFinishedUnits,
  finishedUnitsFromBoxCount,
} from './warehouseUnitsPerCarton.js';

export function assertWarehouseProductQtyIncrementOnly(currentUnits, targetUnits) {
  const current = Math.max(0, Math.floor(Number(currentUnits) || 0));
  const target = Math.max(0, Math.floor(Number(targetUnits) || 0));
  if (target < current) {
    throw new Error(
      `Product quantity cannot decrease (${current} → ${target}). Only increases are allowed.`,
    );
  }
}

/** Carton on-hand per packet when building `targetUnits` complete products. */
export function packetCartonsForAssemblyTargetUnits(packets, targetUnits) {
  const units = Math.max(0, Math.floor(Number(targetUnits) || 0));
  return (packets || []).map((packet) => ({
    packetId: String(packet.id),
    quantity: units * Math.max(1, Number(packet.qty_per_unit) || 1),
  }));
}

export function currentAssemblyWarehouseUnits(
  assembly,
  pktList,
  locationId,
  { inventoryByPacketId, assemblyInventoryByLoc, poolOpts } = {},
) {
  const locId = String(locationId || '');
  if (!assembly || !locId) return 0;

  if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList)) {
    return assemblableUnits(pktList, inventoryByPacketId, assembly.packet_count, poolOpts);
  }

  if (assemblyUsesFinishedBoxReceiving(assembly, pktList)) {
    const packet = pktList[0];
    if (!packet) return 0;
    const boxes = inventoryByPacketId instanceof Map
      ? Number(inventoryByPacketId.get(String(packet.id))) || 0
      : Number(inventoryByPacketId?.[String(packet.id)]) || 0;
    return finishedUnitsFromBoxCount(boxes, assemblyUnitsPerCarton(assembly));
  }

  const stockMap = assemblyInventoryByLoc?.get?.(String(assembly.id));
  if (stockMap instanceof Map) {
    return Number(stockMap.get(locId)) || 0;
  }
  return 0;
}

export function packetUpdatesForAssemblyTargetUnits(assembly, pktList, targetUnits) {
  const units = Math.max(0, Math.floor(Number(targetUnits) || 0));
  if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList)) {
    return packetCartonsForAssemblyTargetUnits(pktList, units);
  }
  if (assemblyUsesFinishedBoxReceiving(assembly, pktList) && pktList.length === 1) {
    const perBox = assemblyUnitsPerCarton(assembly);
    const boxes = boxCountFromFinishedUnits(units, perBox);
    return [{ packetId: String(pktList[0].id), quantity: boxes }];
  }
  return null;
}
