import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
} from '../../src/utils/warehouseDelivery.js';
import { adjustPacketStock } from './warehouseDeliveryStock.js';
import {
  recomputeWarehouseLocationStockServer,
  recomputeWarehouseStockForPacketTouch,
} from './warehouseLocationStockRecompute.js';

export function deliveryEntryPacketId(entry) {
  return String(entry?.metadata?.packet_id || '').trim();
}

/**
 * Move confirmed delivery lines: Factory packet −, Kitwe packet +.
 * @returns {Promise<Array<{ lineId: string, packetId: string, qty: number, assemblyId: string }>>}
 */
export async function movePacketsForDeliveryReceive(sb, lines, {
  fromLocationId = WAREHOUSE_FROM_LOCATION_ID,
  toLocationId = WAREHOUSE_TO_LOCATION_ID,
} = {}) {
  const moved = [];
  for (const line of lines || []) {
    const pid = deliveryEntryPacketId(line);
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (!pid || qty < 1) continue;
    await adjustPacketStock(sb, pid, fromLocationId, -qty);
    await adjustPacketStock(sb, pid, toLocationId, qty);
    moved.push({
      lineId: String(line.id),
      packetId: pid,
      qty,
      assemblyId: String(line.metadata?.assembly_id || '').trim(),
    });
  }
  return moved;
}

/**
 * After packet moves: refresh derived finished-product qty at both locations, then full location recompute (sets at Kitwe).
 */
export async function syncWarehouseStockAfterDeliveryReceive(sb, moved, {
  fromLocationId = WAREHOUSE_FROM_LOCATION_ID,
  toLocationId = WAREHOUSE_TO_LOCATION_ID,
} = {}) {
  const packetIds = [...new Set((moved || []).map((m) => m.packetId).filter(Boolean))];
  for (const pid of packetIds) {
    await recomputeWarehouseStockForPacketTouch(sb, pid, fromLocationId);
    await recomputeWarehouseStockForPacketTouch(sb, pid, toLocationId);
  }
  await recomputeWarehouseLocationStockServer(sb, fromLocationId);
  await recomputeWarehouseLocationStockServer(sb, toLocationId);
}
