/** Shared Orders app + /warehouse-returns-trackage list layout (sort, filters). */

export const PRODUCTION_TRACKING_DEPARTMENTS = Object.freeze([
  { value: 'all', label: 'All departments' },
  { value: 'upholstery', label: 'Upholstery' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'painting', label: 'Painting' },
]);

export const PRODUCTION_TRACKING_KINDS = Object.freeze([
  { value: 'all', label: 'All types' },
  { value: 'factory', label: 'Factory job' },
  { value: 'quote', label: 'Quote order' },
  { value: 'showroom', label: 'Showroom order' },
  { value: 'repair', label: 'Repair' },
]);

export const PRODUCTION_TRACKING_PROGRESS = Object.freeze([
  { value: 'all', label: 'In progress & completed' },
  { value: 'in_progress', label: 'In progress only' },
  { value: 'completed', label: 'Completed only' },
]);

export function isProductionTrackingJobCompleted(row) {
  if (!row) return false;
  if (row.completed_at) return true;
  const timer = String(row.timer_status || '').trim().toLowerCase();
  if (timer === 'completed') return true;
  const flow = String(row.flow_status || '').trim().toLowerCase();
  if (flow === 'delivered' || flow === 'production complete') return true;
  return false;
}

export function rowMatchesProductionTrackKind(row, trackKind) {
  const filter = String(trackKind || 'all').trim().toLowerCase();
  if (!filter || filter === 'all') return true;
  const k = String(row?.track_kind || 'factory').trim().toLowerCase();
  if (filter === 'factory') return k === 'factory';
  if (filter === 'quote') return k === 'quote_order';
  if (filter === 'showroom') return k === 'showroom_order';
  if (filter === 'repair') return k === 'repair';
  return true;
}

export function rowMatchesProductionDepartment(row, department) {
  const filter = String(department || 'all').trim().toLowerCase();
  if (!filter || filter === 'all') return true;
  return String(row?.department || '').trim().toLowerCase() === filter;
}

export function productionTrackingSearchHaystack(row) {
  return [
    row?.product_name,
    row?.product_sku,
    row?.department,
    row?.department_label,
    row?.flow_status,
    row?.assembly_id,
    row?.track_kind,
    row?.quote_number,
    row?.return_number,
    row?.customer_name,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function sortProductionTrackingJobs(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ac = isProductionTrackingJobCompleted(a);
    const bc = isProductionTrackingJobCompleted(b);
    if (ac !== bc) return ac ? 1 : -1;
    const at = Date.parse(a?.started_at) || 0;
    const bt = Date.parse(b?.started_at) || 0;
    return bt - at;
  });
}

const FACTORY_TIMER_RANK = Object.freeze({
  running: 0,
  paused: 1,
  ready: 2,
  completed: 3,
});

function factoryTimerRank(row) {
  const st = String(row?.timer_status || '').trim().toLowerCase();
  return FACTORY_TIMER_RANK[st] ?? 9;
}

/** One card per order line / product — not per workshop unit job row. */
export function factoryTrackingCollapseKey(row) {
  const kind = String(row?.track_kind || 'factory').trim().toLowerCase();
  if (kind !== 'factory') return null;
  const dept = String(row?.department || '').trim().toLowerCase();
  const lineId = String(row?.quote_line_id || '').trim();
  if (lineId) return `${dept}|line|${lineId}`;
  const qid = String(row?.quote_id || '').trim();
  if (qid) return `${dept}|quote|${qid}`;
  const asm = String(row?.assembly_id || '').trim();
  if (asm) return `${dept}|asm|${asm}`;
  return `${dept}|job|${row.id}`;
}

function pickPrimaryFactoryRow(rows) {
  return [...rows].sort((a, b) => {
    const ra = factoryTimerRank(a);
    const rb = factoryTimerRank(b);
    if (ra !== rb) return ra - rb;
    const at = Date.parse(a?.started_at) || 0;
    const bt = Date.parse(b?.started_at) || 0;
    return bt - at;
  })[0];
}

