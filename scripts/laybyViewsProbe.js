#!/usr/bin/env node
// Probe layby-related views compile and are accessible via PostgREST
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined });

async function headCount(sb, name){
  try {
    const { error, count } = await sb.from(name).select('*', { head: true, count: 'estimated' });
    if (error) return { name, ok: false, error: error.message, code: error.code };
    return { name, ok: true };
  } catch (e) { return { name, ok: false, error: e.message || String(e) }; }
}

async function main(){
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) { console.error('Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE'); process.exit(1); }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });

  const targets = ['v_sales_financials','v_customer_layby_outstanding','v_payments_non_credit','v_sales_pdf_totals','v_sales_totals_canonical'];
  const results = [];
  for (const t of targets) results.push(await headCount(sb, t));
  console.log(JSON.stringify({ probes: results }, null, 2));
  const allOk = results.every(r=>r.ok);
  process.exitCode = allOk ? 0 : 2;
}

main().catch(e=>{ console.error('Probe error:', e); process.exit(1); });
