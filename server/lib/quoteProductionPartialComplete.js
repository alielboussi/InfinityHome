import { newUuid } from './uuid.js';
import {
  applyPartialLineProgressPatch,
  allQuoteLinesFullyCompleted,
  lineRemainingQty,
  quoteLineOrderedQty,
} from '../../src/utils/quoteProductionLineProgress.js';
import { buildProductionLineSummaryRow } from '../../src/utils/quoteProductionItemFields.js';
import {
  filterLinesForProductionLineSet,
  normalizeProductionLineSet,
} from '../../src/utils/quoteProductionLineSet.js';
import {
  DELIVERY_ADMIN_KIND,
  DELIVERY_ADMIN_STAGE,
} from '../../src/utils/warehouseDeliveryAdminQueue.js';
import { getQuoteProductionRouting } from './quoteProductionRouting.js';

const ROUTING = 'quote_production_routing';
const RUNS = 'carpentry_production_runs';

async function loadQuoteItems(sb, quoteId) {
  const { data, error } = await sb
    .from('quotation_items')
    .select('*')
    .eq('quotation_id', String(quoteId))
    .order('sort_order');
  if (error) throw new Error(error.message || 'Failed to load quote lines');
  return data || [];
}

function findQuoteLine(items, itemId) {
  const id = String(itemId || '').trim();
  return (items || []).find((it) => String(it.id) === id) || null;
}

async function findActiveQuoteRun(sb, quoteId, productionLineSet = null) {
  const { findActiveQuoteRun: findRun } = await import('./quoteProductionRouting.js');
  return findRun(sb, quoteId, productionLineSet);
}

/** Mark qty ready on one line; does not end order timer or routing.completed_at. */
export async function markQuoteLinePartialReady(sb, {
  quoteId,
  route,
  itemId,
  readyQty,
  userId = null,
  producedBy = '',
  productionLineSet = null,
} = {}) {
  const qid = String(quoteId || '').trim();
  const normalizedRoute = String(route || '').trim().toLowerCase();
  if (!qid || !itemId) throw new Error('quote_id and item_id required');

  const routing = await getQuoteProductionRouting(sb, qid);
  if (!routing?.sent_to_production_at) throw new Error('Quote has not been sent to production');
  if (routing.route !== normalizedRoute) throw new Error('Quote route mismatch');
  if (routing.completed_at) throw new Error('Quote production already completed');

  const run = await findActiveQuoteRun(sb, qid, productionLineSet);
  if (!run || run.completed_at) throw new Error('No active production run for this quote');

  const items = await loadQuoteItems(sb, qid);
  const raw = findQuoteLine(items, itemId);
  if (!raw) throw new Error('Quote line not found');

  const meta = routing.metadata && typeof routing.metadata === 'object' ? { ...routing.metadata } : {};
  const summary = buildProductionLineSummaryRow(raw, meta);
  const remaining = lineRemainingQty(summary, meta);
  let add = Math.max(1, Math.floor(Number(readyQty) || 0));
  if (add > remaining) {
    throw new Error(`Only ${remaining} remaining on this line.`);
  }

  const requestedReadyQty = add;
  const { deductFloor2ForQuoteLineReady } = await import('./quoteProductionFloor2LineDeduct.js');
  const floor2 = await deductFloor2ForQuoteLineReady(sb, summary, add);
  const floor2QtyCapped = floor2.deducted > 0 && floor2.ready_qty < requestedReadyQty;
  if (floor2.ready_qty < add) add = floor2.ready_qty;

  if (!meta.line_progress?.[String(itemId)]?.ordered_qty) {
    const seeded = meta.line_progress && typeof meta.line_progress === 'object'
      ? { ...meta.line_progress }
      : {};
    const id = String(itemId);
    seeded[id] = {
      ...(seeded[id] || {}),
      ordered_qty: quoteLineOrderedQty(summary),
      completed_qty: Math.max(0, Number(seeded[id]?.completed_qty) || 0),
      slices: Array.isArray(seeded[id]?.slices) ? seeded[id].slices : [],
    };
    meta.line_progress = seeded;
  }
  const progressPatch = applyPartialLineProgressPatch(meta, itemId, add, { userId });

  const now = new Date().toISOString();
  const { error: upErr } = await sb.from(ROUTING).update({
    metadata: progressPatch,
    updated_at: now,
  }).eq('quote_id', qid);
  if (upErr) throw new Error(upErr.message || 'Failed to save line progress');

  const lines = items.map((it) => buildProductionLineSummaryRow(it, progressPatch));
  if (normalizedRoute === 'upholstery' || normalizedRoute === 'carpentry') {
    try {
      const summary = lines.find((ln) => String(ln.id) === String(itemId)) || {};
      const remaining = lineRemainingQty(summary, progressPatch);
      const orderDone = allQuoteLinesFullyCompleted(lines, progressPatch);
      const payload = {
        kind: 'orderComplete',
        producedBy,
        customerName: progressPatch.customer_name,
        customerPhone: progressPatch.customer_phone,
        status: orderDone ? 'Completed' : 'Partial',
        products: [{
          name: String(summary.name || 'Product').trim(),
          qty: add,
          remainingQty: remaining,
        }],
      };
      if (normalizedRoute === 'upholstery') {
        const { queueUpholsteryProductionWhatsApp, hassanOrderSourceFromMeta } = await import(
          './upholsteryProductionWhatsAppNotify.js'
        );
        queueUpholsteryProductionWhatsApp({
          ...payload,
          orderSource: hassanOrderSourceFromMeta(progressPatch),
        });
      } else {
        const { queueCarpentryProductionWhatsApp, hassanOrderSourceFromMeta } = await import(
          './carpentryProductionWhatsAppNotify.js'
        );
        queueCarpentryProductionWhatsApp({
          ...payload,
          orderSource: hassanOrderSourceFromMeta(progressPatch),
        });
      }
    } catch (waErr) {
      console.warn('[quote-line-ready] WhatsApp notify failed:', waErr?.message || waErr);
    }
  }
  return {
    quote_id: qid,
    item_id: String(itemId),
    ready_qty: add,
    requested_ready_qty: requestedReadyQty,
    floor2_qty_capped: floor2QtyCapped,
    floor2_deducted: Math.max(0, Number(floor2.deducted) || 0),
    lines,
    line_progress: progressPatch.line_progress,
  };
}