function mergedFactoryQty(department, rows) {
  const qtys = rows.map((r) => Math.max(1, Math.floor(Number(r.product_qty) || 1)));
  const dept = String(department || '').trim().toLowerCase();
  if (dept === 'painting') return Math.max(...qtys);
  return qtys.reduce((sum, n) => sum + n, 0);
}

function mergeFactoryTrackingGroup(rows) {
  if (!rows?.length) return null;
  if (rows.length === 1) return rows[0];
  const primary = pickPrimaryFactoryRow(rows);
  const mergedIds = rows.map((r) => String(r.id));
  const startedAt = rows.reduce((min, r) => {
    const t = Date.parse(r?.started_at);
    if (!Number.isFinite(t)) return min;
    if (!min) return r.started_at;
    return t < Date.parse(min) ? r.started_at : min;
  }, null);
  const completedAt = rows.every((r) => r.completed_at)
    ? rows.map((r) => r.completed_at).sort().reverse()[0]
    : primary.completed_at;
  return {
    ...primary,
    id: String(primary.id),
    product_qty: mergedFactoryQty(primary.department, rows),
    started_at: startedAt || primary.started_at,
    completed_at: completedAt,
    collapsed_job_ids: mergedIds,
  };
}

/**
 * Collapse duplicate factory rows (same product / quote line) and drop quote-order cards
 * when a factory job already tracks that quote (e.g. painting queue after carpentry).
 */
export function collapseProductionTrackingDisplayRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const factory = [];
  const nonFactory = [];
  for (const row of list) {
    const kind = String(row?.track_kind || 'factory').trim().toLowerCase();
    if (kind === 'factory') factory.push(row);
    else nonFactory.push(row);
  }

  const groups = new Map();
  for (const row of factory) {
    const key = factoryTrackingCollapseKey(row) || `job|${row.id}`;
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  const collapsedFactory = [];
  for (const bucket of groups.values()) {
    const merged = mergeFactoryTrackingGroup(bucket);
    if (merged) collapsedFactory.push(merged);
  }

  const quoteIdsOnFactory = new Set();
  for (const row of collapsedFactory) {
    const qid = String(row?.quote_id || '').trim();
    if (qid) quoteIdsOnFactory.add(qid);
  }

  const filteredRest = nonFactory.filter((row) => {
    const kind = String(row?.track_kind || '').trim().toLowerCase();
    if (kind !== 'quote_order' && kind !== 'showroom_order') return true;
    const qid = String(row?.quote_id || '').trim();
    if (!qid) return true;
    return !quoteIdsOnFactory.has(qid);
  });

  return sortProductionTrackingJobs([...filteredRest, ...collapsedFactory]);
}

export function applyProductionTrackingFilters(rows, {
  search = '',
  department = 'all',
  trackKind = 'all',
  progress = 'all',
} = {}) {
  let list = Array.isArray(rows) ? rows : [];
  list = list.filter((row) => rowMatchesProductionDepartment(row, department));
  list = list.filter((row) => rowMatchesProductionTrackKind(row, trackKind));
  const q = String(search || '').trim().toLowerCase();
  if (q) {
    list = list.filter((row) => productionTrackingSearchHaystack(row).includes(q));
  }
  const prog = String(progress || 'all').trim().toLowerCase();
  if (prog === 'in_progress') {
    list = list.filter((row) => !isProductionTrackingJobCompleted(row));
  } else if (prog === 'completed') {
    list = list.filter((row) => isProductionTrackingJobCompleted(row));
  }
  return collapseProductionTrackingDisplayRows(sortProductionTrackingJobs(list));
}

/** In-progress rows first, then completed (each group sorted by started_at desc). */
export function partitionProductionTrackingJobs(rows) {
  const sorted = sortProductionTrackingJobs(rows);
  const inProgress = [];
  const completed = [];
  for (const row of sorted) {
    if (isProductionTrackingJobCompleted(row)) completed.push(row);
    else inProgress.push(row);
  }
  return { inProgress, completed };
}

export function isProductionTrackingFilterActive({
  department = 'all',
  trackKind = 'all',
  progress = 'all',
} = {}) {
  return department !== 'all' || trackKind !== 'all' || progress !== 'all';
}