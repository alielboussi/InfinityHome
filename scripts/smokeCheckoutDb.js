#!/usr/bin/env node
// Smoke test for checkout against DB directly (bypasses API handler):
// - Insert minimal sale header
// - Optionally insert zero items and zero payments
// - Cleanup the sale

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined });

function nowIso(){ return new Date().toISOString(); }

async function main(){
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) { console.error('Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE'); process.exit(1); }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });

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

  const ins = await sb.from('sales').insert(sale).select('id, receipt_number').single();
  if (ins.error) { console.error('Insert error:', ins.error); process.exit(3); }

  const saleId = ins.data?.id;
  console.log(JSON.stringify({ ok: true, saleId, receipt_number: ins.data?.receipt_number }, null, 2));

  if (saleId) {
    try { await sb.from('sales').delete().eq('id', saleId); } catch {}
  }
}

main().catch(e=>{ console.error('Smoke error:', e); process.exit(1); });
