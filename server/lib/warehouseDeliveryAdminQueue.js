import {
  DELIVERY_ADMIN_KIND,
  DELIVERY_ADMIN_STAGE,
  parseWarehouseReturnMetadata,
  repairEligibleForMobileDeliveryQueue,
} from '../../src/utils/warehouseDeliveryAdminQueue.js';
import { WAREHOUSE_RETURN_STATUSES } from '../../src/utils/warehouseReturnOrder.js';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
  deliveryEntrySentToCustomer,
} from '../../src/utils/warehouseDelivery.js';

async function returnStockMutations() {
  return import('./warehouseReturnStock.js');
}

const RETURNS = 'warehouse_return_orders';
const CARPENTRY_JOBS = 'carpentry_production_jobs';
const UPHOLSTERY_JOBS = 'upholstery_production_jobs';
const PAINTING_JOBS = 'painting_production_jobs';
const QUOTE_ROUTING = 'quote_production_routing';
const ASSEMBLIES = 'warehouse_assemblies';

function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : String(now || new Date().toISOString());
}

function buildAdminPatch(kind, stage, extra = {}) {
  return {
    delivery_admin: {
      kind,
      stage,
      updated_at: nowIso(),
      ...extra,
    },
  };
}

/** Workshop repair timer stopped — register for Delivery app / admin (no warehouse floors). */
export async function markRepairWorkCompleteAwaitingDriver(sb, row, { now = new Date().toISOString() } = {}) {
  const prevMeta = row?.metadata || {};
  return {
    ...prevMeta,
    ...buildAdminPatch(DELIVERY_ADMIN_KIND.REPAIR, DELIVERY_ADMIN_STAGE.AWAITING_DRIVER, {
      registered_at: now,
      return_order_id: String(row.id),
      return_number: row.return_number || null,
      assembly_id: row.assembly_id,
      assembly_name: row.assembly_name,
      quantity: Math.max(1, Number(row.quantity) || 1),
    }),
    ready_for_delivery_app: true,
    floor2_repair_staged_at: null,
    floor1_awaiting_hassan: false,
    factory_stock_added_at: null,
  };
}

export async function registerProductionJobAwaitingDriver(sb, {
  jobsTable,
  jobRow,
  assemblyId,
  assemblyName,
  qty,
  department,
  quoteId = null,
  quoteNumber = null,
  now = new Date().toISOString(),
}) {
  const meta = jobRow?.metadata || {};
  const patch = {
    ...meta,
    ...buildAdminPatch(DELIVERY_ADMIN_KIND.ORDER, DELIVERY_ADMIN_STAGE.AWAITING_DRIVER, {
      registered_at: now,
      production_job_id: String(jobRow.id),
      assembly_id: String(assemblyId),
      assembly_name: assemblyName || assemblyId,
      quantity: Math.max(1, Math.floor(Number(qty) || 1)),
      department,
      quote_id: quoteId,
      quote_number: quoteNumber,
    }),
  };
  await sb.from(jobsTable).update({
    metadata: patch,
    updated_at: now,
  }).eq('id', jobRow.id);

  try {
    const { notifyDeliveryOrderReadyForDriver } = await import('./productionExpoPush.js');
    await notifyDeliveryOrderReadyForDriver({
      assemblyName,
      qty,
      department,
      jobId: jobRow.id,
      quoteNumber,
    });
  } catch (err) {
    console.warn('[registerProductionJobAwaitingDriver] delivery push failed:', err?.message || err);
  }
}

function quoteRoutingLineItems(meta) {
  const raw = Array.isArray(meta?.lines) ? meta.lines : [];
  return raw.map((line) => {
    const name = String(line?.name || line?.name_override || '').trim();
    if (!name) return null;
    return {
      name,
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
    };
  }).filter(Boolean);
}

function quoteLinesDisplayName(lines, fallback) {
  if (!lines.length) return String(fallback || '').trim();
  if (lines.length === 1) return lines[0].name;
  return lines.map((line) => `${line.name} × ${line.quantity}`).join(', ');
}

function quoteLinesTotalQty(lines, fallbackQty) {
  if (!lines.length) return Math.max(1, Math.floor(Number(fallbackQty) || 1));
  return Math.max(1, lines.reduce((sum, line) => sum + line.quantity, 0));
}