function appendPartialDeliveryHold(meta, patch) {
  const list = Array.isArray(meta.partial_delivery_holds) ? [...meta.partial_delivery_holds] : [];
  list.push(patch);
  return { ...meta, partial_delivery_holds: list };
}

async function completeQuoteOrderIfAllLinesDone(sb, {
  quoteId,
  userId,
  destination,
  metadata,
}) {
  const items = await loadQuoteItems(sb, quoteId);
  const lines = items.map((it) => buildProductionLineSummaryRow(it, metadata));
  if (!allQuoteLinesFullyCompleted(lines, metadata)) {
    return null;
  }
  const { completeQuoteProductionOrder } = await import('./quoteProductionRouting.js');
  return completeQuoteProductionOrder(sb, {
    quoteId,
    userId,
    destination: destination === 'floor1' ? 'floor1' : 'delivery',
  });
}

function tagLastLineSliceDisposition(meta, itemId, disposition) {
  const id = String(itemId || '').trim();
  const next = meta && typeof meta === 'object' ? { ...meta } : {};
  const map = { ...(next.line_progress || {}) };
  const entry = map[id] && typeof map[id] === 'object' ? { ...map[id] } : null;
  if (!entry) return next;
  const slices = Array.isArray(entry.slices) ? [...entry.slices] : [];
  if (!slices.length) return next;
  const now = new Date().toISOString();
  slices[slices.length - 1] = {
    ...slices[slices.length - 1],
    disposition: String(disposition || '').trim(),
    handoff_at: now,
  };
  map[id] = { ...entry, slices, updated_at: now };
  return { ...next, line_progress: map };
}

