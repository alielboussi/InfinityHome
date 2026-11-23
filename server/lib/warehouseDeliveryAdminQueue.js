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
  deliveryEntrySkipKitweRetailCatalog,
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

function emptyQuoteCustomer() {
  return {
    customer_name: null,
    customer_phone: null,
    customer_order: false,
    showroom_order: false,
    quote_number: null,
  };
}

function normalizeMatchName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function quoteIdFromJobFields(job, meta = null) {
  const parsed = meta || parseRowMetadata(job?.metadata);
  const admin = parsed.delivery_admin || {};
  return String(
    job?.quote_id
    || job?.carpentry_quote_id
    || admin.quote_id
    || parsed.quote_id
    || parsed.carpentry_quote_id
    || '',
  ).trim();
}

function assemblyIdsFromRoutingMeta(meta, admin = {}) {
  const ids = new Set();
  const add = (value) => {
    const id = String(value || '').trim();
    if (id) ids.add(id);
  };
  add(admin.assembly_id);
  add(meta?.primary_assembly_id);
  add(meta?.assembly_id);
  for (const line of quoteRoutingLineItems(meta)) {
    add(line.assembly_id);
    add(line.floor2_assembly_id);
    add(line.catalog_assembly_id);
    add(line.product_id);
  }
  return ids;
}

async function loadCustomerContactById(sb, customerId) {
  const cid = String(customerId || '').trim();
  if (!cid) return { name: null, phone: null };
  const { data: cust } = await sb.from('customers').select('name, phone').eq('id', cid).maybeSingle();
  if (cust?.name) {
    return { name: String(cust.name).trim() || null, phone: String(cust.phone || '').trim() || null };
  }
  const { data: qc } = await sb.from('quote_customers').select('name, phone').eq('id', cid).maybeSingle();
  return {
    name: String(qc?.name || '').trim() || null,
    phone: String(qc?.phone || '').trim() || null,
  };
}

async function resolveQuoteOrderCustomer(sb, quoteId) {
  const qid = String(quoteId || '').trim();
  if (!qid) return emptyQuoteCustomer();
  const [{ data: routing }, { data: quote }] = await Promise.all([
    sb.from(QUOTE_ROUTING).select('metadata').eq('quote_id', qid).maybeSingle(),
    sb.from('quotations').select('id, quote_number, customer_id').eq('id', qid).maybeSingle(),
  ]);
  const routingMeta = routing?.metadata || {};
  const showroom_order = routingMeta.showroom_order === true;
  let customer_name = String(routingMeta.customer_name || '').trim() || null;
  let customer_phone = String(routingMeta.customer_phone || '').trim() || null;
  if ((!customer_name || !customer_phone) && quote?.customer_id) {
    const contact = await loadCustomerContactById(sb, quote.customer_id);
    customer_name = customer_name || contact.name;
    customer_phone = customer_phone || contact.phone;
  }
  const quoteNumber = routingMeta.quote_number ?? quote?.quote_number;
  return {
    customer_name,
    customer_phone,
    customer_order: !showroom_order && Boolean(customer_name),
    showroom_order,
    quote_number: quoteNumber != null && String(quoteNumber).trim() ? String(quoteNumber).trim() : null,
  };
}

function routingStillOnDeliveryQueue(meta, completedAt) {
  const admin = meta?.delivery_admin || {};
  const stage = String(admin.stage || '').toLowerCase();
  if (stage === DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) return true;
  if (stage && stage !== DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) return false;
  return !completedAt;
}

