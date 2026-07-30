#!/usr/bin/env node
/**
 * Consolidate split layby down-payment batches into one pooled row per batch.
 * Skips PDF_ITEM_RESTORE migration allocations — those stay as-is (PDF uses fallback JSON).
 *
 * Usage:
 *   node scripts/consolidateSplitLaybyPayments.js --dry-run
 *   node scripts/consolidateSplitLaybyPayments.js --apply
 *   node scripts/consolidateSplitLaybyPayments.js --apply --customer-id=<uuid>
 *
 * Requires SUPABASE_SERVICE_ROLE (or service role in .env).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const FAHME_ID = 'd8e756ae-b8ea-4f90-b99a-70c1120f52b9';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = args.includes('--dry-run') || !apply;
const customerArg = args.find((arg) => arg.startsWith('--customer-id='));
const customerId = customerArg ? customerArg.split('=')[1] : FAHME_ID;

const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const supabase = createClient(url, key);

function isPlaceholderReference(value) {
  const raw = String(value || '').trim();
  return !raw || /^-+$/.test(raw);
}

function isMigrationRow(row) {
  const note = String(row?.notes || '');
  const ref = String(row?.reference || '');
  return /PDF_ITEM_RESTORE_/i.test(note) || /PDF_ITEM_RESTORE_/i.test(ref)
    || /PDF settlement allocation/i.test(note);
}

function isPdfRestoreLayby(layby) {
  return /PDF_ITEM_RESTORE_/i.test(String(layby?.notes || ''));
}

async function resolvePoolSaleId(cid) {
  const { data: laybys } = await supabase
    .from('laybys')
    .select('id, sale_id, notes, updated_at, created_at')
    .eq('customer_id', cid)
    .not('sale_id', 'is', null)
    .order('updated_at', { ascending: false });
  const realLayby = (laybys || []).find((row) => row?.sale_id != null && !isPdfRestoreLayby(row));
  if (realLayby?.sale_id != null) return realLayby.sale_id;

  const pdfTaggedSaleIds = new Set(
    (laybys || [])
      .filter(isPdfRestoreLayby)
      .map((row) => String(row?.sale_id || '').trim())
      .filter(Boolean),
  );
  const { data: sales } = await supabase
    .from('sales')
    .select('id, sale_date, created_at')
    .eq('customer_id', cid)
    .order('created_at', { ascending: true });
  const realSale = (sales || []).find((row) => !pdfTaggedSaleIds.has(String(row?.id || '').trim()));
  return realSale?.id ?? sales?.[0]?.id ?? laybys?.[0]?.sale_id ?? null;
}

async function fetchBatchRows(table, cid, batchId) {
  const columns = table === 'layby_payments'
    ? 'id, sale_id, customer_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid'
    : 'id, sale_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid';
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq('allocation_batch_uuid', batchId)
    .order('sale_id', { ascending: true });
  if (error) throw error;
  if (table === 'layby_payments') {
    return (data || []).filter((row) => String(row?.customer_id || '') === String(cid));
  }
  const { data: sales } = await supabase.from('sales').select('id').eq('customer_id', cid);
  const saleIds = new Set((sales || []).map((row) => String(row.id)));
  return (data || []).filter((row) => saleIds.has(String(row?.sale_id || '')));
}

async function listRealMultiRowBatches(cid) {
  const { data, error } = await supabase
    .from('layby_payments')
    .select('allocation_batch_uuid, notes, reference')
    .eq('customer_id', cid)
    .not('allocation_batch_uuid', 'is', null);
  if (error) throw error;

  const byBatch = new Map();
  (data || []).forEach((row) => {
    const batchId = String(row?.allocation_batch_uuid || '').trim();
    if (!batchId) return;
    if (!byBatch.has(batchId)) byBatch.set(batchId, []);
    byBatch.get(batchId).push(row);
  });

  return [...byBatch.entries()]
    .filter(([, rows]) => rows.length > 1)
    .filter(([, rows]) => rows.every((row) => !isMigrationRow(row)))
    .map(([batchId]) => batchId);
}

async function consolidateBatch({ cid, batchId, poolSaleId }) {
  const laybyRows = await fetchBatchRows('layby_payments', cid, batchId);
  const salesRows = await fetchBatchRows('sales_payments', cid, batchId);
  if (!laybyRows.length && !salesRows.length) {
    console.log(`No rows for batch ${batchId}`);
    return { ok: true, skipped: true };
  }
  if (laybyRows.some(isMigrationRow) || salesRows.some(isMigrationRow)) {
    console.log(`Batch ${batchId} skipped (migration allocation)`);
    return { ok: true, skipped: true };
  }
  if (laybyRows.length <= 1 && salesRows.length <= 1) {
    console.log(`Batch ${batchId} already consolidated (${laybyRows.length} layby / ${salesRows.length} sales rows)`);
    return { ok: true, skipped: true };
  }

  const template = laybyRows[0] || salesRows[0];
  const totalAmount = laybyRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const totalDiscount = laybyRows.reduce((sum, row) => sum + Number(row?.discount_amount || 0), 0);
  const reference = laybyRows.map((row) => row?.reference).find((value) => !isPlaceholderReference(value))
    || salesRows.map((row) => row?.reference).find((value) => !isPlaceholderReference(value))
    || null;
  const notes = laybyRows.map((row) => String(row?.notes || '').trim()).find(Boolean)
    || salesRows.map((row) => String(row?.notes || '').trim()).find(Boolean)
    || null;

  const consolidated = {
    sale_id: poolSaleId,
    customer_id: cid,
    amount: totalAmount,
    discount_amount: totalDiscount,
    payment_type: template?.payment_type || 'cash',
    payment_date: template?.payment_date || null,
    reference,
    notes,
    currency: template?.currency || 'USD',
    allocation_batch_uuid: batchId,
  };

  console.log('\nBatch:', batchId);
  console.log('  Split layby rows:', laybyRows.length, 'sales rows:', salesRows.length);
  console.log('  Total amount:', totalAmount, 'discount:', totalDiscount);
  console.log('  Pool sale_id:', poolSaleId);
  console.log('  Payment date:', consolidated.payment_date);
  laybyRows.forEach((row) => console.log('   layby', row.id, 'sale', row.sale_id, 'amt', row.amount));
  salesRows.forEach((row) => console.log('   sales', row.id, 'sale', row.sale_id, 'amt', row.amount));

  if (dryRun) {
    console.log('  [dry-run] Would delete split rows and insert one consolidated row per table.');
    return { ok: true, dryRun: true };
  }

  const laybyIds = laybyRows.map((row) => row.id).filter(Boolean);
  const salesIds = salesRows.map((row) => row.id).filter(Boolean);

  if (laybyIds.length) {
    const { error } = await supabase.from('layby_payments').delete().in('id', laybyIds);
    if (error) throw error;
  }
  if (salesIds.length) {
    const { error } = await supabase.from('sales_payments').delete().in('id', salesIds);
    if (error) throw error;
  }

  const { error: laybyInsErr } = await supabase.from('layby_payments').insert([{
    sale_id: consolidated.sale_id,
    customer_id: consolidated.customer_id,
    amount: consolidated.amount,
    discount_amount: consolidated.discount_amount,
    payment_type: consolidated.payment_type,
    payment_date: consolidated.payment_date,
    reference: consolidated.reference,
    notes: consolidated.notes,
    currency: consolidated.currency,
    allocation_batch_uuid: consolidated.allocation_batch_uuid,
  }]);
  if (laybyInsErr) throw laybyInsErr;

  // Only mirror into sales_payments when that table already had rows for this batch.
  // Inserting a new sales row when only layby_payments existed double-counts paid totals.
  if (salesRows.length) {
    const { error: salesInsErr } = await supabase.from('sales_payments').insert([{
      sale_id: consolidated.sale_id,
      amount: consolidated.amount,
      discount_amount: consolidated.discount_amount,
      payment_type: consolidated.payment_type,
      payment_date: consolidated.payment_date,
      reference: consolidated.reference,
      notes: consolidated.notes,
      currency: consolidated.currency,
      allocation_batch_uuid: consolidated.allocation_batch_uuid,
    }]);
    if (salesInsErr) throw salesInsErr;
    console.log('  [applied] Consolidated into one layby_payments + one sales_payments row.');
  } else {
    console.log('  [applied] Consolidated into one layby_payments row (layby-only batch).');
  }

  return { ok: true, applied: true };
}

async function main() {
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log('Customer:', customerId);
  console.log('PDF settlement lines are unchanged — this only cleans Supabase storage.');

  const poolSaleId = await resolvePoolSaleId(customerId);
  if (!poolSaleId) {
    console.error('Could not resolve pool sale_id for customer');
    process.exit(1);
  }
  console.log('Pool sale_id:', poolSaleId);

  const batchIds = await listRealMultiRowBatches(customerId);
  if (!batchIds.length) {
    console.log('No real multi-row payment batches to consolidate.');
    return;
  }
  console.log('Batches to consolidate:', batchIds.length);

  for (const batchId of batchIds) {
    await consolidateBatch({ cid: customerId, batchId, poolSaleId });
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
