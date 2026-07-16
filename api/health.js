// Consolidated health + diagnostics endpoint.
// Supported actions: health (default), env, tables, checkout.

const { createClient } = require('@supabase/supabase-js');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function resolveAction(req) {
  return String(req.query?.action || req.body?.action || 'health').trim().toLowerCase();
}

function createServiceClient(requireFallback = false) {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const key = requireFallback
    ? (process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)
    : (process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !key) {
    const err = new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
    err.status = 500;
    throw err;
  }

  return createClient(url, key, { auth: { persistSession: false }, db: { schema: 'public' } });
}

async function handleHealth(res) {
  const start = Date.now();
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || process.env.REALTIME_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const envOk = Boolean(url && key);
  let rpcMs = null;
  let ok = false;
  let detail = null;

  try {
    if (!envOk) throw new Error('Missing env');
    const supabase = createClient(url, key, { auth: { persistSession: false }, db: { schema: 'public' } });
    const { error } = await supabase.from('laybys').select('id').limit(1);
    if (error) throw error;
    ok = true;
    rpcMs = Date.now() - start;
  } catch (e) {
    detail = e.message || String(e);
    rpcMs = Date.now() - start;
  }

  res.statusCode = ok ? 200 : 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok, rpc: rpcMs, time: new Date().toISOString(), envOk, detail }));
}

async function handleDiagEnv(res) {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const host = String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY);

  const probe = { ok: false, error: null };
  try {
    if (!url || !key) throw new Error('missing env');
    const sb = createClient(url, key, { auth: { persistSession: false }, db: { schema: 'public' } });
    const { error } = await sb.from('sales').select('id', { head: true, count: 'exact' });
    if (error) throw error;
    probe.ok = true;
  } catch (e) {
    probe.error = { code: e.code || null, message: e.message || String(e) };
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ host, hasService, probe }));
}

async function handleDiagTables(res) {
  const sb = createServiceClient(false);

  async function exists(name) {
    try {
      const { error } = await sb.from(name).select('*', { head: true, count: 'estimated' });
      return !error;
    } catch {
      return false;
    }
  }

  const candidates = [
    'sales', 'sale', 'sales_items', 'sale_items', 'sales_item', 'sales_payments', 'sale_payments', 'sales_payment',
  ];
  const presence = {};
  for (const candidate of candidates) {
    presence[candidate] = await exists(candidate);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, presence }));
}

async function handleDiagCheckout(res) {
  const sb = createServiceClient(false);

  const pre = await sb.from('sales').select('id', { head: true, count: 'exact' });
  if (pre.error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'probe', code: pre.error.code, error: pre.error.message }));
    return;
  }

  const [cust, loc] = await Promise.all([
    sb.from('customers').select('id').limit(1),
    sb.from('locations').select('id').limit(1),
  ]);
  if (cust.error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'customers', error: cust.error.message, code: cust.error.code }));
    return;
  }
  if (loc.error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'locations', error: loc.error.message, code: loc.error.code }));
    return;
  }
  if (!cust.data?.length || !loc.data?.length) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Seed at least one customer and location' }));
    return;
  }

  const salePayload = {
    customer_id: cust.data[0].id,
    location_id: loc.data[0].id,
    total_amount: 1,
    status: 'completed',
    sale_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    currency: 'K',
  };

  const ins = await sb.from('sales').insert(salePayload).select('id, receipt_number').single();
  if (ins.error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: false,
      stage: 'sales-insert',
      code: ins.error.code,
      error: ins.error.message,
      details: ins.error.details || null,
    }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, sale: ins.data }));
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    return;
  }

  try {
    const action = resolveAction(req);
    if (action === 'env') {
      await handleDiagEnv(res);
      return;
    }
    if (action === 'tables') {
      await handleDiagTables(res);
      return;
    }
    if (action === 'checkout') {
      await handleDiagCheckout(res);
      return;
    }
    await handleHealth(res);
  } catch (e) {
    res.statusCode = e?.status || 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, stage: 'unhandled', error: e.message || String(e) }));
  }
};