/** User chose Floor 1 storage for a slice already recorded in line_progress. */
export async function handoffQuoteLinePartialToFloor1(sb, {
  quoteId,
  route,
  itemId,
  qty = null,
  userId = null,
} = {}) {
  const qid = String(quoteId || '').trim();
  const routing = await getQuoteProductionRouting(sb, qid);
  if (!routing) throw new Error('Quote routing not found');

  const meta = routing.metadata && typeof routing.metadata === 'object' ? { ...routing.metadata } : {};
  const entry = meta.line_progress?.[String(itemId)];
  if (!entry) throw new Error('No completed qty on this line yet');

  const sliceQty = qty != null
    ? Math.max(1, Math.floor(Number(qty)))
    : Math.max(1, Number(entry.slices?.[entry.slices.length - 1]?.qty) || 0);

  const nextMeta = tagLastLineSliceDisposition(meta, itemId, 'floor1');
  const now = new Date().toISOString();

  const orderComplete = await completeQuoteOrderIfAllLinesDone(sb, {
    quoteId: qid,
    userId,
    destination: 'floor1',
    metadata: nextMeta,
  });
  if (orderComplete) {
    const { error } = await sb.from(ROUTING).update({
      metadata: nextMeta,
      updated_at: now,
    }).eq('quote_id', qid);
    if (error) throw new Error(error.message || 'Failed to save Floor 1 handoff');
    return {
      metadata: nextMeta,
      order_completed: true,
      ...orderComplete,
    };
  }

  try {
    const items = await loadQuoteItems(sb, qid);
    const raw = findQuoteLine(items, itemId);
    const summary = raw ? buildProductionLineSummaryRow(raw, meta) : null;
    const { printQuoteOrderLineLabels } = await import('./quoteProductionRouting.js');
    await printQuoteOrderLineLabels(sb, {
      lines: [{
        ...raw,
        name: String(summary?.name || '').trim(),
        quantity: sliceQty,
      }],
      quoteNumber: meta.quote_number,
      customerName: meta.customer_name,
      customerPhone: meta.customer_phone,
      qtyFallback: sliceQty,
      printedBy: 'Floor 1 stock',
    });
  } catch (labelErr) {
    console.warn('[handoffQuoteLinePartialToFloor1] label print failed:', labelErr?.message || labelErr);
  }

  const run = await findActiveQuoteRun(sb, qid);
  const assemblyId = run?.assembly_id || meta.primary_assembly_id || null;
  if (!assemblyId) throw new Error('No assembly linked for Floor 1 stock');

  const { buildPendingFloor1Credit } = await import('./floor1CreditApproval.js');
  nextMeta.pending_floor1_credit = buildPendingFloor1Credit({
    assemblyId,
    qty: sliceQty,
    requestedBy: userId,
    source: 'quote_partial',
  });
  nextMeta.floor1_awaiting_hassan = true;
  const receipts = Array.isArray(nextMeta.partial_floor1_receipts) ? [...nextMeta.partial_floor1_receipts] : [];
  receipts.push({
    id: newUuid(),
    quote_id: qid,
    item_id: String(itemId),
    quantity: sliceQty,
    assembly_id: String(assemblyId),
    registered_at: now,
    by: userId || null,
    pending_approval: true,
    department: String(route || routing.route || 'upholstery').toLowerCase(),
  });
  nextMeta.partial_floor1_receipts = receipts;

  const { error } = await sb.from(ROUTING).update({
    metadata: nextMeta,
    updated_at: now,
  }).eq('quote_id', qid);
  if (error) throw new Error(error.message || 'Failed to save Floor 1 handoff');

  return { metadata: nextMeta, floor1_credited: false, floor1_pending_approval: true, quantity: sliceQty, order_completed: false };
}

