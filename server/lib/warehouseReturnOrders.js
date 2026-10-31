import { newUuid } from './uuid.js';
import { allocateWarehouseReturnNumber } from './warehouseReturnNumber.js';
import { adjustAssemblyStock, getAssemblyStockQty } from './warehouseReturnStock.js';
import { allocateWarehouseDeliveryNumber } from './warehouseDeliveryNumber.js';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
} from '../../src/utils/warehouseDelivery.js';
import { WAREHOUSE_RETURN_REASON_GROUPS } from '../../src/utils/warehouseReturnReasons.js';
import {
  parseReturnCreateLines,
  WAREHOUSE_RETURN_STATUSES,
} from '../../src/utils/warehouseReturnOrder.js';
import { isWarehouseProductAssembly } from '../../src/utils/warehouseCatalogHierarchy.js';
import { isWarehouseSetAssembly } from '../../src/utils/warehouseSetMath.js';
import { KITWE_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { HASSAN_AWAD, canManageCatalog } from '../../src/accessControl.js';
import { buildKitweReturnProductOptions } from '../../src/utils/kitweSetStock.js';
import { isLoginAccessAdmin } from './loginAccess.js';
import {
  isWarehouseProductionKitweDeliveryAllowed,
} from '../../src/mobile/mobileAccessManifest.js';

const RETURNS = 'warehouse_return_orders';

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
  const err = new Error('Warehouse production access required.');
  err.status = 403;
  throw err;
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
        leather_code: line.leather_code || null,
        quantity: 1,
      });
    }
  }
  return unitLines;
}

export async function createWarehouseReturnOrder(sb, body, user) {
  await assertWarehouseReturnCreator(user);

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

async function queueProductionReturnPush(order) {
  try {
    const { notifyProductionNewReturnOrder } = await import('./productionExpoPush.js');
    await notifyProductionNewReturnOrder(order);
  } catch (err) {
    console.warn('[warehouseReturnOrders] push notify failed:', err?.message || err);
  }
}

export async function listWarehouseReturnOrders(sb, { forProduction = false, trackageOnly = false } = {}) {
  let query = sb.from(RETURNS).select('*').order('created_at', { ascending: false }).limit(200);
  if (forProduction && !trackageOnly) {
    query = query.in('status', [
      WAREHOUSE_RETURN_STATUSES.SUBMITTED,
      WAREHOUSE_RETURN_STATUSES.IN_PROGRESS,
      WAREHOUSE_RETURN_STATUSES.COMPLETED,
    ]);
  }
  if (trackageOnly) {
    query = query.in('status', [
      WAREHOUSE_RETURN_STATUSES.COMPLETED,
      WAREHOUSE_RETURN_STATUSES.SHIPPED,
      WAREHOUSE_RETURN_STATUSES.CUSTOMER_DELIVERED,
    ]);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to load returns.');
  return { return_orders: (data || []).map(mapReturnRow) };
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
  const { error } = await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.IN_PROGRESS,
    accepted_at: now,
    work_started_at: now,
    accepted_by_email: user?.email || null,
    updated_at: now,
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to accept return.');
  const { data: updated } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  return { return_order: mapReturnRow(updated) };
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
  const started = row.work_started_at || row.accepted_at;
  const durationSeconds = started
    ? Math.max(0, Math.floor((new Date(now).getTime() - new Date(started).getTime()) / 1000))
    : null;

  if (!prevMeta.factory_stock_added_at) {
    await adjustAssemblyStock(sb, row.assembly_id, WAREHOUSE_FROM_LOCATION_ID, qty);
  }

  const { error } = await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.COMPLETED,
    work_completed_at: now,
    duration_seconds: durationSeconds,
    complete_driver_id: null,
    complete_driver_name: null,
    complete_signature_url: null,
    complete_dispatched_by: user?.user_metadata?.full_name || user?.full_name || user?.email || null,
    metadata: {
      ...prevMeta,
      factory_stock_added_at: prevMeta.factory_stock_added_at || now,
      ready_for_shipment: true,
    },
    updated_at: now,
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to complete return.');

  const { data: updated } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  return { return_order: mapReturnRow(updated), completed_at: now };
}

export async function prepareReturnShipmentSession(sb, body, user) {
  const id = String(body.return_order_id || '').trim();
  if (!id) throw new Error('return_order_id is required.');
  const { data: row } = await sb.from(RETURNS).select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Return order not found.');
  if (row.status !== WAREHOUSE_RETURN_STATUSES.COMPLETED) {
    throw new Error('Return must be completed before shipping back to Kitwe.');
  }
  const shipMeta = row.metadata || {};
  if (shipMeta.kitwe_restored_at || shipMeta.customer_fulfilled_at) {
    throw new Error('This return unit is already fulfilled.');
  }

  const deliveryNumber = await allocateWarehouseDeliveryNumber();
  const now = new Date().toISOString();
  const sessionId = newUuid();
  const qty = Math.max(1, Number(row.quantity) || 1);

  const sessionRow = {
    id: sessionId,
    delivery_number: deliveryNumber,
    from_location: WAREHOUSE_FROM_LOCATION_ID,
    to_location: WAREHOUSE_TO_LOCATION_ID,
    status: 'draft',
    created_at: now,
    transfer_datetime: now,
    total_qty: qty,
    created_by_email: user?.email || null,
    created_by_name: user?.user_metadata?.full_name || user?.full_name || null,
    metadata: {
      source: 'warehouse_return_shipment',
      return_order_id: id,
      return_number: row.return_number,
      is_return_shipment: true,
      elapsed_seconds: row.duration_seconds,
    },
  };
  const { error: sessErr } = await sb.from('warehouse_delivery_sessions').insert(sessionRow);
  if (sessErr) throw new Error(sessErr.message || 'Failed to open return shipment session.');

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
      return_order_id: id,
      return_number: row.return_number,
    },
  });
  if (entErr) throw new Error(entErr.message || 'Failed to add return shipment line.');

  const printGroups = [{
    assembly_name: row.assembly_name,
    units: qty,
    elapsed_display: row.duration_seconds != null
      ? `${Math.floor(row.duration_seconds / 3600)}h ${Math.floor((row.duration_seconds % 3600) / 60)}m`
      : '—',
    lines: row.reason ? [{ name: row.reason, kind: 'reason' }] : [],
  }];

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
  const sessionId = String(body.session_id || '').trim();
  const driverName = String(body.driver_name || '').trim();
  const driverId = String(body.driver_id || '').trim();
  if (!sessionId) throw new Error('session_id is required.');
  if (!driverName) throw new Error('Driver is required.');

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
  await adjustAssemblyStock(sb, row.assembly_id, KITWE_LOCATION_ID, qty);

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
    },
  }).eq('id', sessionId);

  await sb.from(RETURNS).update({
    status: WAREHOUSE_RETURN_STATUSES.SHIPPED,
    outbound_delivery_number: session.delivery_number || null,
    outbound_delivery_session_id: sessionId || null,
    shipped_at: now,
    updated_at: now,
    metadata: {
      ...(row.metadata || {}),
      kitwe_restored_at: now,
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
