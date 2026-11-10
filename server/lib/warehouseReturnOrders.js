import { newUuid } from './uuid.js';
import { allocateWarehouseReturnNumber } from './warehouseReturnNumber.js';
import { adjustAssemblyStock, getAssemblyStockQty } from './warehouseReturnStock.js';
import { allocateWarehouseReturnDeliveryNumber } from './warehouseReturnDeliveryNumber.js';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
} from '../../src/utils/warehouseDelivery.js';
import { WAREHOUSE_RETURN_REASON_GROUPS, normalizeWarehouseReturnReason } from '../../src/utils/warehouseReturnReasons.js';
import {
  parseReturnCreateLines,
  WAREHOUSE_RETURN_STATUSES,
} from '../../src/utils/warehouseReturnOrder.js';
import { isWarehouseProductAssembly } from '../../src/utils/warehouseCatalogHierarchy.js';
import { isWarehouseSetAssembly } from '../../src/utils/warehouseSetMath.js';
import { KITWE_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import {
  getPosSaleDetailForStorage,
  resolveAssemblyForPosSaleLine,
} from './warehouseStorageSends.js';
import { HASSAN_AWAD, canManageCatalog } from '../../src/accessControl.js';
import { buildKitweReturnProductOptions } from '../../src/utils/kitweSetStock.js';
import { isLoginAccessAdmin } from './loginAccess.js';
import {
  isWarehouseProductionKitweDeliveryAllowed,
  evaluateCarpentryWorkshopAppAccess,
  evaluatePaintingWorkshopAppAccess,
  evaluateWarehouseProductionAppAccess,
} from '../../src/mobile/mobileAccessManifest.js';
import {
  isReturnCreatedByHassan,
  resolveReturnRepairDepartment,
  returnMatchesRepairDepartment,
} from '../../src/utils/warehouseReturnRepairDepartment.js';
import { returnOrderElapsedSeconds } from '../../src/utils/warehouseReturnOrder.js';
import { returnOrderLifecycleBadge } from '../../src/utils/warehouseReturnOrder.js';
import { buildWarehouseDeliveryNotePdfBase64 } from './buildWarehouseDeliveryNotePdfBase64.js';
import { uploadWarehouseReturnDeliveryNotePdf } from './warehouseReturnDeliveryNoteStorage.js';
import { resolveWarehouseFloor2Location } from '../../src/constants/warehouseFloorLocations.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import { FLOOR2_WIP_KIND_REPAIR } from '../../src/utils/warehouseRepairFloor2Staging.js';

const RETURNS = 'warehouse_return_orders';

export async function resolveWarehouseFloor2LocationId(sb) {
  const { data: locRows, error } = await sb.from('locations').select('id, name');
  if (error) throw new Error(error.message || 'Failed to load locations.');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  return floor2Loc?.id ? String(floor2Loc.id) : '';
}

async function clearFloor1RepairGhostQty(sb, assemblyId, qty) {
  const aid = String(assemblyId || '').trim();
  const cap = Math.max(0, Math.floor(Number(qty) || 0));
  if (!aid || cap < 1) return;
  const floor1Qty = await getAssemblyStockQty(sb, aid, WAREHOUSE_FROM_LOCATION_ID);
  const remove = Math.min(cap, floor1Qty);
  if (remove > 0) {
    await adjustAssemblyStock(sb, aid, WAREHOUSE_FROM_LOCATION_ID, -remove);
  }
}

async function stageRepairedUnitOnFloor2(sb, { row, qty, now }) {
  const floor2Id = await resolveWarehouseFloor2LocationId(sb);
  if (!floor2Id) throw new Error('Warehouse Floor 2 location is not configured.');

  const assemblyId = String(row.assembly_id || '').trim();
  if (!assemblyId) throw new Error('Return is missing product.');

  await clearFloor1RepairGhostQty(sb, assemblyId, qty);
  await adjustAssemblyStock(sb, assemblyId, floor2Id, qty);

  const { data: asmRow } = await sb
    .from('warehouse_assemblies')
    .select('metadata')
    .eq('id', assemblyId)
    .maybeSingle();
  const asmMeta = asmRow?.metadata || {};
  await sb.from('warehouse_assemblies').update({
    metadata: {
      ...asmMeta,
      floor2_wip: {
        kind: FLOOR2_WIP_KIND_REPAIR,
        return_order_id: String(row.id),
        return_number: row.return_number || null,
        staged_at: now,
      },
    },
    updated_at: now,
  }).eq('id', assemblyId);

  await recomputeWarehouseLocationStockServer(sb, floor2Id);
  await recomputeWarehouseLocationStockServer(sb, WAREHOUSE_FROM_LOCATION_ID);
}

/** Delivery app catalog: assemblies awaiting ship from Floor 2 after workshop repair complete. */
export async function listRepairFloor2DeliveriesForCatalog(sb) {
  const { listRepairDeliveriesForMobile } = await import('./warehouseDeliveryAdminQueue.js');
  return listRepairDeliveriesForMobile(sb);
}

export async function repairFloor2DeliveryAssemblyMap(sb) {
  const rows = await listRepairFloor2DeliveriesForCatalog(sb);
  return new Map(rows.map((row) => [String(row.assembly_id), row]));
}

export async function clearAssemblyFloor2RepairWip(sb, assemblyId, now = new Date().toISOString()) {
  const aid = String(assemblyId || '').trim();
  if (!aid) return;
  const { data: asmRow } = await sb
    .from('warehouse_assemblies')
    .select('metadata')
    .eq('id', aid)
    .maybeSingle();
  const asmMeta = asmRow?.metadata || {};
  if (!asmMeta.floor2_wip) return;
  const nextMeta = { ...asmMeta };
  delete nextMeta.floor2_wip;
  await sb.from('warehouse_assemblies').update({
    metadata: nextMeta,
    updated_at: now,
  }).eq('id', aid);
}

export async function finalizeRepairFloor2DeliveriesOnKitweAccept(sb, lines, {
  acceptedAt = new Date().toISOString(),
} = {}) {
  const returnIds = new Set();
  for (const line of lines || []) {
    if (line?.metadata?.floor2_repair_delivery !== true) continue;
    const returnOrderId = String(line.metadata?.return_order_id || '').trim();
    const assemblyId = String(line.metadata?.assembly_id || '').trim();
    const qty = Math.max(1, Number(line.quantity) || 1);
    if (!returnOrderId || !assemblyId) continue;
    returnIds.add(returnOrderId);
    await clearAssemblyFloor2RepairWip(sb, assemblyId, acceptedAt);
    await clearFloor1RepairGhostQty(sb, assemblyId, qty);
  }

  for (const returnOrderId of returnIds) {
    const { data: row } = await sb.from(RETURNS).select('*').eq('id', returnOrderId).maybeSingle();
    if (!row) continue;
    const prevMeta = row.metadata || {};
    if (prevMeta.kitwe_restored_at || prevMeta.customer_fulfilled_at) continue;

    const hasCustomer = returnRowHasCustomer(row);
    await sb.from(RETURNS).update({
      status: hasCustomer
        ? WAREHOUSE_RETURN_STATUSES.CUSTOMER_DELIVERED
        : WAREHOUSE_RETURN_STATUSES.SHIPPED,
      updated_at: acceptedAt,
      metadata: {
        ...prevMeta,
        floor1_awaiting_hassan: false,
        kitwe_restored_at: hasCustomer ? prevMeta.kitwe_restored_at : acceptedAt,
        customer_fulfilled_at: hasCustomer ? acceptedAt : prevMeta.customer_fulfilled_at,
        repair_delivered_via_floor2_at: acceptedAt,
        factory_stock_removed_at: acceptedAt,
      },
    }).eq('id', returnOrderId);
  }

  const floor2Id = await resolveWarehouseFloor2LocationId(sb);
  await recomputeWarehouseLocationStockServer(sb, WAREHOUSE_FROM_LOCATION_ID);
  if (floor2Id) await recomputeWarehouseLocationStockServer(sb, floor2Id);
}

function canWarehouseKitweReturnCreator(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (HASSAN_AWAD.emails.some((e) => e.toLowerCase() === email)) return true;
  const uid = String(user?.id || user?.uid || '').toLowerCase();
  if (uid === String(HASSAN_AWAD.id).toLowerCase()) return true;
  if (isLoginAccessAdmin(user?.email)) return true;
  if (canManageCatalog(user)) return true;
  return false;
}

export async function assertWarehouseReturnCreator(user) {
  if (!canWarehouseKitweReturnCreator(user)) {
    const err = new Error('Only Hassan Awad can create Kitwe returns.');
    err.status = 403;
    throw err;
  }
}

export async function assertWarehouseReturnProductionAccess(user, grant) {
  if (isWarehouseProductionKitweDeliveryAllowed(grant)) return;
  if (evaluateWarehouseProductionAppAccess(grant, user?.email)) return;
  if (evaluateCarpentryWorkshopAppAccess(grant, user?.email)) return;
  if (evaluatePaintingWorkshopAppAccess(grant, user?.email)) return;
  const err = new Error('Warehouse production access required.');
  err.status = 403;
  throw err;
}

function repairTimerMeta(meta = {}) {
  const m = meta && typeof meta === 'object' ? meta : {};
  return {
    accumulated_ms: Math.max(0, Number(m.repair_accumulated_ms) || 0),
    timer_started_at: m.repair_timer_started_at || null,
    paused: m.repair_timer_paused === true,
  };
}

function computeRepairElapsedMs(row, nowMs = Date.now()) {
  const meta = repairTimerMeta(row?.metadata);
  let ms = meta.accumulated_ms;
  if (
    row?.status === WAREHOUSE_RETURN_STATUSES.IN_PROGRESS
    && !meta.paused
    && meta.timer_started_at
  ) {
    const started = new Date(meta.timer_started_at).getTime();
    if (Number.isFinite(started)) ms += Math.max(0, nowMs - started);
  }
  if (ms > 0) return ms;
  const sec = returnOrderElapsedSeconds(row, nowMs);
  return sec != null ? sec * 1000 : 0;
}

function serializeReturnForClient(row) {
  const mapped = mapReturnRow(row);
  if (!mapped) return null;
  const dept = resolveReturnRepairDepartment(mapped);
  const timer = repairTimerMeta(mapped.metadata);
  let timer_status = 'ready';
  if (mapped.status === WAREHOUSE_RETURN_STATUSES.IN_PROGRESS) {
    timer_status = timer.paused ? 'paused' : 'running';
  } else if (
    mapped.status === WAREHOUSE_RETURN_STATUSES.COMPLETED
    || mapped.status === WAREHOUSE_RETURN_STATUSES.AWAITING_KITWE_ACCEPT
    || mapped.status === WAREHOUSE_RETURN_STATUSES.SHIPPED
    || mapped.status === WAREHOUSE_RETURN_STATUSES.CUSTOMER_DELIVERED
  ) {
    timer_status = 'completed';
  }
  return {
    ...mapped,
    repair_department: dept,
    timer_status,
    elapsed_ms: computeRepairElapsedMs(mapped),
    accumulated_ms: timer.accumulated_ms,
    timer_started_at: timer.timer_started_at,
    lifecycle_badge: returnOrderLifecycleBadge(mapped),
    manual_material_lines: Array.isArray(mapped.metadata?.manual_material_lines)
      ? mapped.metadata.manual_material_lines
      : [],
  };
}

function mapReturnRow(row) {
  if (!row) return null;
  return {
    ...row,
    quantity: Number(row.quantity) || 0,
  };
}

export async function listKitweReturnProductOptions(sb) {
  const [{ data: assemblies }, { data: inventory }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, family_sku, item_kind, metadata'),
    sb.from('warehouse_assembly_inventory').select('assembly_id, location_id, quantity'),
  ]);
  const kitweInventory = (inventory || []).filter(
    (row) => String(row.location_id) === KITWE_LOCATION_ID,
  );
  const products = buildKitweReturnProductOptions(assemblies || [], kitweInventory);
  return { products };
}

