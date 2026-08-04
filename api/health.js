// Consolidated health + diagnostics endpoint.
// Supported actions: health (default), env, tables, checkout.

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function resolveAction(req) {
  return String(req.query?.action || req.body?.action || 'health').trim().toLowerCase();
}

async function loadFirestoreHealth() {
  const mod = await import('../server/lib/firestoreBackup.js');
  return mod.healthCheckFirestore();
}

async function handleHealth(res) {
  const start = Date.now();
  let envOk = false;
  let rpcMs = null;
  let ok = false;
  let detail = null;
  const backend = 'firestore';

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.REACT_APP_FIREBASE_PROJECT_ID;
    envOk = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || projectId);
    if (!envOk) throw new Error('Missing Firebase env');
    await loadFirestoreHealth();
    ok = true;
    rpcMs = Date.now() - start;
  } catch (e) {
    detail = e.message || String(e);
    rpcMs = Date.now() - start;
  }

  res.statusCode = ok ? 200 : 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok, backend, rpc: rpcMs, time: new Date().toISOString(), envOk, detail }));
}

async function handleDiagEnv(res) {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.REACT_APP_FIREBASE_PROJECT_ID || null;
  const hasService = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  const probe = { ok: false, error: null };
  try {
    await loadFirestoreHealth();
    probe.ok = true;
  } catch (e) {
    probe.error = { code: null, message: e.message || String(e) };
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ backend: 'firestore', projectId, hasService, probe }));
}

async function handleDiagTables(res) {
  const { getFirestore } = await import('../server/lib/firestoreDb.js');
  const db = getFirestore();
  if (!db) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Firestore not configured' }));
    return;
  }

  const candidates = [
    'sales', 'sale', 'sales_items', 'sale_items', 'sales_item', 'sales_payments', 'sale_payments', 'sales_payment',
  ];
  const presence = {};
  for (const candidate of candidates) {
    try {
      await db.collection(candidate).limit(1).get();
      presence[candidate] = true;
    } catch {
      presence[candidate] = false;
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, backend: 'firestore', presence }));
}

async function handleDiagCheckout(res) {
  const { getFirestore } = await import('../server/lib/firestoreDb.js');
  const db = getFirestore();
  if (!db) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Firestore not configured' }));
    return;
  }

  const [custSnap, locSnap] = await Promise.all([
    db.collection('customers').limit(1).get(),
    db.collection('locations').limit(1).get(),
  ]);
  if (custSnap.empty || locSnap.empty) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Seed at least one customer and location' }));
    return;
  }

  const cust = custSnap.docs[0].data();
  const loc = locSnap.docs[0].data();
  const salePayload = {
    customer_id: cust.id || custSnap.docs[0].id,
    location_id: loc.id || locSnap.docs[0].id,
    total_amount: 1,
    status: 'completed',
    sale_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    currency: 'K',
  };

  const ref = await db.collection('sales').add(salePayload);
  const sale = { id: ref.id, ...salePayload };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, backend: 'firestore', sale }));
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
