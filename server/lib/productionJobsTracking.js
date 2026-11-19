import {
  computeProductionFlowStatus,
  isActiveProductionJobStatus,
  productTitleForTrackingJob,
  productionDepartmentLabel,
} from '../../src/utils/productionJobFlowStatus.js';
import { sortProductionTrackingJobs } from '../../src/utils/productionTrackingListUi.js';

const TABLES = Object.freeze({
  upholstery: 'upholstery_production_jobs',
  carpentry: 'carpentry_production_jobs',
  painting: 'painting_production_jobs',
});

function normalizeDepartmentFilter(raw) {
  const d = String(raw || '').trim().toLowerCase();
  if (!d || d === 'all') return null;
  if (d === 'upholstery' || d === 'carpentry' || d === 'painting') return d;
  return null;
}

function computeElapsedMs(job, nowMs = Date.now()) {
  let ms = Math.max(0, Number(job.accumulated_ms) || 0);
  if (job.status === 'running' && job.timer_started_at) {
    const started = new Date(job.timer_started_at).getTime();
    if (Number.isFinite(started)) ms += Math.max(0, nowMs - started);
  }
  return ms;
}

function assemblyKeyForRow(department, row) {
  if (department === 'upholstery') {
    return String(row.finished_assembly_id || row.assembly_id || '').trim();
  }
  return String(row.assembly_id || '').trim();
}

function deliveryAdminStage(meta) {
  const admin = meta?.delivery_admin && typeof meta.delivery_admin === 'object' ? meta.delivery_admin : {};
  return String(admin.stage || '').trim().toLowerCase();
}

function quoteOrderFlowStatus(routing, run) {
  const meta = routing?.metadata && typeof routing.metadata === 'object' ? routing.metadata : {};
  if (routing?.completed_at) {
    const stage = deliveryAdminStage(meta);
    if (stage === 'awaiting_driver') return 'Ready For Delivery';
    if (stage === 'collected_by_driver') return 'With driver';
    if (stage === 'delivery_completed') return 'Delivered';
    return 'Production complete';
  }
  if (routing?.accepted_at || run?.started_at) {
    const runMeta = run?.metadata && typeof run.metadata === 'object' ? run.metadata : {};
    const paused = String(runMeta.timer_status || '').toLowerCase() === 'paused' || Boolean(runMeta.paused_at);
    if (paused) return 'In production (paused)';
    return 'In production';
  }
  return 'Awaiting workshop';
}

function toTrackingRow(department, row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const qty = Math.max(1, Math.floor(Number(row.product_qty) || 1));
  const flowStatus = computeProductionFlowStatus(department, row);
  return {
    id: String(row.id),
    track_kind: 'factory',
    production_job_id: String(row.id),
    department,
    department_label: productionDepartmentLabel(department),
    assembly_id: assemblyKeyForRow(department, row),
    product_name: productTitleForTrackingJob({
      product_name: row.product_name,
      finished_name: row.finished_name,
      raw_name: row.raw_name,
      assembly_id: row.assembly_id,
    }),
    product_sku: String(row.product_sku || row.finished_sku || '').trim(),
    product_qty: qty,
    timer_status: String(row.status || '').trim().toLowerCase(),
    flow_status: flowStatus,
    accumulated_ms: Number(row.accumulated_ms) || 0,
    elapsed_ms: computeElapsedMs(row),
    timer_started_at: row.timer_started_at || null,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
  };
}

async function listQuoteOrdersForTracking(sb) {
  const { data: routes, error } = await sb
    .from('quote_production_routing')
    .select('quote_id, route, sent_to_production_at, accepted_at, completed_at, metadata')
    .not('sent_to_production_at', 'is', null)
    .order('sent_to_production_at', { ascending: false })
    .limit(250);
  if (error) return [];
  const quoteIds = (routes || []).map((r) => r.quote_id).filter(Boolean);
  if (!quoteIds.length) return [];
  const { data: runs } = await sb
    .from('carpentry_production_runs')
    .select('*')
    .eq('source', 'quote_order')
    .in('quote_id', quoteIds);
  const runByQuote = new Map((runs || []).map((r) => [String(r.quote_id), r]));
  const out = [];
  for (const routing of routes || []) {
    const qid = String(routing.quote_id);
    const meta = routing.metadata && typeof routing.metadata === 'object' ? routing.metadata : {};
    const run = runByQuote.get(qid) || null;
    const runMeta = run?.metadata && typeof run.metadata === 'object' ? run.metadata : {};
    const route = String(routing.route || 'upholstery').toLowerCase();
    const lines = Array.isArray(meta.lines) ? meta.lines : [];
    const firstLine = lines[0] || {};
    const productName = String(firstLine.name || meta.quote_number || `Quote ${qid.slice(0, 8)}`).trim();
    let timerStatus = 'ready';
    if (run) {
      if (run.completed_at || routing.completed_at) timerStatus = 'completed';
      else if (runMeta.paused_at || String(runMeta.timer_status || '').toLowerCase() === 'paused') timerStatus = 'paused';
      else if (run.started_at) timerStatus = 'running';
    }
    const accumulated = Math.max(0, Number(runMeta.accumulated_ms) || 0);
    out.push({
      id: `quote:${qid}`,
      track_kind: meta.showroom_order === true ? 'showroom_order' : 'quote_order',
      quote_id: qid,
      quote_number: meta.quote_number || null,
      showroom_order: meta.showroom_order === true,
      customer_order: meta.customer_order === true,
      customer_name: meta.customer_name || null,
      production_job_id: run?.id || null,
      department: route,
      department_label: productionDepartmentLabel(route),
      product_name: productName,
      product_sku: '',
      product_qty: Math.max(1, Number(firstLine.quantity) || 1),
      timer_status: timerStatus,
      flow_status: quoteOrderFlowStatus(routing, run),
      accumulated_ms: accumulated,
      elapsed_ms: run ? computeElapsedMs({
        accumulated_ms: accumulated,
        status: timerStatus,
        timer_started_at: run.started_at,
      }) : 0,
      timer_started_at: run?.started_at || null,
      started_at: routing.accepted_at || run?.started_at || routing.sent_to_production_at,
      completed_at: routing.completed_at || run?.completed_at || null,
    });
  }
  return out;
}