/** Quote customers for Hassan’s return form (same pool as Quotationer). */
export async function listReturnQuoteCustomers(sb, _user) {
  const { data, error } = await sb
    .from('quote_customers')
    .select('id, name, phone')
    .order('name');
  if (error) throw new Error(error.message || 'Failed to load quote customers.');
  return {
    customers: (data || []).map((row) => ({
      id: row.id,
      name: String(row.name || '').trim(),
      phone: String(row.phone || '').trim(),
    })).filter((row) => row.id && row.name),
  };
}

function expandReturnLinesToUnitRows(lines) {
  const unitLines = [];
  for (const line of lines || []) {
    const q = Math.max(1, Math.floor(Number(line.quantity) || 1));
    for (let i = 0; i < q; i += 1) {
      unitLines.push({
        reason: line.reason,
        reason_group: line.reason_group || null,
        leather_code: line.leather_code || null,
        quantity: 1,
      });
    }
  }
  return unitLines;
}

export async function createWarehouseReturnOrder(sb, body, user) {
  await assertWarehouseReturnCreator(user);

  const saleIdRaw = body.sale_id ?? body.saleId;
  if (saleIdRaw != null && String(saleIdRaw).trim() !== '') {
    return createWarehouseReturnOrdersFromReceipt(sb, body, user);
  }

  const assemblyIdGuess = String(body?.assembly_id || '').trim();
  const currentKitwe = assemblyIdGuess
    ? await getAssemblyStockQty(sb, assemblyIdGuess, KITWE_LOCATION_ID)
    : 0;
  const parsed = parseReturnCreateLines(body, { maxQty: currentKitwe });
  const unitLines = expandReturnLinesToUnitRows(parsed.lines);
  if (!unitLines.length) throw new Error('Return quantity must be at least 1.');

  const { data: assembly } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, item_kind')
    .eq('id', parsed.assemblyId)
    .maybeSingle();
  if (!assembly) throw new Error('Product not found.');
  if (!isWarehouseProductAssembly(assembly) || isWarehouseSetAssembly(assembly)) {
    throw new Error('Only Kitwe warehouse products (not sets) can be returned.');
  }

  let customerName = '';
  let customerPhone = '';
  const customerId = body.customer_id ? String(body.customer_id).trim() : '';
  if (customerId) {
    const { data: cust } = await sb
      .from('quote_customers')
      .select('id, name, phone')
      .eq('id', customerId)
      .maybeSingle();
    if (cust) {
      customerName = String(cust.name || '').trim();
      customerPhone = String(cust.phone || '').trim();
    }
  }

  const returnNumber = await allocateWarehouseReturnNumber();
  const now = new Date().toISOString();
  const batchCount = unitLines.length;

  await adjustAssemblyStock(sb, parsed.assemblyId, KITWE_LOCATION_ID, -parsed.totalQty);

  const inserted = [];
  try {
    for (let i = 0; i < unitLines.length; i += 1) {
      const unit = unitLines[i];
      const id = newUuid();
      const row = {
        id,
        return_number: returnNumber,
        assembly_id: parsed.assemblyId,
        assembly_name: assembly.name,
        assembly_sku: assembly.family_sku || null,
        reason: unit.reason,
        reason_group: unit.reason_group || null,
        leather_code: unit.leather_code,
        quantity: 1,
        customer_id: customerId || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        status: WAREHOUSE_RETURN_STATUSES.SUBMITTED,
        created_at: now,
        updated_at: now,
        created_by_id: user?.id || user?.uid || null,
        created_by_email: user?.email || null,
        created_by_name: user?.user_metadata?.full_name || user?.full_name || HASSAN_AWAD.displayName,
        metadata: {
          kitwe_deducted_at: now,
          batch_line_index: i + 1,
          batch_line_count: batchCount,
          reason_group: unit.reason_group || null,
        },
      };
      const { error } = await sb.from(RETURNS).insert(row);
      if (error) throw new Error(error.message || 'Failed to save return order.');
      const mapped = mapReturnRow(row);
      inserted.push(mapped);
      queueProductionReturnPush(mapped);
    }
  } catch (err) {
    await adjustAssemblyStock(sb, parsed.assemblyId, KITWE_LOCATION_ID, parsed.totalQty);
    throw err;
  }

  return {
    return_number: returnNumber,
    return_orders: inserted,
    return_order: inserted[0] || null,
  };
}

