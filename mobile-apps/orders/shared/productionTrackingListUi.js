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
  return sortProductionTrackingJobs(list);
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