/** User chose delivery for a slice already recorded in line_progress. */
export async function handoffQuoteLinePartialToDelivery(sb, {
  quoteId,
  route,
  itemId,
  qty = null,
  userId = null,
} = {}) {
  const qid = String(quoteId || '').trim();
  const routing = await getQuoteProductionRouting(sb, qid);
  if (!routing) throw new Error('Quote routing not found');

  const meta = routing.metadata && typeof routing.metadata === 'object' ? { ...routing.metadata } : {};
  const entry = meta.line_progress?.[String(itemId)];
  if (!entry) throw new Error('No completed qty on this line yet');

  const sliceQty = qty != null
    ? Math.max(1, Math.floor(Number(qty)))
    : Math.max(1, Number(entry.slices?.[entry.slices.length - 1]?.qty) || 0);

  const items = await loadQuoteItems(sb, qid);
  const raw = findQuoteLine(items, itemId);
  const name = String(raw?.name_override || raw?.name || 'Product').trim();
  const summary = buildProductionLineSummaryRow(raw, meta);
  const { data: quoteRow } = await sb.from('quotations').select('quote_number').eq('id', qid).maybeSingle();

  const nextMetaTagged = tagLastLineSliceDisposition(meta, itemId, 'delivery');
  const now = new Date().toISOString();

  const orderComplete = await completeQuoteOrderIfAllLinesDone(sb, {
    quoteId: qid,
    userId,
    destination: 'delivery',
    metadata: nextMetaTagged,
  });
  if (orderComplete) {
    const { error } = await sb.from(ROUTING).update({
      metadata: nextMetaTagged,
      updated_at: now,
    }).eq('quote_id', qid);
    if (error) throw new Error(error.message || 'Failed to save delivery handoff');
    return {
      metadata: nextMetaTagged,
      order_completed: true,
      ...orderComplete,
    };
  }

  const run = await findActiveQuoteRun(sb, qid);
  const assemblyId = run?.assembly_id || meta.primary_assembly_id || null;
  if (!assemblyId) throw new Error('No assembly linked for delivery handoff');

  const holdId = newUuid();
  const orderedQty = quoteLineOrderedQty(summary);
  const hold = {
    id: holdId,
    quote_id: qid,
    quote_number: quoteRow?.quote_number || null,
    item_id: String(itemId),
    line_name: name,
    quantity: sliceQty,
    ordered_qty: orderedQty,
    department: String(route || routing.route || 'upholstery').toLowerCase(),
    assembly_id: String(assemblyId),
    registered_at: now,
    stage: DELIVERY_ADMIN_STAGE.AWAITING_DRIVER,
    kind: DELIVERY_ADMIN_KIND.ORDER,
    partial: true,
    customer_name: String(meta.customer_name || '').trim() || null,
    customer_phone: String(meta.customer_phone || '').trim() || null,
    showroom_order: meta.showroom_order === true,
    by: userId || null,
  };

  const nextMeta = appendPartialDeliveryHold(nextMetaTagged, hold);
  const { error } = await sb.from(ROUTING).update({
    metadata: nextMeta,
    updated_at: now,
  }).eq('quote_id', qid);
  if (error) throw new Error(error.message || 'Failed to register partial delivery');

  try {
    const { notifyDeliveryOrderReadyForDriver } = await import('./productionExpoPush.js');
    await notifyDeliveryOrderReadyForDriver({
      assemblyName: `${name} × ${sliceQty}`,
      qty: sliceQty,
      department: hold.department,
      jobId: qid,
      quoteNumber: hold.quote_number,
    });
  } catch {
    // optional push
  }

  return { hold, metadata: nextMeta, order_completed: false };
}

export async function handoffQuoteLinePartialToPainting(sb, {
  quoteId,
  itemId,
  qty = null,
  userId = null,
} = {}) {
  const qid = String(quoteId || '').trim();
  const { sendPartialCarpentryQuoteLineToPainting } = await import('./paintingProductionJobs.js');
  return sendPartialCarpentryQuoteLineToPainting(sb, {
    quoteId: qid,
    itemId,
    productQty: qty,
    userId,
  });
}

export async function assertQuoteReadyForFullComplete(sb, quoteId, { productionLineSet = null } = {}) {
  const routing = await getQuoteProductionRouting(sb, quoteId);
  const meta = routing?.metadata || {};
  const progress = meta.line_progress && typeof meta.line_progress === 'object' ? meta.line_progress : {};
  if (!Object.keys(progress).length) {
    return;
  }
  const items = await loadQuoteItems(sb, quoteId);
  let lines = items.map((it) => buildProductionLineSummaryRow(it, meta));
  const lineSet = normalizeProductionLineSet(productionLineSet);
  if (lineSet) lines = filterLinesForProductionLineSet(lines, lineSet);
  if (!lines.length) return;
  if (!allQuoteLinesFullyCompleted(lines, meta)) {
    const pending = lines
      .filter((l) => lineRemainingQty(l, meta) > 0)
      .map((l) => `${l.name} (${lineRemainingQty(l, meta)} left)`)
      .join(', ');
    throw new Error(`Complete all lines before ending the order${pending ? `: ${pending}` : '.'}`);
  }
}