async function createWarehouseReturnOrdersFromReceipt(sb, body, user) {
  const saleId = body.sale_id ?? body.saleId;
  const detail = await getPosSaleDetailForStorage(sb, user, { sale_id: saleId });
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (!rawLines.length) throw new Error('Select at least one receipt line.');

  let customerName = String(detail.sale.customer_name || '').trim();
  let customerPhone = String(detail.sale.customer_phone || '').trim();
  let customerId = detail.sale.customer_id ? String(detail.sale.customer_id).trim() : '';
  const bodyCustomerId = body.customer_id ? String(body.customer_id).trim() : '';
  if (bodyCustomerId) {
    customerId = bodyCustomerId;
    const { data: cust } = await sb
      .from('quote_customers')
      .select('id, name, phone')
      .eq('id', bodyCustomerId)
      .maybeSingle();
    if (cust) {
      customerName = String(cust.name || '').trim();
      customerPhone = String(cust.phone || '').trim();
    }
  }
  if (!customerName && !customerId) {
    throw new Error('Customer returns require a customer and POS receipt lines.');
  }

  const unitLines = [];
  for (const raw of rawLines) {
    const saleItemId = raw.sale_item_id ?? raw.saleItemId;
    const line = detail.items.find((i) => String(i.id) === String(saleItemId));
    if (!line) throw new Error('Receipt line not found.');
    const qty = Math.max(1, Math.floor(Number(raw.quantity) || 1));
    if (qty > line.quantity) {
      throw new Error(`Cannot return more than sold on ${line.display_name} (${line.quantity}).`);
    }
    const reason = normalizeWarehouseReturnReason(raw.reason);
    if (!reason) throw new Error(`Choose a return reason for ${line.display_name}.`);
    const reason_group = String(raw.reason_group || raw.reasonGroup || '').trim() || null;
    const leather_code = String(raw.leather_code || '').trim() || null;
    const assembly = await resolveAssemblyForPosSaleLine(sb, line);
    for (let i = 0; i < qty; i += 1) {
      unitLines.push({
        assembly,
        sale_item_id: line.id,
        reason,
        reason_group,
        leather_code,
      });
    }
  }

  const returnNumber = await allocateWarehouseReturnNumber();
  const now = new Date().toISOString();
  const batchCount = unitLines.length;
  const receiptNumber = detail.sale.receipt_number;

  const stockDeltas = new Map();
  for (const unit of unitLines) {
    const key = unit.assembly.id;
    stockDeltas.set(key, (stockDeltas.get(key) || 0) + 1);
  }
  for (const [assemblyId, need] of stockDeltas.entries()) {
    const kitweQty = await getAssemblyStockQty(sb, assemblyId, KITWE_LOCATION_ID);
    if (kitweQty < need) {
      throw new Error(`Insufficient Kitwe stock for this receipt (need ${need}, have ${kitweQty}).`);
    }
  }
  for (const [assemblyId, need] of stockDeltas.entries()) {
    await adjustAssemblyStock(sb, assemblyId, KITWE_LOCATION_ID, -need);
  }

  const inserted = [];
  try {
    for (let i = 0; i < unitLines.length; i += 1) {
      const unit = unitLines[i];
      const assembly = unit.assembly;
      const id = newUuid();
      const row = {
        id,
        return_number: returnNumber,
        assembly_id: assembly.id,
        assembly_name: assembly.name,
        assembly_sku: assembly.family_sku || null,
        reason: unit.reason,
        reason_group: unit.reason_group || null,
        leather_code: unit.leather_code,
        quantity: 1,
        customer_id: customerId || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        pos_sale_id: saleId,
        pos_sale_item_id: unit.sale_item_id,
        status: WAREHOUSE_RETURN_STATUSES.SUBMITTED,
        created_at: now,
        updated_at: now,
        created_by_id: user?.id || user?.uid || null,
        created_by_email: user?.email || null,
        created_by_name: user?.user_metadata?.full_name || user?.full_name || HASSAN_AWAD.displayName,
        metadata: {
          kitwe_deducted_at: now,
          batch_line_index: i + 1,
          batch_line_count: batchCount,
          reason_group: unit.reason_group || null,
          pos_sale_id: saleId,
          pos_sale_item_id: unit.sale_item_id,
          receipt_number: receiptNumber,
        },
      };
      const { error } = await sb.from(RETURNS).insert(row);
      if (error) throw new Error(error.message || 'Failed to save return order.');
      const mapped = mapReturnRow(row);
      inserted.push(mapped);
      queueProductionReturnPush(mapped);
    }
  } catch (err) {
    for (const [assemblyId, need] of stockDeltas.entries()) {
      await adjustAssemblyStock(sb, assemblyId, KITWE_LOCATION_ID, need);
    }
    throw err;
  }

  return {
    return_number: returnNumber,
    return_orders: inserted,
    return_order: inserted[0] || null,
  };
}