export async function registerQuoteOrderAwaitingDriver(sb, {
  quoteId,
  assemblyId,
  qty,
  route,
  quoteNumber = null,
  now = new Date().toISOString(),
}) {
  const { data: routing } = await sb
    .from(QUOTE_ROUTING)
    .select('metadata')
    .eq('quote_id', String(quoteId))
    .maybeSingle();
  const prev = routing?.metadata || {};
  const lines = quoteRoutingLineItems(prev);
  const { data: asm } = await sb.from(ASSEMBLIES).select('name').eq('id', String(assemblyId)).maybeSingle();
  const assemblyName = quoteLinesDisplayName(lines, asm?.name || assemblyId);
  const quantity = quoteLinesTotalQty(lines, qty);
  const resolvedQuoteNumber = quoteNumber || prev.quote_number || null;
  await sb.from(QUOTE_ROUTING).update({
    metadata: {
      ...prev,
      ...buildAdminPatch(DELIVERY_ADMIN_KIND.ORDER, DELIVERY_ADMIN_STAGE.AWAITING_DRIVER, {
        registered_at: now,
        quote_id: String(quoteId),
        quote_number: resolvedQuoteNumber,
        assembly_id: String(assemblyId),
        assembly_name: assemblyName,
        quantity,
        department: String(route || 'upholstery').toLowerCase(),
      }),
    },
    updated_at: now,
  }).eq('quote_id', String(quoteId));

  const result = {
    assembly_id: String(assemblyId),
    assembly_name: assemblyName,
    quote_id: String(quoteId),
    quote_number: resolvedQuoteNumber,
    quantity,
    department: String(route || 'upholstery').toLowerCase(),
    lines,
  };

  try {
    const { notifyDeliveryOrderReadyForDriver } = await import('./productionExpoPush.js');
    await notifyDeliveryOrderReadyForDriver({
      assemblyName: result.assembly_name,
      qty: result.quantity,
      department: result.department,
      jobId: result.quote_id,
      quoteNumber: result.quote_number,
    });
  } catch (err) {
    console.warn('[registerQuoteOrderAwaitingDriver] delivery push failed:', err?.message || err);
  }

  return result;
}

function parseRowMetadata(raw) {
  return parseWarehouseReturnMetadata(raw);
}

function rowAwaitingDriver(admin) {
  return admin
    && String(admin.stage || '').toLowerCase() === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER;
}

export async function listRepairDeliveriesForMobile(sb) {
  const { data, error } = await sb
    .from(RETURNS)
    .select('id, return_number, assembly_id, assembly_name, quantity, status, metadata, customer_name, customer_phone')
    .eq('status', WAREHOUSE_RETURN_STATUSES.COMPLETED);
  if (error) throw new Error(error.message || 'Failed to load repair queue.');

  return (data || [])
    .filter((row) => repairEligibleForMobileDeliveryQueue(row))
    .map((row) => {
      const meta = parseRowMetadata(row.metadata);
      return {
        return_order_id: String(row.id),
        return_number: row.return_number,
        assembly_id: String(row.assembly_id),
        assembly_name: row.assembly_name,
        quantity: Math.max(1, Number(row.quantity) || 1),
        has_customer: Boolean(String(row.customer_name || '').trim()),
        customer_name: String(row.customer_name || '').trim() || null,
        customer_phone: String(row.customer_phone || '').trim() || null,
        status: String(row.status || 'completed'),
        delivery_admin_stage: DELIVERY_ADMIN_STAGE.AWAITING_DRIVER,
        ready_for_delivery_app: true,
        metadata: meta,
      };
    });
}

async function listCompletedJobsAwaitingDriver(sb, table, department) {
  const { data, error } = await sb
    .from(table)
    .select('id, assembly_id, product_qty, metadata, status')
    .eq('status', 'completed')
    .limit(500);
  if (error) return [];

  const out = [];
  for (const job of data || []) {
    const meta = parseRowMetadata(job?.metadata);
    const admin = meta.delivery_admin;
    if (!rowAwaitingDriver(admin)) continue;
    const asmId = String(admin.assembly_id || job.assembly_id || '').trim();
    if (!asmId) continue;
    const { data: asm } = await sb.from(ASSEMBLIES).select('name, family_sku').eq('id', asmId).maybeSingle();
    out.push({
      production_job_id: String(job.id),
      assembly_id: asmId,
      assembly_name: admin.assembly_name || asm?.name || asmId,
      family_sku: asm?.family_sku || '',
      quantity: Math.max(1, Number(admin.quantity || job.product_qty) || 1),
      quote_id: admin.quote_id || null,
      quote_number: admin.quote_number || null,
      department: admin.department || department,
      delivery_admin_stage: DELIVERY_ADMIN_STAGE.AWAITING_DRIVER,
    });
  }
  return out;
}

