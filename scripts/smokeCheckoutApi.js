#!/usr/bin/env node
// Smoke test for API checkout handler: inserts a minimal sale header via the API handler and cleans it up.
// Usage: node scripts/smokeCheckoutApi.js
// Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE (or via vercel.env), Node 18+

import 'dotenv/config';
import handler from '../api/checkout.js';
import { createClient } from '@supabase/supabase-js';

function makeRes() {
  let statusCode = 200; let body = null; const headers = {};
  return {
    setHeader: (k, v) => { headers[k] = v; },
    status: (code) => { statusCode = code; return { json: (obj) => { body = obj; } }; },
    get result() { return { statusCode, body, headers }; }
  };
}

function nowIso(){ return new Date().toISOString(); }

async function main(){
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) { console.error('Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE'); process.exit(1); }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });

  // Pick any valid FK ids
  const [{ data: custs, error: custErr }, { data: locs, error: locErr }] = await Promise.all([
    sb.from('customers').select('id').limit(1),
    sb.from('locations').select('id').limit(1),
  ]);
  if (custErr || locErr || !custs?.length || !locs?.length) {
    console.error('Precondition failed: need at least one customer and location');
    process.exit(2);
  }
  const customer_id = custs[0].id; const location_id = locs[0].id;

  const sale = {
    customer_id,
    location_id,
    total_amount: 1,
    status: 'completed',
    sale_date: nowIso(),
    updated_at: nowIso(),
    currency: 'K'
  };

  const req = { method: 'POST', body: { sale, items: [], payments: [] } };
  const res = makeRes();
  await handler(req, res);
  const { statusCode, body } = res.result;

  if (statusCode !== 200 || !body?.ok) {
    console.error('API checkout failed:', JSON.stringify(body, null, 2));
    process.exit(3);
  }

  const saleId = body?.sale?.id;
  console.log(JSON.stringify({ ok: true, saleId, storedReceiptNumber: body?.storedReceiptNumber, itemsInserted: body?.itemsInserted, paymentsInserted: body?.paymentsInserted, tableDebug: body?.tableDebug }, null, 2));

  // Cleanup
  if (saleId) {
    try { await sb.from('sales').delete().eq('id', saleId); } catch {}
  }
}

main().catch(e=>{ console.error('Smoke error:', e); process.exit(1); });
