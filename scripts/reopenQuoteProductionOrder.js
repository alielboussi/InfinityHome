/**
 * Reopen a mistakenly completed production quote (admin / ops).
 * Usage: node scripts/reopenQuoteProductionOrder.js QT#337 "reason"
 *
 * Inlined DB updates so this script does not load the full quoteProductionRouting graph.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', 'vercel.env') });

import { getDataClient } from '../server/lib/getDataClient.js';

const ROUTING = 'quote_production_routing';
const RUNS = 'carpentry_production_runs';

function quoteRunMeta(run) {
  return run?.metadata && typeof run.metadata === 'object' ? run.metadata : {};
}

async function resolveQuoteId(sb, raw) {
  const token = String(raw || '').trim();
  if (!token) throw new Error('quote id or QT# required');
  if (!/^qt#/i.test(token)) return token;
  const num = token.replace(/^qt#\s*/i, '').trim();
  const normalized = `QT#${num}`;
  const { data: row } = await sb.from('quotations').select('id, quote_number').eq('quote_number', normalized).maybeSingle();
  if (!row?.id) throw new Error(`Quote not found: ${normalized}`);
  return row.id;
}

async function findLatestQuoteOrderRun(sb, quoteId) {
  const { data, error } = await sb
    .from(RUNS)
    .select('*')
    .eq('quote_id', String(quoteId))
    .eq('source', 'quote_order')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load production run');
  const runs = data || [];
  return runs[0] || null;
}

async function reopenQuoteProductionOrder(sb, { quoteId, reason = '' } = {}) {
  const qid = String(quoteId || '').trim();
  if (!qid) throw new Error('quote_id required');

  const { data: routing, error: rErr } = await sb.from(ROUTING).select('*').eq('quote_id', qid).maybeSingle();
  if (rErr) throw new Error(rErr.message || 'Failed to load routing');
  if (!routing?.sent_to_production_at) throw new Error('Quote has not been sent to production');

  const run = await findLatestQuoteOrderRun(sb, qid);
  if (!run) throw new Error('No production run for this quote');

  const routingOpen = !routing.completed_at && !routing.metadata?.delivery_admin?.stage;
  if (routingOpen && !run.completed_at) {
    return { quote_id: qid, already_open: true };
  }

  const now = new Date().toISOString();
  const meta = { ...(routing.metadata || {}) };
  if (meta.segment_cards && typeof meta.segment_cards === 'object') {
    const segment_cards = { ...meta.segment_cards };
    for (const key of Object.keys(segment_cards)) {
      const card = segment_cards[key];
      if (card && typeof card === 'object' && card.completed_at) {
        segment_cards[key] = { ...card, completed_at: null };
      }
    }
    meta.segment_cards = segment_cards;
  }
  const prevAdmin = meta.delivery_admin;
  if (prevAdmin && typeof prevAdmin === 'object') {
    meta.delivery_admin_cancelled = { ...prevAdmin, cancelled_at: now };
  }
  meta.delivery_admin = null;
  meta.production_reopened_at = now;
  const note = String(reason || '').trim();
  if (note) meta.production_reopen_reason = note;

  const { error: routeErr } = await sb.from(ROUTING).update({
    completed_at: null,
    metadata: meta,
    updated_at: now,
  }).eq('quote_id', qid);
  if (routeErr) throw new Error(routeErr.message || 'Failed to reopen routing');

  const runMeta = quoteRunMeta(run);
  let accumulated = Math.max(0, Number(runMeta.accumulated_ms) || 0);
  if (run.completed_at && run.started_at) {
    const a = new Date(run.started_at).getTime();
    const b = new Date(run.completed_at).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      accumulated = Math.max(accumulated, b - a);
    }
  }

  const { error: runErr } = await sb.from(RUNS).update({
    completed_at: null,
    metadata: {
      ...runMeta,
      timer_status: 'paused',
      paused_at: now,
      accumulated_ms: accumulated,
      production_reopened_at: now,
    },
    updated_at: now,
  }).eq('id', run.id);
  if (runErr) throw new Error(runErr.message || 'Failed to reopen production run');

  return {
    quote_id: qid,
    run_id: run.id,
    reopened_at: now,
    accumulated_ms: accumulated,
    delivery_admin_cleared: Boolean(prevAdmin),
  };
}

async function main() {
  const arg = process.argv[2];
  const reason = process.argv.slice(3).join(' ').trim() || 'mistaken complete (ops script)';
  if (!arg) {
    console.error('Usage: node scripts/reopenQuoteProductionOrder.js <quote_id|QT#n> [reason]');
    process.exit(1);
  }
  const sb = getDataClient();
  const quoteId = await resolveQuoteId(sb, arg);
  const result = await reopenQuoteProductionOrder(sb, { quoteId, reason });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});