async function listRepairsForTracking(sb) {
  const { listWarehouseReturnOrders } = await import('./warehouseReturnOrders.js');
  const { return_orders: repairs } = await listWarehouseReturnOrders(sb, { trackageOnly: true, limit: 200 });
  return (repairs || []).map((row) => {
    const dept = String(row.repair_department || 'carpentry').toLowerCase();
    const normalizedDept = dept.includes('uphol') ? 'upholstery' : (dept.includes('paint') ? 'painting' : 'carpentry');
    return {
      id: `repair:${row.id}`,
      track_kind: 'repair',
      return_number: row.return_number || row.id,
      repair_id: row.id,
      department: normalizedDept,
      department_label: productionDepartmentLabel(normalizedDept),
      product_name: String(row.assembly_name || row.customer_name || 'Repair').trim(),
      product_sku: '',
      product_qty: Math.max(1, Number(row.quantity) || 1),
      timer_status: row.timer_status || 'ready',
      flow_status: row.lifecycle_badge || String(row.status || 'Repair').replace(/_/g, ' '),
      accumulated_ms: Math.max(0, Number(row.accumulated_ms) || 0),
      elapsed_ms: Math.max(0, Number(row.elapsed_ms) || 0),
      timer_started_at: row.timer_started_at || null,
      started_at: row.work_started_at || row.created_at || null,
      completed_at: row.work_completed_at || null,
      customer_name: row.customer_name || null,
    };
  });
}

function normalizeTrackKindFilter(raw) {
  const k = String(raw || '').trim().toLowerCase();
  if (!k || k === 'all') return null;
  if (k === 'factory' || k === 'quote' || k === 'quote_order' || k === 'showroom' || k === 'repair') return k;
  return null;
}

function shouldHideBehindPainting(department, row, activePaintingAssemblyIds) {
  const key = assemblyKeyForRow(department, row);
  if (!key || !activePaintingAssemblyIds.has(key)) return false;
  const st = String(row.status || '').trim().toLowerCase();
  return isActiveProductionJobStatus(st) || st === 'completed';
}

async function loadTableJobs(sb, table) {
  const { data, error } = await sb.from(table).select('*').limit(500);
  if (error) {
    if (/not found|does not exist/i.test(String(error.message || ''))) return [];
    throw new Error(error.message || `Failed to load ${table}`);
  }
  return data || [];
}

/** Unified Hassan / Orders tracking — all departments, flow status, no materials. */
export async function listProductionJobsForTracking(sb, {
  department = null,
  track_kind = null,
  limit = 300,
} = {}) {
  const deptFilter = normalizeDepartmentFilter(department);
  const kindFilter = normalizeTrackKindFilter(track_kind);
  const cap = Math.min(500, Math.max(1, Number(limit) || 300));

  const includeFactory = !kindFilter || kindFilter === 'factory';
  const includeQuote = !kindFilter || kindFilter === 'quote' || kindFilter === 'quote_order' || kindFilter === 'showroom';
  const includeRepair = !kindFilter || kindFilter === 'repair';

  const [upholstery, carpentry, painting, quoteRows, repairRows] = await Promise.all([
    !includeFactory || (deptFilter && deptFilter !== 'upholstery') ? [] : loadTableJobs(sb, TABLES.upholstery),
    !includeFactory || (deptFilter && deptFilter !== 'carpentry') ? [] : loadTableJobs(sb, TABLES.carpentry),
    !includeFactory || (deptFilter && deptFilter !== 'painting') ? [] : loadTableJobs(sb, TABLES.painting),
    includeQuote ? listQuoteOrdersForTracking(sb) : [],
    includeRepair ? listRepairsForTracking(sb) : [],
  ]);

  const activePaintingAssemblyIds = new Set();
  for (const row of painting) {
    if (!isActiveProductionJobStatus(row.status)) continue;
    const key = assemblyKeyForRow('painting', row);
    if (key) activePaintingAssemblyIds.add(key);
  }

  const merged = [];

  for (const row of upholstery) {
    if (shouldHideBehindPainting('upholstery', row, activePaintingAssemblyIds)) continue;
    merged.push(toTrackingRow('upholstery', row));
  }
  for (const row of carpentry) {
    if (shouldHideBehindPainting('carpentry', row, activePaintingAssemblyIds)) continue;
    merged.push(toTrackingRow('carpentry', row));
  }
  for (const row of painting) {
    merged.push(toTrackingRow('painting', row));
  }

  for (const row of quoteRows) {
    if (kindFilter === 'showroom' && !row.showroom_order) continue;
    if (deptFilter && row.department !== deptFilter) continue;
    merged.push(row);
  }
  for (const row of repairRows) {
    if (deptFilter && row.department !== deptFilter) continue;
    merged.push(row);
  }

  const sorted = sortProductionTrackingJobs(merged);

  return {
    jobs: sorted.slice(0, cap),
    departments: ['upholstery', 'carpentry', 'painting'],
  };
}