async function queueProductionReturnPush(order) {
  try {
    const { notifyProductionNewReturnOrder } = await import('./productionExpoPush.js');
    await notifyProductionNewReturnOrder(order);
  } catch (err) {
    console.warn('[warehouseReturnOrders] push notify failed:', err?.message || err);
  }
}

export async function listWarehouseReturnOrders(sb, {
  forProduction = false,
  trackageOnly = false,
  repairDepartment = null,
  hassanOnly = false,
  limit = 200,
} = {}) {
  const cap = Math.min(5000, Math.max(1, Number(limit) || 200));
  let query = sb.from(RETURNS).select('*').order('created_at', { ascending: false }).limit(cap);
  if (trackageOnly) {
    // Trackage lists every return job (all statuses) for Hassan — not production queue filters.
  } else if (forProduction) {
    query = query.in('status', [
      WAREHOUSE_RETURN_STATUSES.SUBMITTED,
      WAREHOUSE_RETURN_STATUSES.IN_PROGRESS,
      WAREHOUSE_RETURN_STATUSES.COMPLETED,
    ]);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to load returns.');
  let rows = (data || []).map(mapReturnRow);
  if (hassanOnly) {
    rows = rows.filter(isReturnCreatedByHassan);
  }
  if (repairDepartment) {
    rows = rows.filter((r) => returnMatchesRepairDepartment(r, repairDepartment));
    rows = rows.filter((r) => (
      r.status === WAREHOUSE_RETURN_STATUSES.SUBMITTED
      || r.status === WAREHOUSE_RETURN_STATUSES.IN_PROGRESS
    ));
  }
  return { return_orders: rows.map((r) => serializeReturnForClient(r)) };
}

export async function acceptWarehouseReturnOrder(sb, body, user) {
  const id = String(body.return_order_id || body.id || '').trim();
  if (!id) throw new Error('return_order_id is required.');
  const { data: row } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.SUBMITTED) {
    throw new Error('Return is not waiting to be accepted.');
  }
  const now = new Date().toISOString();
  const prevMeta = row.metadata || {};
  const { error } = await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.IN_PROGRESS,
    accepted_at: now,
    work_started_at: now,
    accepted_by_email: user?.email || null,
    updated_at: now,
    metadata: {
      ...prevMeta,
      repair_accumulated_ms: 0,
      repair_timer_started_at: now,
      repair_timer_paused: false,
    },
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to accept return.');
  const { data: updated } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  return { return_order: serializeReturnForClient(updated) };
}

