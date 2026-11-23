/**
 * Cancel active painting job(s) for a carpentry quote (QT# or quote uuid).
 *
 *   node scripts/cancelPaintingJobByQuote.js QT#337
 *   node scripts/cancelPaintingJobByQuote.js QT#337 --apply
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', 'vercel.env') });

import { getDataClient } from '../server/lib/getDataClient.js';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../src/constants/warehouseShowroomLocations.js';

const JOBS = 'painting_production_jobs';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const ACTIVE = new Set(['ready', 'running', 'paused']);

function paintingJobQuoteId(row) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return String(meta.carpentry_quote_id || meta.quote_id || '').trim();
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

async function resolveFloor2Id(sb) {
  const { data: locs } = await sb.from('locations').select('id, name');
  const row = (locs || []).find((l) => String(l.name || '').trim() === 'Warehouse Floor 2');
  return row?.id || null;
}

async function adjustAssemblyInventory(sb, assemblyId, locationId, delta) {
  const aid = String(assemblyId || '').trim();
  const loc = String(locationId || '').trim();
  const d = Number(delta) || 0;
  if (!aid || !loc || !d) return null;
  const { data: existing } = await sb
    .from(ASSEMBLY_INVENTORY)
    .select('quantity')
    .eq('assembly_id', aid)
    .eq('location_id', loc)
    .maybeSingle();
  const current = Number(existing?.quantity) || 0;
  const next = Math.max(0, current + d);
  const now = new Date().toISOString();
  await sb.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: aid,
    location_id: loc,
    quantity: next,
    updated_at: now,
  });
  return { assembly_id: aid, location_id: loc, qty: Math.abs(d), delta: d, quantity_after: next };
}

async function cancelJob(sb, job, reason) {
  const status = String(job.status || '').trim().toLowerCase();
  if (!ACTIVE.has(status)) {
    return { skipped: true, job_id: job.id, status };
  }
  const meta = job.metadata && typeof job.metadata === 'object' ? { ...job.metadata } : {};
  const qty = Math.max(1, Math.floor(Number(job.product_qty) || 1));
  const assemblyId = String(job.assembly_id || '').trim();
  const src = String(meta.inventory_source || 'floor2').toLowerCase();

  let stockRestored = null;
  if (assemblyId && src !== 'virtual_hold') {
    if (src === 'floor1') {
      const restoreQty = Math.max(0, Math.floor(Number(meta.factory_deducted_qty) || qty));
      if (restoreQty > 0) {
        stockRestored = await adjustAssemblyInventory(sb, assemblyId, WAREHOUSE_FACTORY_LOCATION_ID, restoreQty);
        if (stockRestored) stockRestored = { location: 'floor1', ...stockRestored };
      }
    } else {
      const floor2Id = meta.floor2_location_id || (await resolveFloor2Id(sb));
      const restoreQty = Math.max(0, Math.floor(Number(meta.floor2_deducted_qty) || qty));
      if (restoreQty > 0 && floor2Id) {
        stockRestored = await adjustAssemblyInventory(sb, assemblyId, floor2Id, restoreQty);
        if (stockRestored) stockRestored = { location: 'floor2', ...stockRestored };
      }
    }
  }

  const now = new Date().toISOString();
  const { error } = await sb.from(JOBS).update({
    status: 'cancelled',
    timer_started_at: null,
    paused_at: null,
    metadata: {
      ...meta,
      cancelled_at: now,
      cancel_reason: String(reason || '').trim() || null,
      stock_restore: stockRestored,
    },
    updated_at: now,
  }).eq('id', job.id);
  if (error) throw new Error(error.message || 'Failed to cancel job');

  return {
    job_id: job.id,
    product_name: job.product_name,
    quote_number: meta.quote_number || null,
    stock_restored: stockRestored,
    virtual_hold: src === 'virtual_hold',
  };
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return '';
  return String(process.argv[i + 1] || '').trim();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const jobId = argValue('--job-id');
  const productName = argValue('--name');
  const quoteToken = process.argv.find(
    (a) => a && !a.startsWith('-') && a !== '--apply',
  );

  if (jobId) {
    const sb = getDataClient();
    const { data: row, error } = await sb.from(JOBS).select('*').eq('id', jobId).maybeSingle();
    if (error) throw new Error(error.message || 'Failed to load job');
    if (!row?.id) throw new Error(`Job not found: ${jobId}`);
    const st = String(row.status || '').trim().toLowerCase();
    if (!ACTIVE.has(st)) {
      console.log(JSON.stringify({ job_id: jobId, status: row.status, message: 'Job is not active.' }, null, 2));
      return;
    }
    if (!apply) {
      console.log(JSON.stringify({ apply: false, job: { job_id: row.id, product_name: row.product_name, status: row.status } }, null, 2));
      console.log('\nDry run — pass --apply to cancel.');
      return;
    }
    console.log(JSON.stringify({ cancelled: await cancelJob(sb, row, 'cancelPaintingJobByQuote.js --job-id') }, null, 2));
    return;
  }

  if (!quoteToken && !productName) {
    console.error('Usage: node scripts/cancelPaintingJobByQuote.js QT#337 [--apply]');
    console.error('       node scripts/cancelPaintingJobByQuote.js --name "Product" [--apply]');
    console.error('       node scripts/cancelPaintingJobByQuote.js --job-id <uuid> [--apply]');
    process.exit(1);
  }

  const sb = getDataClient();
  let quoteId = '';
  if (quoteToken) {
    quoteId = await resolveQuoteId(sb, quoteToken);
  }
  const nameNeedle = String(productName || '').trim().toLowerCase();
  const { data: rows, error } = await sb.from(JOBS).select('*');
  if (error) throw new Error(error.message || 'Failed to list painting jobs');

  const matches = (rows || []).filter((row) => {
    const meta = row.metadata || {};
    const st = String(row.status || '').trim().toLowerCase();
    if (!ACTIVE.has(st)) return false;
    if (quoteId && (paintingJobQuoteId(row) === quoteId || meta.quote_number === `QT#${String(quoteToken).replace(/^qt#\s*/i, '')}`)) {
      return true;
    }
    if (nameNeedle && String(row.product_name || '').trim().toLowerCase().includes(nameNeedle)) return true;
    return false;
  });

  if (!matches.length) {
    console.log(JSON.stringify({ quote_id: quoteId, matches: [], message: 'No active painting jobs for this quote.' }, null, 2));
    return;
  }

  const plan = matches.map((row) => ({
    job_id: row.id,
    product_name: row.product_name,
    status: row.status,
    inventory_source: row.metadata?.inventory_source || null,
  }));
  console.log(JSON.stringify({ apply, quote_id: quoteId, matches: plan }, null, 2));

  if (!apply) {
    console.log('\nDry run — pass --apply to cancel and restore stock.');
    return;
  }

  const results = [];
  for (const row of matches) {
    results.push(await cancelJob(sb, row, 'cancelPaintingJobByQuote.js'));
  }
  console.log(JSON.stringify({ cancelled: results }, null, 2));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});