#!/usr/bin/env node
// Batch performance benchmark runner.
// Usage: node scripts/laybyBenchBatch.js input.csv [iterations=5]
// CSV format (no header required): layby_uuid,customer_uuid
// Outputs JSON lines, plus an aggregate summary at end.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const [,, filePath, iterArg] = process.argv;
if (!filePath) {
  console.error('Usage: node scripts/laybyBenchBatch.js input.csv [iterations=5]');
  process.exit(1);
}
const iterations = Number(iterArg || 5);

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing env vars'); process.exit(1); }

const supabase = createClient(url, key);

function hr(){ const t = process.hrtime.bigint(); return Number(t)/1e6; }
async function time(fn, n){ const samples=[]; for(let i=0;i<n;i++){ const start=hr(); await fn(); samples.push(hr()-start); } samples.sort((a,b)=>a-b); const avg=samples.reduce((a,b)=>a+b,0)/samples.length; const p95=samples[Math.min(samples.length-1, Math.floor(samples.length*0.95))]; return {avg, p95, samples}; }

async function fetchRpc(customerId, laybyId){ const { data, error } = await supabase.rpc('get_layby_statement', { p_customer_id: customerId, p_layby_id: laybyId }); if (error) throw error; if (!data || data.error) throw new Error('RPC error'); return data; }
async function fetchLegacy(laybyId){
  const { data: layby, error: layErr } = await supabase.from('laybys').select('*').eq('id', laybyId).maybeSingle();
  if (layErr) throw layErr; if (!layby) throw new Error('Layby not found');
  const { data: sales } = await supabase.from('sales').select('id as sale_id').eq('layby_id', laybyId);
  const saleIds = (sales||[]).map(s=>s.sale_id);
  if (saleIds.length){
    await supabase.from('sales_items').select('sale_id').in('sale_id', saleIds);
    await supabase.from('sales_payments').select('sale_id').in('sale_id', saleIds);
  }
}

function parseLines(raw){
  return raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{
    const [layby, customer] = l.split(',').map(s=>s.trim());
    return { layby, customer };
  }).filter(r=>r.layby && r.customer);
}

(async () => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parseLines(raw);
  if (!rows.length) { console.error('No valid rows in input'); process.exit(1); }
  const aggregate = { rpc_avg:0, legacy_avg:0, count:0 };
  for (const row of rows) {
    try {
      const rpcRes = await time(()=>fetchRpc(row.customer, row.layby), iterations);
      const legacyRes = await time(()=>fetchLegacy(row.layby), iterations);
      aggregate.rpc_avg += rpcRes.avg; aggregate.legacy_avg += legacyRes.avg; aggregate.count += 1;
      console.log(JSON.stringify({ laybyId: row.layby, customerId: row.customer, iterations, rpc_ms_avg: rpcRes.avg, rpc_ms_p95: rpcRes.p95, legacy_ms_avg: legacyRes.avg, legacy_ms_p95: legacyRes.p95 }));
    } catch (e) {
      console.error(JSON.stringify({ laybyId: row.layby, customerId: row.customer, error: e.message || String(e) }));
    }
  }
  if (aggregate.count) {
    console.log(JSON.stringify({ summary: true, laybys: aggregate.count, rpc_avg_mean: aggregate.rpc_avg/aggregate.count, legacy_avg_mean: aggregate.legacy_avg/aggregate.count }));
  }
})();