export async function pauseWarehouseReturnOrder(sb, body, user) {
  void user;
  const id = String(body.return_order_id || body.id || '').trim();
  if (!id) throw new Error('return_order_id is required.');
  const { data: row } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.IN_PROGRESS) throw new Error('Return is not in progress.');
  const meta = repairTimerMeta(row.metadata);
  if (meta.paused) return { return_order: serializeReturnForClient(row) };
  const nowMs = Date.now();
  const accumulated = computeRepairElapsedMs(row, nowMs);
  const now = new Date(nowMs).toISOString();
  const { error } = await sb.from(RETURNS).update({
    updated_at: now,
    metadata: {
      ...(row.metadata || {}),
      repair_accumulated_ms: accumulated,
      repair_timer_started_at: null,
      repair_timer_paused: true,
    },
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to pause return.');
  const { data: updated } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  return { return_order: serializeReturnForClient(updated) };
}

export async function resumeWarehouseReturnOrder(sb, body, user) {
  void user;
  const id = String(body.return_order_id || body.id || '').trim();
  if (!id) throw new Error('return_order_id is required.');
  const { data: row } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.IN_PROGRESS) throw new Error('Return is not in progress.');
  const meta = repairTimerMeta(row.metadata);
  if (!meta.paused && meta.timer_started_at) {
    return { return_order: serializeReturnForClient(row) };
  }
  const now = new Date().toISOString();
  const { error } = await sb.from(RETURNS).update({
    updated_at: now,
    metadata: {
      ...(row.metadata || {}),
      repair_timer_started_at: now,
      repair_timer_paused: false,
    },
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to resume return.');
  const { data: updated } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  return { return_order: serializeReturnForClient(updated) };
}

export async function completeWarehouseReturnOrder(sb, body, user) {
  const id = String(body.return_order_id || body.id || '').trim();
  if (!id) throw new Error('return_order_id is required.');

  const { data: row } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.IN_PROGRESS) {
    throw new Error('Return must be in progress before completion.');
  }

  const qty = Math.max(1, Number(row.quantity) || 1);
  const prevMeta = row.metadata || {};
  const now = new Date().toISOString();
  const finalMs = computeRepairElapsedMs(row, new Date(now).getTime());
  const durationSeconds = Math.max(0, Math.floor(finalMs / 1000));

  const { markRepairWorkCompleteAwaitingDriver } = await import('./warehouseDeliveryAdminQueue.js');
  const adminMeta = await markRepairWorkCompleteAwaitingDriver(sb, row, { now });
  const nextMeta = {
    ...adminMeta,
    repair_accumulated_ms: finalMs,
    repair_timer_started_at: null,
    repair_timer_paused: false,
  };

  const { error } = await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.COMPLETED,
    work_completed_at: now,
    duration_seconds: durationSeconds,
    complete_driver_id: null,
    complete_driver_name: null,
    complete_signature_url: null,
    complete_dispatched_by: user?.user_metadata?.full_name || user?.full_name || user?.email || null,
    metadata: nextMeta,
    updated_at: now,
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to complete return.');

  const { data: updated } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  return {
    return_order: serializeReturnForClient(updated),
    completed_at: now,
    delivery_admin_awaiting_driver: true,
  };
}

function returnRowHasCustomer(row) {
  return Boolean(String(row?.customer_name || '').trim());
}

function buildReturnPrintGroups(row) {
  const qty = Math.max(1, Number(row.quantity) || 1);
  return [{
    assembly_name: row.assembly_name,
    units: qty,
    elapsed_display: row.duration_seconds != null
      ? `${Math.floor(row.duration_seconds / 3600)}h ${Math.floor((row.duration_seconds % 3600) / 60)}m`
      : '—',
    lines: row.reason ? [{ name: row.reason, kind: 'reason' }] : [],
  }];
}

async function resolveReturnCustomerDeliveryPdfUrl({
  body,
  session,
  row,
  user,
  driverName,
  now,
}) {
  let pdfUrl = String(body.return_note_pdf_url || body.pdf_url || '').trim() || null;
  if (pdfUrl) return pdfUrl;

  const clientB64 = String(
    body.return_note_pdf_base64 || body.returnNotePdfBase64 || '',
  ).trim();
  if (clientB64) {
    pdfUrl = await uploadWarehouseReturnDeliveryNotePdf(session.id, clientB64);
    if (pdfUrl) return pdfUrl;
  }

  const pdfBase64 = buildWarehouseDeliveryNotePdfBase64({
    session: {
      ...session,
      submitted_at: now,
      metadata: {
        ...(session.metadata || {}),
        driver_name: driverName,
      },
    },
    printGroups: buildReturnPrintGroups(row),
    documentKind: 'return_customer_delivery',
    customerName: row.customer_name,
    customerPhone: row.customer_phone || '',
    driverNameOverride: driverName,
    dispatchedByOverride: user?.user_metadata?.full_name || user?.full_name || user?.email || '',
    submittedAtOverride: now,
  });
  return uploadWarehouseReturnDeliveryNotePdf(session.id, pdfBase64);
}

async function insertReturnDeliverySession(sb, {
  row,
  deliveryNumber,
  user,
  sessionMeta,
  toLocationId = WAREHOUSE_TO_LOCATION_ID,
}) {
  const now = new Date().toISOString();
  const sessionId = newUuid();
  const qty = Math.max(1, Number(row.quantity) || 1);
  const sessionRow = {
    id: sessionId,
    delivery_number: deliveryNumber,
    from_location: WAREHOUSE_FROM_LOCATION_ID,
    to_location: toLocationId,
    status: 'draft',
    created_at: now,
    transfer_datetime: now,
    total_qty: qty,
    created_by_email: user?.email || null,
    created_by_name: user?.user_metadata?.full_name || user?.full_name || null,
    metadata: sessionMeta,
  };
  const { error: sessErr } = await sb.from('warehouse_delivery_sessions').insert(sessionRow);
  if (sessErr) throw new Error(sessErr.message || 'Failed to open return delivery session.');

  const entryId = newUuid();
  const { error: entErr } = await sb.from('warehouse_delivery_entries').insert({
    id: entryId,
    session_id: sessionId,
    kind: 'product',
    combo_id: newUuid(),
    product_name: row.assembly_name,
    quantity: qty,
    edited_quantity: qty,
    metadata: {
      assembly_id: row.assembly_id,
      assembly_name: row.assembly_name,
      return_order_id: row.id,
      return_number: row.return_number,
      finished_unit: true,
    },
  });
  if (entErr) throw new Error(entErr.message || 'Failed to add return delivery line.');

  return { sessionId, deliveryNumber, printGroups: buildReturnPrintGroups(row), qty };
}

export async function prepareReturnShipmentSession(sb, body, user) {
  const id = String(body.return_order_id || '').trim();
  if (!id) throw new Error('return_order_id is required.');
  const { data: row } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.COMPLETED) {
    if (row.status === WAREHOUSE_RETURN_STATUSES.AWAITING_KITWE_ACCEPT) {
      throw new Error('This unit is already in transit to Kitwe — waiting for Hassan to accept on Deliveries.');
    }
    throw new Error('Return must be completed before shipping back to Kitwe.');
  }
  const shipMeta = row.metadata || {};
  if (shipMeta.kitwe_restored_at || shipMeta.customer_fulfilled_at) {
    throw new Error('This return unit is already fulfilled.');
  }

  const deliveryNumber = await allocateWarehouseReturnDeliveryNumber({ hasCustomer: false });
  const { sessionId, printGroups, qty } = await insertReturnDeliverySession(sb, {
    row,
    deliveryNumber,
    user,
    sessionMeta: {
      source: 'warehouse_return_shipment',
      return_order_id: id,
      return_number: row.return_number,
      is_return_shipment: true,
      return_delivery_note_kind: 'whr',
      elapsed_seconds: row.duration_seconds,
    },
  });

  const groups = [{
    assembly_id: row.assembly_id,
    assembly_name: row.assembly_name,
    units: qty,
    scans: [],
  }];

  return {
    session_id: sessionId,
    delivery_number: deliveryNumber,
    print_groups: printGroups,
    groups,
    return_order: mapReturnRow(row),
    document_kind: 'return_shipment',
  };
}

