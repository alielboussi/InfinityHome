/**
 * Floor 1 factory stock credit requires Hassan / catalog-admin approval.
 * Workshop finish only queues the request — no instant Floor 1 qty write-up.
 */
import { canManageCatalog } from '../../src/accessControl.js';
import { isLoginAccessAdmin } from './loginAccess.js';
import { isOrdersAppOwnerEmail } from '../../src/mobile/mobileAccessManifest.js';

export function actorMayApproveFloor1Credit(user) {
  if (!user) return false;
  if (isLoginAccessAdmin(user.email)) return true;
  if (canManageCatalog(user)) return true;
  if (isOrdersAppOwnerEmail(user.email)) return true;
  return false;
}

export function buildPendingFloor1Credit({
  assemblyId,
  qty,
  requestedBy,
  requestedEmail = '',
  source = 'quote',
} = {}) {
  return {
    assembly_id: String(assemblyId || '').trim(),
    qty: Math.max(1, Math.floor(Number(qty) || 1)),
    requested_by: requestedBy || null,
    requested_email: String(requestedEmail || '').trim().toLowerCase() || null,
    requested_at: new Date().toISOString(),
    source,
  };
}

export function assertSecondApprover(pending, user) {
  if (!actorMayApproveFloor1Credit(user)) {
    throw new Error('Floor 1 stock credit must be approved by Hassan Awad or an administrator.');
  }
  if (isLoginAccessAdmin(user?.email)) return;
  const reqId = String(pending?.requested_by || '').trim();
  const reqEmail = String(pending?.requested_email || '').trim().toLowerCase();
  const uid = String(user?.id || user?.uid || '').trim();
  const email = String(user?.email || '').trim().toLowerCase();
  if (reqId && uid && reqId === uid) {
    throw new Error('A second person must approve Floor 1 stock credit.');
  }
  if (reqEmail && email && reqEmail === email) {
    throw new Error('A second person must approve Floor 1 stock credit.');
  }
}

export async function applyApprovedFloor1Credit(sb, pending) {
  const aid = String(pending?.assembly_id || '').trim();
  const qty = Math.max(1, Math.floor(Number(pending?.qty) || 1));
  if (!aid) throw new Error('pending Floor 1 credit is missing assembly_id');
  const { creditQuoteAssemblyUnitsToFloor1 } = await import('./quoteProductionRouting.js');
  return creditQuoteAssemblyUnitsToFloor1(sb, { assemblyId: aid, qty });
}

export async function approvePendingFloor1Credit(sb, {
  quoteId = '',
  jobId = '',
  department = '',
  user = null,
} = {}) {
  const qid = String(quoteId || '').trim();
  const jid = String(jobId || '').trim();
  const now = new Date().toISOString();
  const approver = {
    id: user?.id || user?.uid || null,
    email: user?.email || null,
  };

  if (qid) {
    const { data: routing, error } = await sb
      .from('quote_production_routing')
      .select('quote_id, metadata')
      .eq('quote_id', qid)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Failed to load quote routing');
    if (!routing) throw new Error('Quote routing not found');
    const meta = routing.metadata && typeof routing.metadata === 'object' ? { ...routing.metadata } : {};
    const pending = meta.pending_floor1_credit;
    if (!pending?.assembly_id) throw new Error('No Floor 1 credit is waiting for approval on this order.');
    assertSecondApprover(pending, user);
    await applyApprovedFloor1Credit(sb, pending);
    const { error: updErr } = await sb.from('quote_production_routing').update({
      metadata: {
        ...meta,
        pending_floor1_credit: null,
        floor1_awaiting_hassan: false,
        factory_stock_added_at: now,
        floor1_credited: true,
        floor1_approved_at: now,
        floor1_approved_by: approver,
      },
      updated_at: now,
    }).eq('quote_id', qid);
    if (updErr) throw new Error(updErr.message || 'Failed to save Floor 1 approval');
    return { quote_id: qid, approved: true };
  }

  if (!jid) throw new Error('quote_id or job_id required');
  const dept = String(department || '').toLowerCase();
  const table = dept.includes('paint')
    ? 'painting_production_jobs'
    : dept.includes('uphol')
      ? 'upholstery_production_jobs'
      : 'carpentry_production_jobs';
  const { data: job, error: jErr } = await sb.from(table).select('*').eq('id', jid).maybeSingle();
  if (jErr) throw new Error(jErr.message || 'Failed to load job');
  if (!job) throw new Error('Production job not found');
  const meta = job.metadata && typeof job.metadata === 'object' ? { ...job.metadata } : {};
  const pending = meta.pending_floor1_credit;
  if (!pending?.assembly_id) throw new Error('No Floor 1 credit is waiting for approval on this job.');
  assertSecondApprover(pending, user);
  await applyApprovedFloor1Credit(sb, pending);
  const { error: jobErr } = await sb.from(table).update({
    metadata: {
      ...meta,
      pending_floor1_credit: null,
      floor1_credited: true,
      floor1_awaiting_hassan: false,
      floor1_approved_at: now,
      floor1_approved_by: approver,
    },
    updated_at: now,
  }).eq('id', jid);
  if (jobErr) throw new Error(jobErr.message || 'Failed to save Floor 1 approval');
  return { job_id: jid, department: table, approved: true };
}
