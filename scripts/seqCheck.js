// Quick sequence vs max(id) auditor for sales and sales_items
// Usage: node scripts/seqCheck.js (ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE are set)

const { createClient } = require('@supabase/supabase-js');

async function main() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE env');
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false }, db: { schema: 'public' } });

  // Helper to run arbitrary SQL using PostgREST RPC is not available by default; instead, use a viewless trick:
  async function run(sql) {
    // Supabase JS doesn't have a generic sql method; use fetch to the REST endpoint directly
    const restUrl = `${url.replace(/\/?$/, '')}/rest/v1/rpc/exec_sql`;
    const payload = { q: sql };
    const resp = await fetch(restUrl, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public'
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const text = await resp.text().catch(()=> '');
      throw new Error(text || `RPC exec_sql failed (${resp.status})`);
    }
    return resp.json();
  }

  async function check(table, seqName) {
    // Use light two-step queries via REST on exposed tables/sequences
    const maxSql = `select coalesce(max(id),0) as max_id from public.${table}`;
    const maxRows = await run(maxSql);
    const maxId = Array.isArray(maxRows) && maxRows[0] ? maxRows[0].max_id : 0;
    const seqSql = `select last_value from ${seqName}`;
    const seqRows = await run(seqSql);
    const lastVal = Array.isArray(seqRows) && seqRows[0] ? seqRows[0].last_value : null;
    const needsAdvance = lastVal == null || Number(lastVal) <= Number(maxId);
    return { table, seq: seqName, maxId: Number(maxId), lastVal: lastVal == null ? null : Number(lastVal), needsAdvance };
  }

  try {
    const results = [];
  results.push(await check('sales', 'public.sales_id_seq'));
  results.push(await check('sales_items', 'public.sales_items_id_seq'));
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message || String(e) }));
    process.exit(1);
  }
}

main();