export async function prepareReturnCustomerDeliverySession(sb, body, user) {
  const id = String(body.return_order_id || '').trim();
  if (!id) throw new Error('return_order_id is required.');
  const { data: row } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.COMPLETED) {
    throw new Error('Return must be completed before customer delivery.');
  }
  if (!returnRowHasCustomer(row)) {
    throw new Error('This return has no customer — use Kitwe shipment or Floor 1 stock instead.');
  }
  const meta = row.metadata || {};
  if (meta.kitwe_restored_at || meta.customer_fulfilled_at) {
    throw new Error('This return unit is already fulfilled.');
  }

  const deliveryNumber = await allocateWarehouseReturnDeliveryNumber({ hasCustomer: true });
  const { sessionId, printGroups, qty } = await insertReturnDeliverySession(sb, {
    row,
    deliveryNumber,
    user,
    toLocationId: WAREHOUSE_FROM_LOCATION_ID,
    sessionMeta: {
      source: 'warehouse_return_customer_delivery',
      return_order_id: id,
      return_number: row.return_number,
      is_return_customer_delivery: true,
      return_delivery_note_kind: 'cr',
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      elapsed_seconds: row.duration_seconds,
    },
  });

  return {
    session_id: sessionId,
    delivery_number: deliveryNumber,
    print_groups: printGroups,
    groups: [{
      assembly_id: row.assembly_id,
      assembly_name: row.assembly_name,
      units: qty,
      scans: [],
    }],
    return_order: mapReturnRow(row),
    document_kind: 'return_customer_delivery',
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
  };
}

