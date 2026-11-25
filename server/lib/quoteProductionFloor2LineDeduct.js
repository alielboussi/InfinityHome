import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import {
  isQuoteLineFloor2Wip,
  quoteLineFloor2AssemblyId,
} from '../../src/utils/quoteProductionLineSet.js';
import { loadFloor2QtyMap } from './showroomQuoteOrder.js';

const FLOOR2_LOC = 'warehouse_floor_2_staging';

async function loadAssemblyInventoryQty(sb, assemblyId, locationId) {
  const { data } = await sb
    .from('warehouse_assembly_inventory')
    .select('quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', locationId)
    .maybeSingle();
  return Number(data?.quantity) || 0;
}

async function adjustAssemblyInventory(sb, assemblyId, locationId, delta) {
  const aid = String(assemblyId || '').trim();
  const loc = String(locationId || '').trim();
  const d = Number(delta) || 0;
  if (!aid || !loc || !d) return;
  const current = await loadAssemblyInventoryQty(sb, aid, loc);
  const next = Math.max(0, current + d);
  const now = new Date().toISOString();
  await sb.from('warehouse_assembly_inventory').upsert({
    assembly_id: aid,
    location_id: loc,
    quantity: next,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
}

/** Any Floor 2 assembly on these lines with on-hand qty > 0. */
export async function floor2CardHasAnyStock(sb, lines = []) {
  const aids = [...new Set(
    (lines || [])
      .filter(isQuoteLineFloor2Wip)
      .map(quoteLineFloor2AssemblyId)
      .filter(Boolean),
  )];
  if (!aids.length) return false;
  const qtyMap = await loadFloor2QtyMap(sb, aids);
  return aids.some((aid) => (qtyMap.get(aid) ?? 0) > 0);
}

export async function assertFloor2CardCanStartTimer(sb, lines = []) {
  const ok = await floor2CardHasAnyStock(sb, lines);
  if (!ok) {
    throw new Error('Not enough Floor 2 WIP stock to start this order. Manufacture or add stock on Floor 2 first.');
  }
}

/** Cap partial ready qty by Floor 2 on-hand; deduct immediately (not via materials). */
export async function deductFloor2ForQuoteLineReady(sb, rawItem, requestedQty) {
  if (!isQuoteLineFloor2Wip(rawItem)) {
    return { deducted: 0, ready_qty: Math.max(1, Math.floor(Number(requestedQty) || 0)) };
  }
  const aid = quoteLineFloor2AssemblyId(rawItem);
  if (!aid) throw new Error('Floor 2 product is missing assembly id on this line.');
  const want = Math.max(1, Math.floor(Number(requestedQty) || 0));
  const have = await loadAssemblyInventoryQty(sb, aid, FLOOR2_LOC);
  if (have <= 0) {
    throw new Error('Not enough Floor 2 WIP stock for this product.');
  }
  const take = Math.min(want, Math.floor(have));
  if (take <= 0) {
    throw new Error('Not enough Floor 2 WIP stock for this product.');
  }
  await adjustAssemblyInventory(sb, aid, FLOOR2_LOC, -take);
  await recomputeWarehouseLocationStockServer(sb, FLOOR2_LOC);
  const remaining = await loadAssemblyInventoryQty(sb, aid, FLOOR2_LOC);
  return { deducted: take, ready_qty: take, assembly_id: aid, remaining };
}

export async function floor2AvailableForQuoteLine(sb, rawItem) {
  if (!isQuoteLineFloor2Wip(rawItem)) return null;
  const aid = quoteLineFloor2AssemblyId(rawItem);
  if (!aid) return 0;
  return await loadAssemblyInventoryQty(sb, aid, FLOOR2_LOC);
}