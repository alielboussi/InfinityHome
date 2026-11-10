import { WAREHOUSE_FROM_LOCATION_ID } from '../../src/utils/warehouseDelivery.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { FLOOR2_WIP_KIND_ORDER } from '../../src/utils/warehouseProductionDeliveryStaging.js';
import { adjustAssemblyStock, getAssemblyStockQty } from './warehouseReturnStock.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';

export async function resolveWarehouseFloor2LocationId(sb) {
  const { data: locRows, error } = await sb.from('locations').select('id, name');
  if (error) throw new Error(error.message || 'Failed to load locations.');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  return floor2Loc?.id ? String(floor2Loc.id) : '';
}

export async function scrubFloor1Qty(sb, assemblyId, qty) {
  const aid = String(assemblyId || '').trim();
  const cap = Math.max(0, Math.floor(Number(qty) || 0));
  if (!aid || cap < 1) return;
  const floor1Qty = await getAssemblyStockQty(sb, aid, WAREHOUSE_FROM_LOCATION_ID);
  const remove = Math.min(cap, floor1Qty);
  if (remove > 0) {
    await adjustAssemblyStock(sb, aid, WAREHOUSE_FROM_LOCATION_ID, -remove);
  }
}

/**
 * Stage a finished production unit on Floor 2 for the Delivery app (orders queue).
 */
export async function stageProductionOrderOnFloor2(sb, {
  assemblyId,
  qty = 1,
  productionJobId = null,
  quoteId = null,
  quoteNumber = null,
  department = null,
  now = new Date().toISOString(),
}) {
  const aid = String(assemblyId || '').trim();
  const amount = Math.max(1, Math.floor(Number(qty) || 1));
  if (!aid) throw new Error('assembly_id required to stage order delivery.');

  const floor2Id = await resolveWarehouseFloor2LocationId(sb);
  if (!floor2Id) throw new Error('Warehouse Floor 2 location is not configured.');

  await scrubFloor1Qty(sb, aid, amount);
  await adjustAssemblyStock(sb, aid, floor2Id, amount);

  const { data: asmRow } = await sb
    .from('warehouse_assemblies')
    .select('metadata, name, family_sku')
    .eq('id', aid)
    .maybeSingle();

  const asmMeta = asmRow?.metadata || {};
  await sb.from('warehouse_assemblies').update({
    metadata: {
      ...asmMeta,
      floor2_wip: {
        kind: FLOOR2_WIP_KIND_ORDER,
        production_job_id: productionJobId ? String(productionJobId) : null,
        quote_id: quoteId ? String(quoteId) : null,
        quote_number: quoteNumber || null,
        department: department || null,
        staged_at: now,
        quantity: amount,
      },
    },
    updated_at: now,
  }).eq('id', aid);

  await recomputeWarehouseLocationStockServer(sb, floor2Id);
  await recomputeWarehouseLocationStockServer(sb, WAREHOUSE_FROM_LOCATION_ID);

  return {
    assembly_id: aid,
    assembly_name: asmRow?.name || aid,
    quantity: amount,
    floor2_location_id: floor2Id,
    staged_at: now,
  };
}

/** Carpentry already credited Floor 2 on job finish — tag for Delivery app only. */
export async function tagAssemblyFloor2OrderDelivery(sb, {
  assemblyId,
  qty = 1,
  productionJobId = null,
  department = 'carpentry',
  now = new Date().toISOString(),
}) {
  const aid = String(assemblyId || '').trim();
  if (!aid) return null;
  await scrubFloor1Qty(sb, aid, qty);
  const { data: asmRow } = await sb
    .from('warehouse_assemblies')
    .select('metadata, name')
    .eq('id', aid)
    .maybeSingle();
  const asmMeta = asmRow?.metadata || {};
  await sb.from('warehouse_assemblies').update({
    metadata: {
      ...asmMeta,
      floor2_wip: {
        kind: FLOOR2_WIP_KIND_ORDER,
        production_job_id: productionJobId ? String(productionJobId) : null,
        department,
        staged_at: now,
        quantity: Math.max(1, Math.floor(Number(qty) || 1)),
      },
    },
    updated_at: now,
  }).eq('id', aid);
  return { assembly_id: aid, staged_at: now };
}

/** Delivery app — completed carpet/upholstery production orders awaiting truck. */
export async function listProductionOrderDeliveriesForCatalog(sb) {
  const floor2Id = await resolveWarehouseFloor2LocationId(sb);
  if (!floor2Id) return [];

  const { data: assemblies, error } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, metadata');
  if (error) throw new Error(error.message || 'Failed to load products');

  const { data: invRows, error: invErr } = await sb
    .from('warehouse_assembly_inventory')
    .select('assembly_id, quantity')
    .eq('location_id', floor2Id);
  if (invErr) throw new Error(invErr.message || 'Failed to load Floor 2 stock');

  const qtyByAsm = new Map(
    (invRows || []).map((r) => [String(r.assembly_id), Math.max(0, Number(r.quantity) || 0)]),
  );

  const out = [];
  for (const row of assemblies || []) {
    const wip = row?.metadata?.floor2_wip;
    if (!wip || String(wip.kind || '').toLowerCase() !== FLOOR2_WIP_KIND_ORDER) continue;
    const id = String(row.id);
    const qtyOnFloor2 = qtyByAsm.get(id) || 0;
    const stagedQty = Math.max(1, Math.floor(Number(wip.quantity) || 1));
    if (qtyOnFloor2 < 1) continue;
    out.push({
      assembly_id: id,
      assembly_name: row.name,
      family_sku: row.family_sku || '',
      quantity: Math.min(stagedQty, qtyOnFloor2),
      production_job_id: wip.production_job_id || null,
      quote_id: wip.quote_id || null,
      quote_number: wip.quote_number || null,
      department: wip.department || null,
      staged_at: wip.staged_at || null,
    });
  }

  out.sort((a, b) => String(a.assembly_name).localeCompare(String(b.assembly_name)));
  return out;
}

export async function markStagedDeliveriesSubmitted(sb, entries, { submittedAt = new Date().toISOString() } = {}) {
  for (const line of entries || []) {
    const meta = line?.metadata || {};
    const assemblyId = String(meta.assembly_id || '').trim();
  const returnOrderId = String(meta.return_order_id || '').trim();
    const isRepair = meta.floor2_repair_delivery === true;
    const isOrder = meta.floor2_order_delivery === true;
    if (!assemblyId || (!isRepair && !isOrder)) continue;

    if (returnOrderId) {
      const { data: row } = await sb.from('warehouse_return_orders').select('metadata').eq('id', returnOrderId).maybeSingle();
      await sb.from('warehouse_return_orders').update({
        updated_at: submittedAt,
        metadata: {
          ...(row?.metadata || {}),
          delivery_submitted_at: submittedAt,
        },
      }).eq('id', returnOrderId);
    }

    const { data: asmRow } = await sb
      .from('warehouse_assemblies')
      .select('metadata')
      .eq('id', assemblyId)
      .maybeSingle();
    const asmMeta = asmRow?.metadata || {};
    if (asmMeta.floor2_wip) {
      const nextMeta = { ...asmMeta };
      delete nextMeta.floor2_wip;
      await sb.from('warehouse_assemblies').update({
        metadata: nextMeta,
        updated_at: submittedAt,
      }).eq('id', assemblyId);
    }
  }
}
