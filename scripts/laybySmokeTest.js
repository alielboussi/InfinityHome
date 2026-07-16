#!/usr/bin/env node
// Layby smoke test: create a small payment, wait for trigger, verify parity via RPC and snapshot, then (optionally) revert.
// Usage: node scripts/laybySmokeTest.js <layby_uuid> <customer_uuid> <sale_id> [amount]
// Requirements: Environment vars REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY. Run on a test layby.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const [,, laybyId, customerId, saleIdArg, amountArg] = process.argv;
if (!laybyId || !customerId || !saleIdArg) {
  console.error('Usage: node scripts/laybySmokeTest.js <layby_uuid> <customer_uuid> <sale_id> [amount]');
  process.exit(1);
}
const testAmount = Number(amountArg || 1.11); // small distinctive amount for detection

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing env vars REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY'); process.exit(1); }

const supabase = createClient(url, key);

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function num(n){ return Number(n||0); }

async function fetchSnapshot(laybyId, customerId) {
  const { data: layby, error } = await supabase.from('laybys').select('id,total_amount,paid_amount,customer_id,sale_id').eq('id', laybyId).maybeSingle();
  if (error) throw error; if (!layby) throw new Error('Layby not found'); if (layby.customer_id !== customerId) throw new Error('Customer mismatch');
  return layby;
}

async function fetchRpc(customerId, laybyId) {
  const { data, error } = await supabase.rpc('get_layby_statement', { p_customer_id: customerId, p_layby_id: laybyId });
  if (error) throw error; if (!data || data.error) throw new Error('RPC error: '+(data?.error||'unknown'));
  return data;
}

async function sumPaymentsForLayby(laybyId) {
  // gather all sales for layby
  const saleIds = new Set();
  const { data: core } = await supabase.from('laybys').select('sale_id').eq('id', laybyId).maybeSingle();
  if (core?.sale_id) saleIds.add(core.sale_id);
  const { data: linked } = await supabase.from('sales').select('id').eq('layby_id', laybyId);
  (linked||[]).forEach(r=> saleIds.add(r.id));
  if (!saleIds.size) return 0;
  const { data: pays } = await supabase.from('sales_payments').select('amount').in('sale_id', Array.from(saleIds));
  return (pays||[]).reduce((a,p)=> a + num(p.amount),0);
}

async function main(){
  // Pre-state
  const beforeSnap = await fetchSnapshot(laybyId, customerId);
  const beforeRpc = await fetchRpc(customerId, laybyId);
  const beforePayments = await sumPaymentsForLayby(laybyId);
  const beforeRollup = { snapPaid: num(beforeSnap.paid_amount), rpcPaid: (beforeRpc.sales||[]).reduce((a,s)=> a+num(s.paid_amount),0), paymentsSum: beforePayments };

  const saleId = Number(saleIdArg);
  const allocation_batch_uuid = crypto.randomUUID();
  // Insert payment
  const insertPayload = { sale_id: saleId, payment_type: 'cash', amount: testAmount, currency: 'K', payment_date: new Date().toISOString().slice(0,10), notes: 'smoke-test', allocation_batch_uuid };
  const { data: inserted, error: insErr } = await supabase.from('sales_payments').insert(insertPayload).select('id');
  if (insErr) throw insErr;
  const paymentId = inserted?.[0]?.id;

  // Wait for trigger propagation
  await sleep(1200);

  // Post-state
  const afterSnap = await fetchSnapshot(laybyId, customerId);
  const afterRpc = await fetchRpc(customerId, laybyId);
  const afterPayments = await sumPaymentsForLayby(laybyId);
  const afterRollup = { snapPaid: num(afterSnap.paid_amount), rpcPaid: (afterRpc.sales||[]).reduce((a,s)=> a+num(s.paid_amount),0), paymentsSum: afterPayments };

  // Expectations
  const deltaSnap = afterRollup.snapPaid - beforeRollup.snapPaid;
  const deltaRpc = afterRollup.rpcPaid - beforeRollup.rpcPaid;
  const deltaPayments = afterRollup.paymentsSum - beforeRollup.paymentsSum;
  const eps = 0.0001;
  const passed = Math.abs(deltaSnap - testAmount) < eps && Math.abs(deltaRpc - testAmount) < eps && Math.abs(deltaPayments - testAmount) < eps;

  const result = { laybyId, customerId, saleId, testAmount, beforeRollup, afterRollup, deltas: { deltaSnap, deltaRpc, deltaPayments }, passed };
  console.log(JSON.stringify(result,null,2));

  // Clean-up (delete test payment) so we don't mutate production data permanently
  if (paymentId) {
    try { await supabase.from('sales_payments').delete().eq('id', paymentId); } catch {}
  }
  process.exitCode = passed ? 0 : 2;
}

main().catch(e=>{ console.error('Smoke test failed:', e); process.exit(1); });