export async function submitReturnCustomerDelivery(sb, body, user, uploadSignature) {
  const { resolveMobileDeliveryDriver } = await import('./resolveMobileDeliveryDriver.js');
  const sessionId = String(body.session_id || '').trim();
  const { driverName, driverId, customerDriverName, customerDriverPhone, customerDriverActive } = resolveMobileDeliveryDriver(body);
  if (!sessionId) throw new Error('session_id is required.');

  const { data: session } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) throw new Error('Delivery session not found.');
  if (String(session.status) !== 'draft') throw new Error('Delivery session is not open.');
  if (session.metadata?.source !== 'warehouse_return_customer_delivery') {
    throw new Error('Not a return customer delivery session.');
  }
  const returnOrderId = session.metadata?.return_order_id;
  const { data: row } = await sb.from(RETURNS).select('*').eq('id', returnOrderId).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.COMPLETED) {
    throw new Error('Return must be completed before customer delivery.');
  }
  const prevMeta = row.metadata || {};
  if (prevMeta.customer_fulfilled_at || prevMeta.kitwe_restored_at) {
    throw new Error('This return unit is already fulfilled.');
  }
  const qty = Math.max(1, Number(row.quantity) || 1);
  const signatureUrl = await uploadSignature(sessionId, body.signature_png_base64);
  const now = new Date().toISOString();
  const pdfUrl = await resolveReturnCustomerDeliveryPdfUrl({
    body,
    session,
    row,
    user,
    driverName,
    now,
  });

  await adjustAssemblyStock(sb, row.assembly_id, WAREHOUSE_FROM_LOCATION_ID, -qty);

  await sb.from('warehouse_delivery_sessions').update({
    status: 'submitted',
    submitted_at: now,
    total_qty: qty,
    pdf_url: pdfUrl,
    metadata: {
      ...(session.metadata || {}),
      driver_id: driverId || null,
      driver_name: driverName,
      driver_signature_url: signatureUrl,
      submitted_by: user?.email || null,
      customer_driver_name: customerDriverActive ? customerDriverName : null,
      customer_driver_phone: customerDriverActive ? customerDriverPhone : null,
      customer_driver_signed: customerDriverActive,
    },
  }).eq('id', sessionId);

  await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.CUSTOMER_DELIVERED,
    outbound_delivery_number: session.delivery_number || null,
    outbound_delivery_session_id: sessionId || null,
    updated_at: now,
    metadata: {
      ...prevMeta,
      customer_fulfilled_at: now,
      factory_stock_removed_at: now,
      return_delivery_note_number: session.delivery_number,
      return_note_pdf_url: pdfUrl,
    },
  }).eq('id', returnOrderId);

  let label_print = null;
  try {
    const { printWarehouseReturnCustomerLabel } = await import('./warehouseReturnCustomerLabelPrint.js');
    let sku = String(row.assembly_sku || '').trim();
    if (!sku && row.assembly_id) {
      const { data: asm } = await sb
        .from('warehouse_assemblies')
        .select('family_sku')
        .eq('id', row.assembly_id)
        .maybeSingle();
      sku = String(asm?.family_sku || '').trim() || 'REPAIR';
    }
    label_print = await printWarehouseReturnCustomerLabel(sb, {
      name: row.assembly_name,
      sku,
      customerName: row.customer_name,
      customerPhone: row.customer_phone || '',
      qty: row.quantity,
      returnNotePdfUrl: pdfUrl,
      printedBy: user?.email || user?.full_name || 'Production',
      printedAt: new Date(now),
    });
  } catch (labelErr) {
    console.warn('[submitReturnCustomerDelivery] label print failed:', labelErr?.message || labelErr);
  }

  return {
    session_id: sessionId,
    delivery_number: session.delivery_number,
    driver_signature_url: signatureUrl,
    submitted_at: now,
    return_order: serializeReturnForClient(await getWarehouseReturnOrder(sb, returnOrderId)),
    label_print,
    document_kind: 'return_customer_delivery',
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    print_groups: buildReturnPrintGroups(row),
  };
}

export async function markReturnOrderShipped(sb, returnOrderId, deliveryNumber, sessionId) {
  const id = String(returnOrderId || '').trim();
  if (!id) return;
  const now = new Date().toISOString();
  await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.SHIPPED,
    outbound_delivery_number: deliveryNumber || null,
    outbound_delivery_session_id: sessionId || null,
    shipped_at: now,
    updated_at: now,
  }).eq('id', id);
}

