#!/usr/bin/env node
// Layby parity validation script.
// Usage: node scripts/runLaybyParity.js <layby_uuid> <customer_uuid>

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY');
  process.exit(1);
}
const supabase = createClient(url, key);

const [,, laybyId, customerId] = process.argv;
if (!laybyId || !customerId) {
  console.error('Provide layby_uuid and customer_uuid');
  process.exit(1);
}

function num(n) { return Number(n || 0); }

async function main() {
  // 1. Load layby snapshot
  const { data: layby, error: laybyErr } = await supabase.from('laybys').select('id, sale_id, total_amount, paid_amount, customer_id').eq('id', laybyId).maybeSingle();
  if (laybyErr) throw laybyErr;
  if (!layby) throw new Error('Layby not found');
  if (layby.customer_id !== customerId) throw new Error('Customer mismatch');

  // 2. Collect all sales: direct + any linked by layby_id
  const saleIds = new Set();
  if (layby.sale_id) saleIds.add(layby.sale_id);
  const { data: linked } = await supabase.from('sales').select('id').eq('layby_id', laybyId);
  (linked || []).forEach(r => saleIds.add(r.id));

  // 3. Sum payments from those sales
  let paymentsSum = 0;
  if (saleIds.size) {
    const { data: pays } = await supabase.from('sales_payments').select('sale_id, amount').in('sale_id', Array.from(saleIds));
    (pays || []).forEach(p => { paymentsSum += num(p.amount); });
  }

  // 4. RPC fetch
  const { data: rpcJson, error: rpcErr } = await supabase.rpc('get_layby_statement', { p_customer_id: customerId, p_layby_id: laybyId });
  if (rpcErr) throw rpcErr;
  if (!rpcJson || rpcJson.error) throw new Error('RPC returned error: ' + (rpcJson?.error || 'unknown'));
  const rpcPaid = Array.isArray(rpcJson.sales) ? rpcJson.sales.reduce((a,s) => a + num(s.paid_amount), 0) : 0;

  // 5. Compare
  const snapPaid = num(layby.paid_amount);
  const withinEps = (a,b,eps=0.0001)=> Math.abs(a-b) <= eps;
  const match = withinEps(snapPaid, paymentsSum) && withinEps(paymentsSum, rpcPaid);
  const verdict = match ? 'PASS' : 'FAIL';

  console.log(JSON.stringify({ verdict, laybyId, customerId, snapPaid, paymentsSum, rpcPaid }, null, 2));
  if (!match) process.exitCode = 2;
}

main().catch(e => { console.error('Parity run error:', e); process.exit(1); });