async function loadQuoteRoutingCandidates(sb) {
  let { data, error } = await sb
    .from(QUOTE_ROUTING)
    .select('quote_id, route, completed_at, sent_to_production_at, metadata')
    .not('sent_to_production_at', 'is', null)
    .limit(800);
  if (error) {
    const fallback = await sb
      .from(QUOTE_ROUTING)
      .select('quote_id, route, completed_at, metadata')
      .limit(800);
    data = fallback.data;
    error = fallback.error;
  }
  if (error || !data?.length) return [];
  return data.map((row) => {
    const meta = parseRowMetadata(row.metadata);
    const admin = meta.delivery_admin || {};
    const lines = quoteRoutingLineItems(meta);
    return {
      quote_id: String(row.quote_id || '').trim(),
      route: String(row.route || admin.department || '').toLowerCase(),
      awaiting: rowAwaitingDriver(admin),
      on_queue: routingStillOnDeliveryQueue(meta, row.completed_at),
      assembly_ids: assemblyIdsFromRoutingMeta(meta, admin),
      names: new Set(lines.map((line) => normalizeMatchName(line.name)).filter(Boolean)),
      quantity: quoteLinesTotalQty(lines, admin.quantity),
      quote_number: admin.quote_number || meta.quote_number || null,
      customer_name: String(meta.customer_name || '').trim() || null,
      customer_phone: String(meta.customer_phone || '').trim() || null,
      showroom_order: meta.showroom_order === true,
    };
  }).filter((row) => row.quote_id && row.on_queue);
}

function scoreQuoteCandidate(candidate, { assemblyId, assemblyName, department, quantity }) {
  let score = 0;
  if (candidate.assembly_ids.has(assemblyId)) score += 12;
  const name = normalizeMatchName(assemblyName);
  if (name && candidate.names.has(name)) score += 8;
  else if (name && [...candidate.names].some((n) => n.includes(name) || name.includes(n))) score += 4;
  if (department && candidate.route && candidate.route === String(department).toLowerCase()) score += 3;
  if (candidate.awaiting) score += 4;
  if (quantity && candidate.quantity === quantity) score += 2;
  if (score < 8) return 0;
  return score;
}

export async function lookupQuoteIdForAssembly(sb, assemblyId, {
  department = '',
  assemblyName = '',
  quantity = 0,
} = {}) {
  const aid = String(assemblyId || '').trim();
  if (!aid) return null;
  const candidates = await loadQuoteRoutingCandidates(sb);
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreQuoteCandidate(candidate, {
      assemblyId: aid,
      assemblyName,
      department,
      quantity: Math.max(0, Math.floor(Number(quantity) || 0)),
    });
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best?.quote_id || null;
}

