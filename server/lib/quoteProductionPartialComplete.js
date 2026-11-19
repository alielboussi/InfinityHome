import { newUuid } from './uuid.js';
import {
  applyPartialLineProgressPatch,
  allQuoteLinesFullyCompleted,
  lineRemainingQty,
  quoteLineOrderedQty,
} from '../../src/utils/quoteProductionLineProgress.js';
import { buildProductionLineSummaryRow } from '../../src/utils/quoteProductionItemFields.js';
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

async function findActiveQuoteRun(sb, quoteId) {
  const { data, error } = await sb
    .from(RUNS)
    .select('*')
    .eq('quote_id', String(quoteId))
    .eq('source', 'quote_order')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load production run');
  return data || null;
}

/** Mark qty ready on one line; does not end order timer or routing.completed_at. */
export async function markQuoteLinePartialReady(sb, {
  quoteId,
  route,
  itemId,
  readyQty,
  userId = null,
} = {}) {
  const qid = String(quoteId || '').trim();
  const normalizedRoute = String(route || '').trim().toLowerCase();
  if (!qid || !itemId) throw new Error('quote_id and item_id required');

  const routing = await getQuoteProductionRouting(sb, qid);
  if (!routing?.sent_to_production_at) throw new Error('Quote has not been sent to production');
  if (routing.route !== normalizedRoute) throw new Error('Quote route mismatch');
  if (routing.completed_at) throw new Error('Quote production already completed');

  const run = await findActiveQuoteRun(sb, qid);
  if (!run || run.completed_at) throw new Error('No active production run for this quote');

  const items = await loadQuoteItems(sb, qid);
  const raw = findQuoteLine(items, itemId);
  if (!raw) throw new Error('Quote line not found');

  const meta = routing.metadata && typeof routing.metadata === 'object' ? { ...routing.metadata } : {};
  const summary = buildProductionLineSummaryRow(raw, meta);
  const remaining = lineRemainingQty(summary, meta);
  const add = Math.max(1, Math.floor(Number(readyQty) || 0));
  if (add > remaining) {
    throw new Error(`Only ${remaining} remaining on this line.`);
  }

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
  return {
    quote_id: qid,
    item_id: String(itemId),
    ready_qty: add,
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

  const run = await findActiveQuoteRun(sb, qid);
  const assemblyId = run?.assembly_id || meta.primary_assembly_id || null;
  if (!assemblyId) throw new Error('No assembly linked for Floor 1 stock');

  const { creditQuoteAssemblyUnitsToFloor1 } = await import('./quoteProductionRouting.js');
  await creditQuoteAssemblyUnitsToFloor1(sb, { assemblyId, qty: sliceQty });

  const receipts = Array.isArray(nextMeta.partial_floor1_receipts) ? [...nextMeta.partial_floor1_receipts] : [];
  receipts.push({
    id: newUuid(),
    quote_id: qid,
    item_id: String(itemId),
    quantity: sliceQty,
    assembly_id: String(assemblyId),
    registered_at: now,
    by: userId || null,
    department: String(route || routing.route || 'upholstery').toLowerCase(),
  });
  nextMeta.partial_floor1_receipts = receipts;

  const { error } = await sb.from(ROUTING).update({
    metadata: nextMeta,
    updated_at: now,
  }).eq('quote_id', qid);
  if (error) throw new Error(error.message || 'Failed to save Floor 1 handoff');

  return { metadata: nextMeta, floor1_credited: true, quantity: sliceQty, order_completed: false };
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
  const hold = {
    id: holdId,
    quote_id: qid,
    quote_number: quoteRow?.quote_number || null,
    item_id: String(itemId),
    line_name: name,
    quantity: sliceQty,
    department: String(route || routing.route || 'upholstery').toLowerCase(),
    assembly_id: String(assemblyId),
    registered_at: now,
    stage: DELIVERY_ADMIN_STAGE.AWAITING_DRIVER,
    kind: DELIVERY_ADMIN_KIND.ORDER,
    partial: true,
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

export async function assertQuoteReadyForFullComplete(sb, quoteId) {
  const routing = await getQuoteProductionRouting(sb, quoteId);
  const meta = routing?.metadata || {};
  const progress = meta.line_progress && typeof meta.line_progress === 'object' ? meta.line_progress : {};
  if (!Object.keys(progress).length) {
    return;
  }
  const items = await loadQuoteItems(sb, quoteId);
  const lines = items.map((it) => buildProductionLineSummaryRow(it, meta));
  if (!allQuoteLinesFullyCompleted(lines, meta)) {
    const pending = lines
      .filter((l) => lineRemainingQty(l, meta) > 0)
      .map((l) => `${l.name} (${lineRemainingQty(l, meta)} left)`)
      .join(', ');
    throw new Error(`Complete all lines before ending the order${pending ? `: ${pending}` : '.'}`);
  }
}