import db from '../dataClient';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
} from './warehouseDelivery';
import {
  filterRowsByLocalDate,
  parseReportLocalRange,
  rowTimestampInLocalRange,
} from './reportDateRange';

function assemblyLabel(row, fallbackId) {
  const name = String(row?.product_name || row?.assembly_name || '').trim();
  const sku = String(row?.product_sku || row?.assembly_sku || '').trim();
  if (name && sku) return `${name} (${sku})`;
  if (name) return name;
  if (sku) return sku;
  return fallbackId || '—';
}

export async function loadFloor1KitweDeliveryReportSessions(startDate, endDate) {
  const range = parseReportLocalRange(startDate, endDate);
  if (!range) return { sessions: [], entriesBySession: new Map() };

  const sessionSelect = 'id, delivery_number, from_location, to_location, created_at, transfer_datetime, submitted_at, status, total_qty, pdf_url, metadata';
  const { data: sessions, error } = await db
    .from('warehouse_delivery_sessions')
    .select(sessionSelect)
    .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
    .eq('to_location', WAREHOUSE_TO_LOCATION_ID)
    .order('created_at', { ascending: false })
    .limit(800);
  if (error) throw error;

  const inRange = (sessions || []).filter((s) => {
    const when = s.submitted_at || s.transfer_datetime || s.created_at;
    return rowTimestampInLocalRange(when, startDate, endDate);
  });

  const ids = inRange.map((s) => s.id).filter(Boolean);
  const entriesBySession = new Map();
  if (ids.length) {
    const { data: entryRows, error: entryErr } = await db
      .from('warehouse_delivery_entries')
      .select('id, session_id, product_id, kind, name, sku, quantity, edited_quantity, metadata')
      .in('session_id', ids);
    if (entryErr) throw entryErr;
    (entryRows || []).forEach((row) => {
      const sid = String(row.session_id || '');
      if (!sid) return;
      if (!entriesBySession.has(sid)) entriesBySession.set(sid, []);
      entriesBySession.get(sid).push(row);
    });
  }

  return { sessions: inRange, entriesBySession };
}

export async function loadCarpentryProductionReportRows(startDate, endDate) {
  const [{ data: jobs, error: jobErr }, { data: runs, error: runErr }] = await Promise.all([
    db.from('carpentry_production_jobs').select('*').limit(800),
    db.from('carpentry_production_runs').select('*').limit(1500),
  ]);
  if (jobErr && !/not found|does not exist/i.test(String(jobErr.message || ''))) throw jobErr;
  if (runErr && !/not found|does not exist/i.test(String(runErr.message || ''))) throw runErr;

  const rows = [];

  (jobs || []).forEach((job) => {
    const completedAt = job.completed_at;
    if (!completedAt || !rowTimestampInLocalRange(completedAt, startDate, endDate)) return;
    if (String(job.status || '').toLowerCase() !== 'completed') return;
    rows.push({
      id: `job-${job.id}`,
      kind: 'Carpentry job',
      date: completedAt,
      product: assemblyLabel(job, job.assembly_id),
      qty: 1,
      user: job.accepted_by || '—',
      sentTo: 'Warehouse Floor 2',
    });
  });

  (runs || []).forEach((run) => {
    const when = run.completed_at || run.created_at;
    if (!when || !rowTimestampInLocalRange(when, startDate, endDate)) return;
    const meta = run.metadata || {};
    if (String(run.source || '') === 'carpentry_finishing') return;
    if (meta.painting_job_id) return;
    const channel = String(meta.channel || '');
    const isManufacture = channel === 'carpentry_workshop_app' && !meta.carpentry_job_id;
    const isJobFinish = Boolean(meta.carpentry_job_id);
    if (!isManufacture && !isJobFinish && String(run.source || '') !== 'carpentry_floor') return;
    rows.push({
      id: `run-${run.id}`,
      kind: isManufacture ? 'Manufacture' : 'Carpentry job',
      date: when,
      product: run.assembly_id || '—',
      qty: Math.max(1, Number(run.product_qty) || 1),
      user: run.accepted_by || '—',
      sentTo: 'Warehouse Floor 2',
      assembly_id: run.assembly_id,
    });
  });

  const assemblyIds = [...new Set(rows.map((r) => r.assembly_id).filter(Boolean))];
  if (assemblyIds.length) {
    const { data: assemblies } = await db
      .from('warehouse_assemblies')
      .select('id, name, family_sku')
      .in('id', assemblyIds);
    const byId = new Map((assemblies || []).map((a) => [String(a.id), a]));
    rows.forEach((row) => {
      if (row.product && !row.assembly_id) return;
      const a = byId.get(String(row.assembly_id));
      if (a) row.product = assemblyLabel({ product_name: a.name, product_sku: a.family_sku }, row.assembly_id);
    });
  }

  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return rows;
}

export async function loadPaintingReportRows(startDate, endDate) {
  const [{ data: jobs, error: jobErr }, deliveryBundle] = await Promise.all([
    db.from('painting_production_jobs').select('*').limit(800),
    loadFloor1KitweDeliveryReportSessions(startDate, endDate),
  ]);
  if (jobErr && !/not found|does not exist/i.test(String(jobErr.message || ''))) throw jobErr;

  const kitweByAssembly = new Map();
  deliveryBundle.sessions.forEach((session) => {
    const sid = String(session.id);
    const entries = deliveryBundle.entriesBySession.get(sid) || [];
    const when = session.submitted_at || session.transfer_datetime || session.created_at;
    entries.forEach((entry) => {
      const aid = String(entry.product_id || entry.metadata?.assembly_id || '').trim();
      if (!aid) return;
      const prev = kitweByAssembly.get(aid);
      if (!prev || new Date(when).getTime() > new Date(prev.date).getTime()) {
        kitweByAssembly.set(aid, {
          date: when,
          deliveryNumber: session.delivery_number || session.id,
        });
      }
    });
  });

  const rows = [];
  (jobs || []).forEach((job) => {
    const usedAt = job.started_at || job.created_at;
    if (!usedAt || !rowTimestampInLocalRange(usedAt, startDate, endDate)) return;
    const meta = job.metadata || {};
    const qty = Math.max(1, Number(meta.floor2_deducted_qty ?? job.product_qty) || 1);
    const assemblyId = String(job.assembly_id || '').trim();
    const completed = String(job.status || '').toLowerCase() === 'completed';
    const kitwe = kitweByAssembly.get(assemblyId);
    let destination = 'In progress (Floor 2 consumed)';
    if (completed && kitwe) {
      destination = `Warehouse Floor 1, then Kitwe · ${kitwe.deliveryNumber}`;
    } else if (completed) {
      destination = 'Warehouse Floor 1 (finished stock)';
    } else if (kitwe) {
      destination = `Kitwe delivery · ${kitwe.deliveryNumber}`;
    }

    rows.push({
      id: job.id,
      usedAt,
      completedAt: job.completed_at || null,
      product: assemblyLabel(job, assemblyId),
      qty,
      user: job.accepted_by || '—',
      destination,
    });
  });

  rows.sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime());
  return rows;
}

export function repairOrderSourceLabel(order) {
  const meta = order?.metadata || {};
  const posSale = order?.pos_sale_id || meta.pos_sale_id || meta.posSaleId;
  if (posSale) return 'Customer sale return';
  if (order?.sale_id) return 'Customer sale return';
  if (order?.customer_name) return 'Customer sale return';
  return 'Kitwe / warehouse return';
}

export function filterRepairOrdersForReport(orders, startDate, endDate) {
  return filterRowsByLocalDate(orders, startDate, endDate, 'created_at');
}