async function listQuoteOrdersAwaitingDriver(sb) {
  const { data, error } = await sb
    .from(QUOTE_ROUTING)
    .select('quote_id, route, completed_at, metadata')
    .not('completed_at', 'is', null)
    .limit(500);
  if (error) return [];

  const out = [];
  for (const row of data || []) {
    const meta = parseRowMetadata(row?.metadata);
    const admin = meta.delivery_admin;
    if (!rowAwaitingDriver(admin)) continue;
    const asmId = String(admin.assembly_id || '').trim();
    if (!asmId) continue;
    const { data: asm } = await sb.from(ASSEMBLIES).select('name, family_sku').eq('id', asmId).maybeSingle();
    const lines = quoteRoutingLineItems(meta);
    const fallbackName = admin.assembly_name || asm?.name || asmId;
    out.push({
      quote_id: String(row.quote_id),
      assembly_id: asmId,
      assembly_name: quoteLinesDisplayName(lines, fallbackName),
      family_sku: asm?.family_sku || '',
      quantity: quoteLinesTotalQty(lines, admin.quantity),
      quote_number: admin.quote_number || meta.quote_number || null,
      customer_name: String(meta.customer_name || '').trim() || null,
      department: admin.department || row.route || 'upholstery',
      lines,
      delivery_admin_stage: DELIVERY_ADMIN_STAGE.AWAITING_DRIVER,
    });
  }
  return out;
}

/** Repairs / production orders in Delivery app queue — held on delivery_admin, not warehouse floors. */
export async function assertAdminQueueDeliveryHold(sb, {
  repairStaging,
  orderStaging,
  assemblyId,
  requiredQty,
} = {}) {
  const need = Math.max(1, Math.floor(Number(requiredQty) || 1));
  const aid = String(assemblyId || '').trim();
  if (!aid) throw new Error('Unknown product in shipment.');

  if (repairStaging) {
    const rid = String(repairStaging.return_order_id || '').trim();
    if (!rid) throw new Error('Repair delivery is missing return order.');
    const { data: row } = await sb.from(RETURNS).select('*').eq('id', rid).maybeSingle();
    if (!row) throw new Error('Return order not found.');
    if (String(row.assembly_id) !== aid) {
      throw new Error('Return product does not match shipment.');
    }
    if (!repairEligibleForMobileDeliveryQueue(row)) {
      throw new Error('This repair is no longer waiting for driver delivery.');
    }
    const held = Math.max(1, Number(row.quantity) || 1);
    if (held < need) {
      throw new Error(`Repair hold qty ${held} is less than shipment ${need}.`);
    }
    return;
  }

  if (orderStaging) {
    if (String(orderStaging.assembly_id) !== aid) {
      throw new Error('Order product does not match shipment.');
    }
    const held = Math.max(1, Number(orderStaging.quantity) || 1);
    if (held < need) {
      throw new Error(`Order hold qty ${held} is less than shipment ${need}.`);
    }
    const stage = String(
      orderStaging.delivery_admin_stage || DELIVERY_ADMIN_STAGE.AWAITING_DRIVER,
    ).toLowerCase();
    if (stage !== DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) {
      throw new Error('This production order is no longer waiting for driver delivery.');
    }
    return;
  }

  throw new Error('Delivery admin hold not found for this product.');
}

