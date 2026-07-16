#!/usr/bin/env node
// Automatic layby smoke test: picks a recent layby and performs a tiny reversible payment.
// Safe behavior: inserts a small payment, waits, verifies rollups, then deletes the test payment.

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined });

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function num(n){ return Number(n||0); }

async function fetchSnapshot(sb, laybyId, customerId) {
  const { data: layby, error } = await sb.from('laybys').select('id,total_amount,paid_amount,customer_id,sale_id').eq('id', laybyId).maybeSingle();
  if (error) throw error; if (!layby) throw new Error('Layby not found'); if (layby.customer_id !== customerId) throw new Error('Customer mismatch');
  return layby;
}

async function fetchRpc(sb, customerId, laybyId) {
  const { data, error } = await sb.rpc('get_layby_statement', { p_customer_id: customerId, p_layby_id: laybyId });
  if (error) throw error; if (!data || data.error) throw new Error('RPC error: '+(data?.error||'unknown'));
  return data;
}

async function sumPaymentsForLayby(sb, laybyId) {
  const saleIds = new Set();
  const { data: core } = await sb.from('laybys').select('sale_id').eq('id', laybyId).maybeSingle();
  if (core?.sale_id) saleIds.add(core.sale_id);
  const { data: linked } = await sb.from('sales').select('id').eq('layby_id', laybyId);
  (linked||[]).forEach(r=> saleIds.add(r.id));
  if (!saleIds.size) return 0;
  const { data: pays } = await sb.from('sales_payments').select('amount').in('sale_id', Array.from(saleIds));
  return (pays||[]).reduce((a,p)=> a + num(p.amount),0);
}

async function main(){
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE; // prefer anon to mimic client constraints
  if (!url || !key) { console.error('Missing Supabase env'); process.exit(1); }
  const sb = createClient(url, key);

  // Pick a layby (most recently updated) with a core sale available
  const { data: layby, error } = await sb.from('laybys').select('id, customer_id, sale_id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !layby) { console.error('No layby available:', error?.message || 'not found'); process.exit(2); }

  const laybyId = layby.id; const customerId = layby.customer_id; const saleId = layby.sale_id;
  const testAmount = 1.11;

  const beforeSnap = await fetchSnapshot(sb, laybyId, customerId);
  const beforeRpc = await fetchRpc(sb, customerId, laybyId);
  const beforePayments = await sumPaymentsForLayby(sb, laybyId);
  const beforeRollup = { snapPaid: num(beforeSnap.paid_amount), rpcPaid: (beforeRpc.sales||[]).reduce((a,s)=> a+num(s.paid_amount),0), paymentsSum: beforePayments };

  const now = new Date().toISOString().slice(0,10);
  const insertPayload = { sale_id: saleId, payment_type: 'cash', amount: testAmount, currency: 'K', payment_date: now, notes: 'auto-smoke' };
  const { data: inserted, error: insErr } = await sb.from('sales_payments').insert(insertPayload).select('id');
  if (insErr) { console.error('Insert payment failed:', insErr.message); process.exit(3); }
  const paymentId = inserted?.[0]?.id;

  await sleep(1500);

  const afterSnap = await fetchSnapshot(sb, laybyId, customerId);
  const afterRpc = await fetchRpc(sb, customerId, laybyId);
  const afterPayments = await sumPaymentsForLayby(sb, laybyId);
  const afterRollup = { snapPaid: num(afterSnap.paid_amount), rpcPaid: (afterRpc.sales||[]).reduce((a,s)=> a+num(s.paid_amount),0), paymentsSum: afterPayments };

  const deltaSnap = afterRollup.snapPaid - beforeRollup.snapPaid;
  const deltaRpc = afterRollup.rpcPaid - beforeRollup.rpcPaid;
  const deltaPayments = afterRollup.paymentsSum - beforeRollup.paymentsSum;
  const eps = 0.0001;
  const passed = Math.abs(deltaSnap - testAmount) < eps && Math.abs(deltaRpc - testAmount) < eps && Math.abs(deltaPayments - testAmount) < eps;

  console.log(JSON.stringify({ laybyId, saleId, testAmount, beforeRollup, afterRollup, deltas: { deltaSnap, deltaRpc, deltaPayments }, passed }, null, 2));

  if (paymentId) {
    try { await sb.from('sales_payments').delete().eq('id', paymentId); } catch {}
  }
  process.exitCode = passed ? 0 : 4;
}

main().catch(e=>{ console.error('Layby auto-smoke error:', e); process.exit(1); });