export async function submitReturnShipment(sb, body, user, uploadSignature) {
  const { resolveMobileDeliveryDriver } = await import('./resolveMobileDeliveryDriver.js');
  const sessionId = String(body.session_id || '').trim();
  const { driverName, driverId, customerDriverName, customerDriverPhone, customerDriverActive } = resolveMobileDeliveryDriver(body);
  if (!sessionId) throw new Error('session_id is required.');

  const { data: session } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) throw new Error('Shipment session not found.');
  if (String(session.status) !== 'draft') throw new Error('Shipment session is not open.');
  const returnOrderId = session.metadata?.return_order_id;
  if (!returnOrderId) throw new Error('Not a return shipment session.');

  const { data: row } = await sb.from(RETURNS).select('*').eq('id', returnOrderId).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.COMPLETED) {
    throw new Error('Return must be completed before shipping.');
  }
  const shipMeta = row.metadata || {};
  if (shipMeta.kitwe_restored_at || shipMeta.customer_fulfilled_at) {
    throw new Error('This return unit is already fulfilled.');
  }
  const qty = Math.max(1, Number(row.quantity) || 1);

  const signatureUrl = await uploadSignature(sessionId, body.signature_png_base64);
  const now = new Date().toISOString();

  await adjustAssemblyStock(sb, row.assembly_id, WAREHOUSE_FROM_LOCATION_ID, -qty);

  await sb.from('warehouse_delivery_sessions').update({
    status: 'submitted',
    submitted_at: now,
    total_qty: qty,
    metadata: {
      ...(session.metadata || {}),
      driver_id: driverId || null,
      driver_name: driverName,
      driver_signature_url: signatureUrl,
      submitted_by: user?.email || null,
      customer_driver_name: customerDriverActive ? customerDriverName : null,
      customer_driver_phone: customerDriverActive ? customerDriverPhone : null,
      customer_driver_signed: customerDriverActive,
    },
  }).eq('id', sessionId);

  await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.AWAITING_KITWE_ACCEPT,
    outbound_delivery_number: session.delivery_number || null,
    outbound_delivery_session_id: sessionId || null,
    shipped_at: now,
    updated_at: now,
    metadata: {
      ...(row.metadata || {}),
      floor1_awaiting_hassan: false,
      in_transit_to_kitwe_at: now,
      kitwe_restored_at: null,
    },
  }).eq('id', returnOrderId);

  return {
    session_id: sessionId,
    delivery_number: session.delivery_number,
    driver_signature_url: signatureUrl,
    submitted_at: now,
    return_order: mapReturnRow(await getWarehouseReturnOrder(sb, returnOrderId)),
  };
}

export async function getWarehouseReturnOrder(sb, id) {
  const { data } = await sb.from(RETURNS).select('*').eq('id', String(id)).maybeSingle();
  return mapReturnRow(data);
}

/** Customer pickup label — deduct factory stock; do not restore Kitwe. */
export async function printReturnCustomerPickupLabel(sb, body, user) {
  const id = String(body.return_order_id || body.id || '').trim();
  if (!id) throw new Error('return_order_id is required.');

  const { data: row } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.COMPLETED) {
    throw new Error('Customer pickup label is available after the return timer is stopped (complete the return first).');
  }
  const prevMeta = row.metadata || {};
  if (prevMeta.customer_fulfilled_at || prevMeta.kitwe_restored_at) {
    throw new Error('This return unit is already fulfilled.');
  }
  if (!prevMeta.factory_stock_added_at) {
    throw new Error('Factory stock was not recorded — complete the return first.');
  }
  const qty = Math.max(1, Number(row.quantity) || 1);
  const customerName = String(row.customer_name || '').trim();
  if (!customerName) throw new Error('This return has no customer — label not available.');

  let sku = String(row.assembly_sku || '').trim();
  if (!sku && row.assembly_id) {
    const { data: asm } = await sb
      .from('warehouse_assemblies')
      .select('family_sku')
      .eq('id', row.assembly_id)
      .maybeSingle();
    sku = String(asm?.family_sku || '').trim();
  }
  if (!sku) throw new Error('Product SKU missing — cannot print label.');

  const { printWarehouseReturnCustomerLabel } = await import('./warehouseReturnCustomerLabelPrint.js');
  const printedAt = new Date();
  const result = await printWarehouseReturnCustomerLabel(sb, {
    name: row.assembly_name,
    sku,
    customerName,
    customerPhone: row.customer_phone || '',
    qty: row.quantity,
    printedBy: user?.email || user?.full_name || 'Production',
    printedAt,
  });

  const now = printedAt.toISOString();
  await adjustAssemblyStock(sb, row.assembly_id, WAREHOUSE_FROM_LOCATION_ID, -qty);

  await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.CUSTOMER_DELIVERED,
    updated_at: now,
    metadata: {
      ...(row.metadata || {}),
      customer_pickup_label_printed_at: now,
      customer_pickup_label_copies: result.copies,
      customer_fulfilled_at: now,
      factory_stock_removed_at: now,
    },
  }).eq('id', id);

  return {
    return_order_id: id,
    label_print: result,
    printed_at: now,
  };
}

/** Hassan accepted a WHR return shipment on /warehouse-deliveries — restore Kitwe stock on the linked return order. */
export async function finalizeReturnShipmentOnKitweAccept(sb, session, { acceptedAt = new Date().toISOString() } = {}) {
  if (session?.metadata?.is_return_shipment !== true) return null;
  const returnOrderId = String(session.metadata?.return_order_id || '').trim();
  if (!returnOrderId) return null;

  const { data: row } = await sb.from(RETURNS).select('*').eq('id', returnOrderId).maybeSingle();
  if (!row) return null;
  const prevMeta = row.metadata || {};
  if (prevMeta.kitwe_restored_at) return mapReturnRow(row);

  await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.SHIPPED,
    updated_at: acceptedAt,
    metadata: {
      ...prevMeta,
      kitwe_restored_at: acceptedAt,
      floor1_awaiting_hassan: false,
      hassan_accepted_at: acceptedAt,
    },
  }).eq('id', returnOrderId);

  const { data: updated } = await sb.from(RETURNS).select('*').eq('id', returnOrderId).maybeSingle();
  return mapReturnRow(updated);
}