async function attachMissingQuoteIds(sb, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const missing = list.filter((row) => !String(row.quote_id || '').trim());
  if (!missing.length) return list;
  const candidates = await loadQuoteRoutingCandidates(sb);
  if (!candidates.length) return list;
  return list.map((row) => {
    if (String(row.quote_id || '').trim()) return row;
    const aid = String(row.assembly_id || '').trim();
    let best = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = scoreQuoteCandidate(candidate, {
        assemblyId: aid,
        assemblyName: row.assembly_name,
        department: row.department,
        quantity: Math.max(0, Math.floor(Number(row.quantity) || 0)),
      });
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) return row;
    return {
      ...row,
      quote_id: best.quote_id,
      quote_number: row.quote_number || best.quote_number || null,
      customer_name: row.customer_name || best.customer_name || null,
      customer_phone: row.customer_phone || best.customer_phone || null,
      showroom_order: row.showroom_order === true || best.showroom_order === true,
      customer_order: !(row.showroom_order === true || best.showroom_order === true)
        && (row.customer_order === true || Boolean(best.customer_name)),
    };
  });
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
  const resolvedQuoteId = String(
    quoteId || quoteIdFromJobFields(jobRow, meta) || '',
  ).trim() || null;
  const customerFields = resolvedQuoteId
    ? await resolveQuoteOrderCustomer(sb, resolvedQuoteId)
    : {
      customer_name: null,
      customer_phone: null,
      customer_order: false,
      showroom_order: false,
      quote_number: null,
    };
  const patch = {
    ...meta,
    ...(customerFields.showroom_order ? { showroom_order: true } : {}),
    ...(customerFields.customer_order ? { customer_order: true } : {}),
    ...(customerFields.customer_name ? {
      customer_name: customerFields.customer_name,
      customer_phone: customerFields.customer_phone,
    } : {}),
    ...buildAdminPatch(DELIVERY_ADMIN_KIND.ORDER, DELIVERY_ADMIN_STAGE.AWAITING_DRIVER, {
      registered_at: now,
      production_job_id: String(jobRow.id),
      assembly_id: String(assemblyId),
      assembly_name: assemblyName || assemblyId,
      quantity: Math.max(1, Math.floor(Number(qty) || 1)),
      department,
      quote_id: resolvedQuoteId,
      quote_number: quoteNumber || customerFields.quote_number,
      ...(customerFields.customer_name ? {
        customer_name: customerFields.customer_name,
        customer_phone: customerFields.customer_phone,
        customer_order: true,
      } : {}),
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
      ...line,
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
  const assemblyName = quoteLinesDisplayName(lines, '');
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
        ...(prev.showroom_order === true ? { showroom_order: true, customer_order: false } : {}),
        ...(prev.customer_order === true && prev.showroom_order !== true
          ? { customer_order: true }
          : {}),
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
      const hasCustomer = Boolean(String(row.customer_name || '').trim());
      const showroom_order = meta.showroom_order === true;
      const customer_order = !showroom_order && (meta.customer_order === true || hasCustomer);
      return {
        return_order_id: String(row.id),
        return_number: row.return_number,
        assembly_id: String(row.assembly_id),
        assembly_name: row.assembly_name,
        quantity: Math.max(1, Number(row.quantity) || 1),
        has_customer: hasCustomer,
        customer_name: String(row.customer_name || '').trim() || null,
        customer_phone: String(row.customer_phone || '').trim() || null,
        showroom_order,
        customer_order,
        department: String(meta.repair_department || meta.department || '').toLowerCase() || null,
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
    .select('*')
    .eq('status', 'completed')
    .limit(500);
  if (error) return [];

  const awaiting = (data || []).map((job) => {
    const meta = parseRowMetadata(job?.metadata);
    const admin = meta.delivery_admin;
    if (!rowAwaitingDriver(admin)) return null;
    if (String(admin.kind || DELIVERY_ADMIN_KIND.ORDER).toLowerCase() !== DELIVERY_ADMIN_KIND.ORDER) return null;
    const dest = String(meta.finish_destination || admin.finish_destination || 'delivery').toLowerCase();
    if (dest === 'floor1') return null;
    const asmId = String(admin.assembly_id || job.assembly_id || '').trim();
    if (!asmId) return null;
    return { job, meta, admin, asmId };
  }).filter(Boolean);

  const runIds = [...new Set(awaiting
    .map((row) => String(row.meta.production_run_id || '').trim())
    .filter(Boolean))];
  const runQuoteById = new Map();
  if (runIds.length) {
    const { data: runs } = await sb.from('carpentry_production_runs').select('id, quote_id').in('id', runIds);
    (runs || []).forEach((run) => {
      const qid = String(run.quote_id || '').trim();
      if (qid) runQuoteById.set(String(run.id), qid);
    });
  }

  const asmIds = [...new Set(awaiting.map((row) => row.asmId))];
  const asmById = new Map();
  if (asmIds.length) {
    const { data: assemblies } = await sb.from(ASSEMBLIES).select('id, name, family_sku').in('id', asmIds);
    (assemblies || []).forEach((asm) => asmById.set(String(asm.id), asm));
  }

  return awaiting.map(({ job, meta, admin, asmId }) => {
    const asm = asmById.get(asmId);
    const showroom_order = admin.showroom_order === true || meta.showroom_order === true;
    const customer_name = String(admin.customer_name || meta.customer_name || job.customer_name || '').trim() || null;
    const customer_order = !showroom_order && (
      admin.customer_order === true
      || meta.customer_order === true
      || Boolean(customer_name)
    );
    const quote_id = quoteIdFromJobFields(job, meta)
      || String(runQuoteById.get(String(meta.production_run_id || '')) || '').trim()
      || null;
    return {
      production_job_id: String(job.id),
      assembly_id: asmId,
      assembly_name: admin.assembly_name || job.product_name || asm?.name || asmId,
      family_sku: asm?.family_sku || '',
      quantity: Math.max(1, Number(admin.quantity || job.product_qty) || 1),
      quote_id: quote_id || null,
      quote_number: admin.quote_number || meta.quote_number || job.quote_number || null,
      customer_name,
      customer_phone: String(admin.customer_phone || meta.customer_phone || job.customer_phone || '').trim() || null,
      showroom_order,
      customer_order,
      department: admin.department || department,
      delivery_admin_stage: DELIVERY_ADMIN_STAGE.AWAITING_DRIVER,
    };
  });
}

async function listPartialQuoteDeliveryHolds(sb) {
  const { data, error } = await sb
    .from(QUOTE_ROUTING)
    .select('quote_id, route, metadata')
    .is('completed_at', null)
    .limit(500);
  if (error) return [];
  const out = [];
  for (const row of data || []) {
    const meta = parseRowMetadata(row?.metadata);
    const holds = Array.isArray(meta.partial_delivery_holds) ? meta.partial_delivery_holds : [];
    const metaName = String(meta.customer_name || '').trim() || null;
    const metaPhone = String(meta.customer_phone || '').trim() || null;
    const showroom_order = meta.showroom_order === true;
    const customer_order = !showroom_order && (meta.customer_order === true || Boolean(metaName));
    for (const hold of holds) {
      if (String(hold.stage || '').toLowerCase() !== DELIVERY_ADMIN_STAGE.AWAITING_DRIVER) continue;
      if (hold.collected_at) continue;
      const asmId = String(hold.assembly_id || '').trim();
      if (!asmId) continue;
      const qty = Math.max(1, Number(hold.quantity) || 1);
      const ordered = Math.max(qty, Number(hold.ordered_qty) || 0);
      const lineName = String(hold.line_name || 'Order').trim();
      const assemblyName = ordered > qty
        ? `${lineName} (partial ${qty} of ${ordered})`
        : `${lineName} × ${qty}`;
      out.push({
        quote_id: String(row.quote_id),
        assembly_id: asmId,
        assembly_name: assemblyName,
        quantity: qty,
        quote_number: hold.quote_number || meta.quote_number || null,
        customer_name: String(hold.customer_name || '').trim() || metaName,
        customer_phone: String(hold.customer_phone || '').trim() || metaPhone,
        showroom_order: hold.showroom_order === true || showroom_order,
        customer_order: !(hold.showroom_order === true || showroom_order)
          && (customer_order || Boolean(String(hold.customer_name || metaName || '').trim())),
        department: hold.department || row.route || 'upholstery',
        lines: [{
          id: hold.item_id,
          name: assemblyName,
          quantity: qty,
          ordered_qty: ordered,
        }],
        delivery_admin_stage: DELIVERY_ADMIN_STAGE.AWAITING_DRIVER,
        partial_quote_hold_id: hold.id,
        partial: true,
      });
    }
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
    const showroom_order = meta.showroom_order === true;
    const customer_name = String(meta.customer_name || '').trim() || null;
    const customer_order = !showroom_order && (meta.customer_order === true || Boolean(customer_name));
    out.push({
      quote_id: String(row.quote_id),
      assembly_id: asmId,
      assembly_name: quoteLinesDisplayName(lines, ''),
      family_sku: asm?.family_sku || '',
      quantity: quoteLinesTotalQty(lines, admin.quantity),
      quote_number: admin.quote_number || meta.quote_number || null,
      customer_name,
      customer_phone: String(meta.customer_phone || '').trim() || null,
      customer_order,
      showroom_order,
      department: admin.department || row.route || 'upholstery',
      lines,
      delivery_admin_stage: DELIVERY_ADMIN_STAGE.AWAITING_DRIVER,
    });
  }
  const partial = await listPartialQuoteDeliveryHolds(sb);
  return [...out, ...partial];
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
  const [carpentry, upholstery, painting, partials] = await Promise.all([
    listCompletedJobsAwaitingDriver(sb, CARPENTRY_JOBS, 'carpentry'),
    listCompletedJobsAwaitingDriver(sb, UPHOLSTERY_JOBS, 'upholstery'),
    listCompletedJobsAwaitingDriver(sb, PAINTING_JOBS, 'painting'),
    listPartialQuoteDeliveryHolds(sb),
  ]);
  const merged = [...carpentry, ...upholstery, ...painting, ...partials];
  const seen = new Set();
  const unique = merged.filter((row) => {
    const key = `${row.assembly_id}:${row.production_job_id || ''}:${row.quote_id || ''}:${row.partial_quote_hold_id || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const withQuotes = await attachMissingQuoteIds(sb, unique);
  return hydrateQuoteCustomerAndNumber(sb, withQuotes);
}

async function hydrateQuoteCustomerAndNumber(sb, rows) {
  const ids = [...new Set((rows || []).map((r) => String(r.quote_id || '').trim()).filter(Boolean))];
  if (!ids.length) return rows;
  const { data: quotes } = await sb
    .from('quotations')
    .select('id, quote_number, customer_id')
    .in('id', ids);
  const quoteById = new Map((quotes || []).map((q) => [String(q.id), q]));
  const customerIds = [...new Set((quotes || []).map((q) => String(q.customer_id || '').trim()).filter(Boolean))];
  const contactById = new Map();
  if (customerIds.length) {
    const { data: customers } = await sb.from('customers').select('id, name, phone').in('id', customerIds);
    (customers || []).forEach((c) => contactById.set(String(c.id), c));
    const missing = customerIds.filter((id) => !contactById.get(id)?.name);
    if (missing.length) {
      const { data: qc } = await sb.from('quote_customers').select('id, name, phone').in('id', missing);
      (qc || []).forEach((c) => {
        if (!contactById.get(String(c.id))?.name) contactById.set(String(c.id), c);
      });
    }
  }
  return (rows || []).map((row) => {
    const q = quoteById.get(String(row.quote_id || '').trim());
    if (!q) return row;
    const contact = contactById.get(String(q.customer_id || '').trim());
    const quoteNumber = String(row.quote_number ?? q.quote_number ?? '').trim() || null;
    const customerName = String(row.customer_name || contact?.name || '').trim() || null;
    const customerPhone = String(row.customer_phone || contact?.phone || '').trim() || null;
    return {
      ...row,
      quote_number: quoteNumber,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_order: row.showroom_order === true ? false : (row.customer_order === true || Boolean(customerName)),
    };
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
      const holdId = String(line.metadata?.partial_quote_hold_id || '').trim();
      const { data: routing } = await sb.from(QUOTE_ROUTING).select('metadata').eq('quote_id', quoteId).maybeSingle();
      if (routing) {
        const prev = routing.metadata && typeof routing.metadata === 'object' ? routing.metadata : {};
        let nextMeta = prev;
        if (holdId && Array.isArray(prev.partial_delivery_holds)) {
          nextMeta = {
            ...prev,
            partial_delivery_holds: prev.partial_delivery_holds.map((hold) => (
              String(hold?.id) === holdId
                ? {
                  ...hold,
                  collected_at: submittedAt,
                  stage: DELIVERY_ADMIN_STAGE.COLLECTED_BY_DRIVER,
                }
                : hold
            )),
          };
        } else {
          nextMeta = patchCollected(prev);
        }
        await sb.from(QUOTE_ROUTING).update({
          metadata: nextMeta,
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
  if (customerRepair || deliveryEntrySentToCustomer(line) || deliveryEntrySkipKitweRetailCatalog(line)) {
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
      const prevMeta = row.metadata || {};
      await sb.from(RETURNS_TABLE).update({
        status: hasCustomer
          ? WAREHOUSE_RETURN_STATUSES.CUSTOMER_DELIVERED
          : WAREHOUSE_RETURN_STATUSES.SHIPPED,
        updated_at: acceptedAt,
        metadata: {
          ...prevMeta,
          customer_fulfilled_at: hasCustomer ? acceptedAt : prevMeta.customer_fulfilled_at,
          driver_delivery_completed_at: acceptedAt,
          ...completedPatch(prevMeta, DELIVERY_ADMIN_KIND.REPAIR),
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