export async function listOrderDeliveriesForMobile(sb) {
  const [carpentry, upholstery, painting, quotes] = await Promise.all([
    listCompletedJobsAwaitingDriver(sb, CARPENTRY_JOBS, 'carpentry'),
    listCompletedJobsAwaitingDriver(sb, UPHOLSTERY_JOBS, 'upholstery'),
    listCompletedJobsAwaitingDriver(sb, PAINTING_JOBS, 'painting'),
    listQuoteOrdersAwaitingDriver(sb),
  ]);
  const merged = [...carpentry, ...upholstery, ...painting, ...quotes];
  const seen = new Set();
  return merged.filter((row) => {
    const key = `${row.assembly_id}:${row.production_job_id || ''}:${row.quote_id || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function listDeliveryAdminRegistry(sb) {
  const repairs = (await sb.from(RETURNS).select('*').order('created_at', { ascending: false }).limit(500)).data || [];
  const repairRows = repairs.map((row) => ({
    kind: DELIVERY_ADMIN_KIND.REPAIR,
    id: row.id,
    label: row.return_number,
    assembly_name: row.assembly_name,
    quantity: row.quantity,
    status: row.status,
    delivery_admin: row.metadata?.delivery_admin || null,
    created_at: row.created_at,
    customer_name: row.customer_name,
    reason: row.reason,
  }));

  const orders = await listOrderDeliveriesForMobile(sb);
  const orderRows = orders.map((o) => ({
    kind: DELIVERY_ADMIN_KIND.ORDER,
    id: o.production_job_id || o.quote_id,
    label: o.quote_number || o.production_job_id || o.assembly_id,
    assembly_name: o.assembly_name,
    quantity: o.quantity,
    status: 'completed',
    delivery_admin: { stage: DELIVERY_ADMIN_STAGE.AWAITING_DRIVER, ...o },
    department: o.department,
  }));

  const collectedRepairs = repairs
    .filter((r) => String(r.metadata?.delivery_admin?.stage) === DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER)
    .map((row) => ({
      kind: DELIVERY_ADMIN_KIND.REPAIR,
      id: row.id,
      label: row.return_number,
      assembly_name: row.assembly_name,
      quantity: row.quantity,
      status: row.status,
      delivery_admin: row.metadata?.delivery_admin,
      created_at: row.created_at,
    }));

  return { repairs: [...repairRows, ...collectedRepairs], orders: orderRows };
}

export async function advanceAdminQueueOnDeliverySubmit(sb, entries, {
  submittedAt = new Date().toISOString(),
  driverName = '',
  customerDriverName = '',
  customerDriverPhone = '',
} = {}) {
  for (const line of entries || []) {
    if (line?.metadata?.admin_queue_delivery !== true) continue;
    const returnOrderId = String(line.metadata?.return_order_id || '').trim();
    const productionJobId = String(line.metadata?.production_job_id || '').trim();
    const quoteId = String(line.metadata?.quote_id || '').trim();
    const driverLabel = String(customerDriverName || driverName || '').trim();

    if (returnOrderId) {
      const { data: row } = await sb.from(RETURNS).select('metadata').eq('id', returnOrderId).maybeSingle();
      const meta = row?.metadata || {};
      await sb.from(RETURNS).update({
        updated_at: submittedAt,
        metadata: {
          ...meta,
          delivery_submitted_at: submittedAt,
          delivery_admin: {
            ...(meta.delivery_admin || {}),
            kind: DELIVERY_ADMIN_KIND.REPAIR,
            stage: DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER,
            collected_at: submittedAt,
            driver_name: driverLabel,
            customer_driver_phone: customerDriverPhone || null,
            updated_at: submittedAt,
          },
        },
      }).eq('id', returnOrderId);
    }

    const patchCollected = (prev) => ({
      ...(prev || {}),
      ...buildAdminPatch(DELIVERY_ADMIN_KIND.ORDER, DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER, {
        collected_at: submittedAt,
        driver_name: driverLabel,
        customer_driver_phone: customerDriverPhone || null,
      }),
    });

    if (productionJobId) {
      for (const table of [CARPENTRY_JOBS, UPHOLSTERY_JOBS, PAINTING_JOBS]) {
        const { data: job } = await sb.from(table).select('metadata').eq('id', productionJobId).maybeSingle();
        if (!job) continue;
        await sb.from(table).update({
          metadata: {
            ...patchCollected(job.metadata),
          },
          updated_at: submittedAt,
        }).eq('id', productionJobId);
        break;
      }
    }

    if (quoteId) {
      const { data: routing } = await sb.from(QUOTE_ROUTING).select('metadata').eq('quote_id', quoteId).maybeSingle();
      if (routing) {
        await sb.from(QUOTE_ROUTING).update({
          metadata: patchCollected(routing.metadata),
          updated_at: submittedAt,
        }).eq('quote_id', quoteId);
      }
    }
  }
}

export async function moveAdminQueueLineToKitwe(sb, line) {
  if (line?.metadata?.admin_queue_delivery !== true) return null;
  const aid = String(line.metadata?.assembly_id || '').trim();
  const qty = Math.max(1, Number(line.quantity) || 1);
  if (!aid || qty < 1) return null;
  const customerRepair = line.metadata?.return_has_customer === true;
  if (customerRepair || deliveryEntrySentToCustomer(line)) {
    return { assemblyId: aid, qty, kitweAdded: 0 };
  }
  const virtualHold = line.metadata?.delivery_admin_hold === true;
  const { adjustAssemblyStock } = await returnStockMutations();
  if (!virtualHold) {
    const deductLoc = String(line.metadata?.stock_deduct_location_id || WAREHOUSE_FROM_LOCATION_ID).trim()
      || WAREHOUSE_FROM_LOCATION_ID;
    const alreadyLeftSendLoc = Boolean(line.metadata?.source_stock_deducted_at);
    if (!alreadyLeftSendLoc) {
      try {
        await adjustAssemblyStock(sb, aid, deductLoc, -qty);
      } catch (err) {
        if (!/Not enough finished product stock/i.test(String(err?.message || ''))) throw err;
      }
    }
  }
  await adjustAssemblyStock(sb, aid, WAREHOUSE_TO_LOCATION_ID, qty);
  return { assemblyId: aid, qty, kitweAdded: qty };
}

export async function finalizeAdminQueueOnKitweAccept(sb, lines, {
  acceptedAt = new Date().toISOString(),
} = {}) {
  const RETURNS_TABLE = RETURNS;
  for (const line of lines || []) {
    if (line?.metadata?.admin_queue_delivery !== true) continue;
    const returnOrderId = String(line.metadata?.return_order_id || '').trim();
    const productionJobId = String(line.metadata?.production_job_id || '').trim();
    const quoteId = String(line.metadata?.quote_id || '').trim();

    const completedPatch = (prev, kind) => ({
      ...(prev || {}),
      delivery_admin: {
        ...(prev?.delivery_admin || {}),
        kind,
        stage: DELIVERY_ADMIN_STAGE.DELIVERY_COMPLETED,
        completed_at: acceptedAt,
        updated_at: acceptedAt,
      },
    });

    if (returnOrderId) {
      const { data: row } = await sb.from(RETURNS_TABLE).select('*').eq('id', returnOrderId).maybeSingle();
      if (!row) continue;
      const hasCustomer = Boolean(String(row.customer_name || '').trim());
      await sb.from(RETURNS_TABLE).update({
        status: hasCustomer
          ? WAREHOUSE_RETURN_STATUSES.CUSTOMER_DELIVERED
          : WAREHOUSE_RETURN_STATUSES.SHIPPED,
        updated_at: acceptedAt,
        metadata: {
          ...(row.metadata || {}),
          kitwe_restored_at: hasCustomer ? row.metadata?.kitwe_restored_at : acceptedAt,
          customer_fulfilled_at: hasCustomer ? acceptedAt : row.metadata?.customer_fulfilled_at,
          ...completedPatch(row.metadata, DELIVERY_ADMIN_KIND.REPAIR),
        },
      }).eq('id', returnOrderId);
    }

    if (productionJobId) {
      for (const table of [CARPENTRY_JOBS, UPHOLSTERY_JOBS, PAINTING_JOBS]) {
        const { data: job } = await sb.from(table).select('metadata').eq('id', productionJobId).maybeSingle();
        if (!job) continue;
        await sb.from(table).update({
          metadata: completedPatch(job.metadata, DELIVERY_ADMIN_KIND.ORDER),
          updated_at: acceptedAt,
        }).eq('id', productionJobId);
        break;
      }
    }

    if (quoteId) {
      const { data: routing } = await sb.from(QUOTE_ROUTING).select('metadata').eq('quote_id', quoteId).maybeSingle();
      if (routing) {
        await sb.from(QUOTE_ROUTING).update({
          metadata: completedPatch(routing.metadata, DELIVERY_ADMIN_KIND.ORDER),
          updated_at: acceptedAt,
        }).eq('quote_id', quoteId);
      }
    }
  }
}

/** @deprecated Floor stock — scrub legacy ghost qty on Floor 1 only when cleaning old data */
export async function scrubLegacyFloor1Ghost(sb, assemblyId, qty) {
  const aid = String(assemblyId || '').trim();
  const cap = Math.max(0, Math.floor(Number(qty) || 0));
  if (!aid || cap < 1) return;
  const { getAssemblyStockQty, adjustAssemblyStock } = await returnStockMutations();
  const floor1Qty = await getAssemblyStockQty(sb, aid, WAREHOUSE_FROM_LOCATION_ID);
  const remove = Math.min(cap, floor1Qty);
  if (remove > 0) {
    await adjustAssemblyStock(sb, aid, WAREHOUSE_FROM_LOCATION_ID, -remove);
  }
}
