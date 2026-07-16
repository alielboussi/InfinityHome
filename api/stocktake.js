// Stocktake Flow API: auth login + multi-user counting events + period submit.
import { createClient } from '@supabase/supabase-js';
import { resolveSessionUserFromAuth } from '../src/accessControl.js';

const ACTION_METHOD = {
  login: 'POST',
  'auth-profile': 'GET',
  locations: 'GET',
  catalog: 'GET',
  'events-list': 'GET',
  'open-sessions': 'GET',
  'event-get': 'GET',
  'event-create': 'POST',
  'event-set-gate': 'POST',
  'count-add': 'POST',
  'count-mine': 'GET',
  'counts-import': 'POST',
  'counts-clear': 'POST',
  'import-template': 'GET',
  'set-scan': 'POST',
  'product-create': 'POST',
  'set-create': 'POST',
  'event-submit': 'POST',
  'event-cancel': 'POST',
  'periods-list': 'GET',
  'period-detail': 'GET',
  'period-variance': 'GET',
  'location-state': 'GET',
};

const ACTION_ALIAS = {
  'stocktake-login': 'login',
  'auth-profile': 'auth-profile',
  'stocktake-locations': 'locations',
  'stocktake-catalog': 'catalog',
  'stocktake-events-list': 'events-list',
  'stocktake-open-sessions': 'open-sessions',
  'stocktake-event-get': 'event-get',
  'stocktake-event-create': 'event-create',
  'stocktake-event-set-gate': 'event-set-gate',
  'stocktake-count-add': 'count-add',
  'stocktake-count-mine': 'count-mine',
  'stocktake-counts-import': 'counts-import',
  'stocktake-counts-clear': 'counts-clear',
  'stocktake-import-template': 'import-template',
  'stocktake-set-scan': 'set-scan',
  'stocktake-product-create': 'product-create',
  'stocktake-set-create': 'set-create',
  'stocktake-event-submit': 'event-submit',
  'stocktake-event-cancel': 'event-cancel',
  'stocktake-periods-list': 'periods-list',
  'stocktake-period-detail': 'period-detail',
  'stocktake-period-variance': 'period-variance',
  'stocktake-location-state': 'location-state',
};

function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');
}

function resolveAction(req) {
  const raw = (req.query?.action || req.query?.a || req.body?.action || req.body?.a || '').toString().trim().toLowerCase();
  return ACTION_ALIAS[raw] || raw || '';
}

function resolveSupabaseUrl() {
  const raw = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
  let u = String(raw || '').trim().replace(/\/+$/, '');
  if (!u) u = 'https://ayuufehhzsrinvtlmyqm.supabase.co';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  const host = u.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  if (!host.endsWith('.supabase.co')) return 'https://ayuufehhzsrinvtlmyqm.supabase.co';
  return u;
}

function getService() {
  const url = resolveSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service env not configured');
  return createClient(url, key, { auth: { persistSession: false }, db: { schema: 'public' } });
}

function getAnon() {
  const url = resolveSupabaseUrl();
  const key = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase anon env not configured');
  return createClient(url, key, { auth: { persistSession: false }, db: { schema: 'public' } });
}

function emailOf(body = {}, query = {}) {
  return String(body.userEmail || body.email || query.userEmail || query.email || '').trim().toLowerCase();
}

function cleanTerm(value) {
  return String(value || '').trim().replace(/[,*%]/g, '');
}

function buildAuthUserPayload(authUser) {
  const metadata = authUser?.user_metadata || {};
  return resolveSessionUserFromAuth({
    id: authUser?.id || null,
    email: authUser?.email || null,
    full_name: metadata.full_name || metadata.name || metadata.display_name || null,
    user_metadata: metadata,
  });
}

async function handleAuthProfile(req, res) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }
  const token = match[1].trim();
  if (!token) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }

  let authUser = null;
  try {
    const anon = getAnon();
    const { data, error } = await anon.auth.getUser(token);
    if (error) {
      res.status(401).json({ ok: false, error: error.message || 'Invalid session' });
      return;
    }
    authUser = data?.user || null;
  } catch (err) {
    res.status(401).json({ ok: false, error: err?.message || 'Invalid session' });
    return;
  }

  if (!authUser?.id || !authUser?.email) {
    res.status(401).json({ ok: false, error: 'Authenticated account has no usable identity.' });
    return;
  }

  res.status(200).json({
    ok: true,
    user: buildAuthUserPayload(authUser),
  });
}

async function handleLogin(req, res) {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) {
    res.status(400).json({ ok: false, error: 'Email and password are required.' });
    return;
  }
  const supabase = getAnon();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const session = data?.session || null;
  const authUser = data?.user || session?.user || null;
  if (error || !session?.access_token || !authUser?.id) {
    res.status(401).json({ ok: false, error: error?.message || 'Invalid email or password.' });
    return;
  }

  res.status(200).json({
    ok: true,
    user: buildAuthUserPayload(authUser),
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      token_type: session.token_type,
    },
  });
}

async function handleLocations(_req, res) {
  const sb = getService();
  const { data, error } = await sb.from('locations').select('id, name').order('name');
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.status(200).json({ ok: true, rows: data || [] });
}

async function handleLocationState(req, res) {
  const locationId = req.query?.locationId;
  if (!locationId) return res.status(400).json({ ok: false, error: 'locationId required' });
  const sb = getService();
  const { data, error } = await sb.from('stocktake_location_state').select('*').eq('location_id', locationId).maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.status(200).json({
    ok: true,
    state: data || { location_id: locationId, initial_completed: false },
  });
}

async function handleCatalog(req, res) {
  const locationId = req.query?.locationId || '';
  const q = cleanTerm(req.query?.q || '');
  if (!locationId) {
    return res.status(400).json({ ok: false, error: 'locationId required' });
  }

  const sb = getService();

  // Match All Products: enabled via product_locations OR inventory at this location.
  const [{ data: productLocs, error: plErr }, { data: invRows, error: invErr }] = await Promise.all([
    sb.from('product_locations').select('product_id').eq('location_id', locationId),
    sb.from('inventory').select('product_id').eq('location', locationId),
  ]);
  if (plErr) return res.status(500).json({ ok: false, error: plErr.message });
  if (invErr) return res.status(500).json({ ok: false, error: invErr.message });

  const productIdSet = new Set();
  (productLocs || []).forEach((r) => { if (r.product_id) productIdSet.add(String(r.product_id)); });
  (invRows || []).forEach((r) => { if (r.product_id) productIdSet.add(String(r.product_id)); });
  const productIds = [...productIdSet];

  let products = [];
  if (productIds.length) {
    if (q) {
      const like = `%${q}%`;
      const { data, error: pErr } = await sb
        .from('products')
        .select('id, name, sku, price, promotional_price, promo_start_date, promo_end_date')
        .or(`name.ilike.${like},sku.ilike.${like}`)
        .order('name')
        .limit(400);
      if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
      products = (data || []).filter((p) => productIdSet.has(String(p.id))).slice(0, 80);
    } else {
      const chunk = productIds.slice(0, 120);
      const { data, error: pErr } = await sb
        .from('products')
        .select('id, name, sku, price, promotional_price, promo_start_date, promo_end_date')
        .in('id', chunk)
        .order('name')
        .limit(80);
      if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
      products = data || [];
    }
  }

  // Only sets enabled for this location (combo_locations join).
  let sets = [];
  const { data: comboLocs, error: clErr } = await sb
    .from('combo_locations')
    .select('combo_id')
    .eq('location_id', locationId);
  if (clErr) return res.status(500).json({ ok: false, error: clErr.message });

  const comboIds = [...new Set((comboLocs || []).map((r) => r.combo_id).filter(Boolean))];
  if (comboIds.length) {
    let comboQuery = sb
      .from('combos')
      .select('id, combo_name, sku, standard_price, combo_price, promotional_price')
      .in('id', comboIds)
      .order('combo_name')
      .limit(80);
    if (q) {
      const like = `%${q}%`;
      comboQuery = comboQuery.or(`combo_name.ilike.${like},sku.ilike.${like}`);
    }
    const { data: combos } = await comboQuery;
    const { data: items } = await sb
      .from('combo_items')
      .select('combo_id, product_id, quantity')
      .in('combo_id', comboIds);
    const byCombo = new Map();
    (items || []).forEach((row) => {
      if (!byCombo.has(row.combo_id)) byCombo.set(row.combo_id, []);
      byCombo.get(row.combo_id).push({ product_id: row.product_id, quantity: Number(row.quantity || 0) });
    });
    sets = (combos || []).map((c) => ({
      id: c.id,
      name: c.combo_name,
      sku: c.sku,
      price: c.standard_price ?? c.combo_price ?? c.promotional_price ?? 0,
      type: 'set',
      components: byCombo.get(c.id) || [],
    }));
  }

  res.status(200).json({
    ok: true,
    products: products.map((p) => ({ ...p, type: 'product' })),
    sets,
  });
}

function consolidateCounts(rows) {
  const byProduct = new Map();
  (rows || []).forEach((row) => {
    const pid = row.product_id;
    if (!byProduct.has(pid)) {
      byProduct.set(pid, { product_id: pid, qty: 0, byUser: [] });
    }
    const entry = byProduct.get(pid);
    const qty = Number(row.qty || 0);
    entry.qty += qty;
    entry.byUser.push({
      user_email: row.user_email,
      qty,
      updated_at: row.updated_at,
    });
  });
  return Array.from(byProduct.values());
}

async function handleEventsList(req, res) {
  const locationId = req.query?.locationId;
  if (!locationId) return res.status(400).json({ ok: false, error: 'locationId required' });
  const sb = getService();
  const { data, error } = await sb
    .from('stocktake_events')
    .select('*')
    .eq('location_id', locationId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.status(200).json({ ok: true, rows: data || [] });
}

/** Fixed count page: all sessions currently open for counting. */
async function handleOpenSessions(_req, res) {
  const sb = getService();
  const { data, error } = await sb
    .from('stocktake_events')
    .select('id, location_id, status, counting_enabled, is_initial, created_at, created_by_email')
    .eq('status', 'counting')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });

  const rows = data || [];
  const locationIds = [...new Set(rows.map((r) => r.location_id))];
  let locationMap = new Map();
  if (locationIds.length) {
    const { data: locs } = await sb.from('locations').select('id, name').in('id', locationIds);
    locationMap = new Map((locs || []).map((l) => [l.id, l.name]));
  }

  res.status(200).json({
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      location_name: locationMap.get(r.location_id) || 'Location',
    })),
  });
}

async function handleEventGet(req, res) {
  const eventId = req.query?.eventId;
  if (!eventId) return res.status(400).json({ ok: false, error: 'eventId required' });
  const sb = getService();
  const { data: event, error } = await sb.from('stocktake_events').select('*').eq('id', eventId).maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!event) return res.status(404).json({ ok: false, error: 'Event not found' });

  const { data: counts, error: cErr } = await sb
    .from('stocktake_counts')
    .select('product_id, user_email, qty, updated_at, products(name, sku)')
    .eq('event_id', eventId);
  if (cErr) return res.status(500).json({ ok: false, error: cErr.message });

  const consolidated = consolidateCounts(counts).map((row) => {
    const sample = (counts || []).find((c) => c.product_id === row.product_id);
    return {
      ...row,
      name: sample?.products?.name || null,
      sku: sample?.products?.sku || null,
    };
  });

  res.status(200).json({ ok: true, event, consolidated, counts: counts || [] });
}

async function handleEventCreate(req, res) {
  const body = req.body || {};
  const locationId = body.locationId;
  const userEmail = emailOf(body);
  if (!locationId) return res.status(400).json({ ok: false, error: 'locationId required' });

  const sb = getService();
  const { data: existingOpen } = await sb
    .from('stocktake_events')
    .select('id')
    .eq('location_id', locationId)
    .eq('status', 'counting')
    .limit(1)
    .maybeSingle();
  if (existingOpen?.id) {
    return res.status(409).json({
      ok: false,
      error: 'A counting session is already open for this location. Close it (if empty) or submit it first.',
      eventId: existingOpen.id,
    });
  }

  const { data: state } = await sb.from('stocktake_location_state').select('*').eq('location_id', locationId).maybeSingle();
  const initialCompleted = Boolean(state?.initial_completed);
  const isInitial = !initialCompleted;

  const { data: event, error } = await sb
    .from('stocktake_events')
    .insert([{
      location_id: locationId,
      status: 'counting',
      counting_enabled: true,
      is_initial: isInitial,
      created_by_email: userEmail || null,
      notes: body.notes || null,
    }])
    .select('*')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });

  await sb.from('stocktake_gate_audit').insert([{
    event_id: event.id,
    location_id: locationId,
    enabled: true,
    changed_by_email: userEmail || null,
  }]);

  res.status(200).json({ ok: true, event, initialCompleted });
}

async function handleEventSetGate(req, res) {
  const body = req.body || {};
  const eventId = body.eventId;
  const enabled = Boolean(body.enabled);
  const userEmail = emailOf(body);
  if (!eventId) return res.status(400).json({ ok: false, error: 'eventId required' });

  const sb = getService();
  const { data: event, error } = await sb.from('stocktake_events').select('*').eq('id', eventId).maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!event) return res.status(404).json({ ok: false, error: 'Event not found' });
  if (event.status !== 'counting') {
    return res.status(409).json({ ok: false, error: 'Gate can only change while event is counting.' });
  }

  const { data: updated, error: upErr } = await sb
    .from('stocktake_events')
    .update({ counting_enabled: enabled })
    .eq('id', eventId)
    .select('*')
    .single();
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

  await sb.from('stocktake_gate_audit').insert([{
    event_id: eventId,
    location_id: event.location_id,
    enabled,
    changed_by_email: userEmail || null,
  }]);

  res.status(200).json({ ok: true, event: updated });
}

async function addCountLine(sb, { eventId, productId, qtyAdd, userEmail }) {
  const add = Number(qtyAdd);
  if (!Number.isFinite(add) || add <= 0) throw new Error('qty must be > 0');

  const { data: existing } = await sb
    .from('stocktake_counts')
    .select('id, qty')
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .eq('user_email', userEmail)
    .maybeSingle();

  const nextQty = Number(existing?.qty || 0) + add;
  const payload = {
    event_id: eventId,
    product_id: productId,
    user_email: userEmail,
    qty: nextQty,
    updated_at: new Date().toISOString(),
  };

  const { data: row, error } = await sb
    .from('stocktake_counts')
    .upsert([payload], { onConflict: 'event_id,product_id,user_email' })
    .select('*')
    .single();
  if (error) throw error;

  await sb.from('stocktake_count_log').insert([{
    event_id: eventId,
    product_id: productId,
    user_email: userEmail,
    qty_added: add,
    qty_after: nextQty,
  }]);

  return row;
}

async function setCountAbsolute(sb, { eventId, productId, qty, userEmail }) {
  const value = Number(qty);
  if (!Number.isFinite(value) || value < 0) throw new Error('qty must be >= 0');

  const { data: existing } = await sb
    .from('stocktake_counts')
    .select('id, qty')
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .eq('user_email', userEmail)
    .maybeSingle();

  const prev = Number(existing?.qty || 0);
  const payload = {
    event_id: eventId,
    product_id: productId,
    user_email: userEmail,
    qty: value,
    updated_at: new Date().toISOString(),
  };

  const { data: row, error } = await sb
    .from('stocktake_counts')
    .upsert([payload], { onConflict: 'event_id,product_id,user_email' })
    .select('*')
    .single();
  if (error) throw error;

  await sb.from('stocktake_count_log').insert([{
    event_id: eventId,
    product_id: productId,
    user_email: userEmail,
    qty_added: value - prev,
    qty_after: value,
  }]);

  return row;
}

async function handleCountsImport(req, res) {
  const body = req.body || {};
  const eventId = body.eventId;
  const userEmail = emailOf(body);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!eventId || !userEmail) {
    return res.status(400).json({ ok: false, error: 'eventId and userEmail required' });
  }
  if (!rows.length) {
    return res.status(400).json({ ok: false, error: 'rows required' });
  }

  try {
    const sb = getService();
    const event = await assertCountingAllowed(sb, eventId);
    const locationId = event.location_id;

    const { data: enabledLinks, error: plErr } = await sb
      .from('product_locations')
      .select('product_id')
      .eq('location_id', locationId);
    if (plErr) throw plErr;
    const enabledIds = [...new Set((enabledLinks || []).map((r) => r.product_id))];
    if (!enabledIds.length) {
      return res.status(200).json({
        ok: true,
        locationId,
        importedCount: 0,
        skippedCount: rows.length,
        imported: [],
        skipped: rows.map((r) => ({
          sku: String(r?.sku || '').trim() || '(blank)',
          reason: 'No products enabled at this location',
        })),
      });
    }

    const { data: products, error: pErr } = await sb
      .from('products')
      .select('id, sku, name')
      .in('id', enabledIds);
    if (pErr) throw pErr;

    const bySku = new Map();
    const byName = new Map();
    (products || []).forEach((p) => {
      const sku = String(p.sku || '').trim().toLowerCase();
      if (sku) bySku.set(sku, p);
      const nameKey = String(p.name || '').trim().toLowerCase();
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, p);
    });

    const { data: combos, error: cErr } = await sb
      .from('combos')
      .select('id, sku, name');
    if (cErr) throw cErr;
    const setSkus = new Set(
      (combos || [])
        .map((c) => String(c.sku || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const setNames = new Set(
      (combos || [])
        .map((c) => String(c.name || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const imported = [];
    const skipped = [];

    for (const raw of rows) {
      const sku = String(raw?.sku || '').trim();
      const productName = String(raw?.productName || raw?.name || '').trim();
      const skuKey = sku.toLowerCase();
      const nameKey = productName.toLowerCase();
      const qty = Number(raw?.quantity);
      const label = sku || productName || '(blank)';

      if (!skuKey && !nameKey) {
        skipped.push({ sku: label, productName, reason: 'Missing SKU and Product Name' });
        continue;
      }
      if (!Number.isFinite(qty) || qty < 0) {
        skipped.push({ sku: label, productName, reason: 'Invalid quantity' });
        continue;
      }
      if ((skuKey && setSkus.has(skuKey)) || (nameKey && setNames.has(nameKey))) {
        skipped.push({ sku: label, productName, reason: 'Sets are not allowed — import products/components only' });
        continue;
      }

      let product = skuKey ? bySku.get(skuKey) : null;
      if (!product && nameKey) product = byName.get(nameKey);
      if (!product) {
        skipped.push({
          sku: label,
          productName,
          reason: 'Product not found or not enabled at this location',
        });
        continue;
      }

      await setCountAbsolute(sb, {
        eventId,
        productId: product.id,
        qty,
        userEmail,
      });
      imported.push({
        sku: product.sku || sku,
        product_id: product.id,
        name: product.name || productName,
        qty,
      });
    }

    res.status(200).json({
      ok: true,
      locationId,
      importedCount: imported.length,
      skippedCount: skipped.length,
      imported,
      skipped,
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message || String(err) });
  }
}

async function handleImportTemplate(req, res) {
  const locationId = req.query?.locationId;
  if (!locationId) return res.status(400).json({ ok: false, error: 'locationId required' });

  try {
    const sb = getService();
    const { data: links, error: plErr } = await sb
      .from('product_locations')
      .select('product_id')
      .eq('location_id', locationId);
    if (plErr) throw plErr;
    const ids = (links || []).map((r) => r.product_id);
    if (!ids.length) {
      return res.status(200).json({ ok: true, locationId, rows: [] });
    }

    const { data: products, error: pErr } = await sb
      .from('products')
      .select('id, sku, name')
      .in('id', ids)
      .order('name', { ascending: true });
    if (pErr) throw pErr;

    // Exclude anything whose SKU is also a set SKU
    const { data: combos } = await sb.from('combos').select('sku');
    const setSkus = new Set(
      (combos || []).map((c) => String(c.sku || '').trim().toLowerCase()).filter(Boolean)
    );

    const rows = (products || [])
      .filter((p) => {
        const sku = String(p.sku || '').trim().toLowerCase();
        return sku && !setSkus.has(sku);
      })
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        productName: p.name,
        quantity: '',
      }));

    res.status(200).json({ ok: true, locationId, rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

async function assertCountingAllowed(sb, eventId) {
  const { data: event, error } = await sb.from('stocktake_events').select('*').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!event) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }
  if (event.status !== 'counting') {
    const err = new Error('Counting session is closed.');
    err.status = 409;
    throw err;
  }
  return event;
}

async function assertProductEnabledAtLocation(sb, productId, locationId) {
  const { data, error } = await sb
    .from('product_locations')
    .select('product_id')
    .eq('product_id', productId)
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Product is not enabled for this location.');
    err.status = 403;
    throw err;
  }
}

async function assertComboEnabledAtLocation(sb, comboId, locationId) {
  const { data, error } = await sb
    .from('combo_locations')
    .select('combo_id')
    .eq('combo_id', comboId)
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error('Set is not enabled for this location.');
    err.status = 403;
    throw err;
  }
}

async function handleCountAdd(req, res) {
  const body = req.body || {};
  const eventId = body.eventId;
  const productId = body.productId;
  const qtyAdd = Number(body.qty);
  const userEmail = emailOf(body);
  if (!eventId || !productId || !userEmail) {
    return res.status(400).json({ ok: false, error: 'eventId, productId, userEmail required' });
  }
  try {
    const sb = getService();
    const event = await assertCountingAllowed(sb, eventId);
    await assertProductEnabledAtLocation(sb, productId, event.location_id);
    const row = await addCountLine(sb, { eventId, productId, qtyAdd, userEmail });
    res.status(200).json({ ok: true, row });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message || String(err) });
  }
}

async function handleCountMine(req, res) {
  const eventId = req.query?.eventId;
  const userEmail = emailOf({}, req.query || {});
  if (!eventId || !userEmail) return res.status(400).json({ ok: false, error: 'eventId and userEmail required' });
  const sb = getService();
  const { data, error } = await sb
    .from('stocktake_counts')
    .select('product_id, qty, updated_at, products(name, sku)')
    .eq('event_id', eventId)
    .eq('user_email', userEmail)
    .order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.status(200).json({
    ok: true,
    rows: (data || []).map((r) => ({
      product_id: r.product_id,
      qty: Number(r.qty || 0),
      updated_at: r.updated_at,
      name: r.products?.name || null,
      sku: r.products?.sku || null,
    })),
  });
}

async function handleSetScan(req, res) {
  const body = req.body || {};
  const eventId = body.eventId;
  const comboId = body.comboId;
  const setQty = Number(body.qty);
  const userEmail = emailOf(body);
  if (!eventId || !comboId || !userEmail) {
    return res.status(400).json({ ok: false, error: 'eventId, comboId, userEmail required' });
  }
  if (!Number.isFinite(setQty) || setQty <= 0) {
    return res.status(400).json({ ok: false, error: 'qty must be > 0' });
  }

  try {
    const sb = getService();
    const event = await assertCountingAllowed(sb, eventId);
    await assertComboEnabledAtLocation(sb, comboId, event.location_id);

    const { data: components, error: cErr } = await sb
      .from('combo_items')
      .select('product_id, quantity')
      .eq('combo_id', comboId);
    if (cErr) throw cErr;
    if (!components?.length) {
      return res.status(400).json({ ok: false, error: 'Set has no components.' });
    }

    const { data: existingScan } = await sb
      .from('stocktake_set_scans')
      .select('id, set_qty')
      .eq('event_id', eventId)
      .eq('combo_id', comboId)
      .eq('user_email', userEmail)
      .maybeSingle();
    const nextSetQty = Number(existingScan?.set_qty || 0) + setQty;
    await sb.from('stocktake_set_scans').upsert([{
      event_id: eventId,
      combo_id: comboId,
      user_email: userEmail,
      set_qty: nextSetQty,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'event_id,combo_id,user_email' });

    const added = [];
    for (const comp of components) {
      const qtyAdd = Number(comp.quantity || 0) * setQty;
      if (qtyAdd <= 0) continue;
      const row = await addCountLine(sb, {
        eventId,
        productId: comp.product_id,
        qtyAdd,
        userEmail,
      });
      added.push(row);
    }

    res.status(200).json({ ok: true, setQty: nextSetQty, componentsAdded: added.length });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message || String(err) });
  }
}

async function handleProductCreate(req, res) {
  const body = req.body || {};
  const locationId = body.locationId;
  const name = String(body.name || '').trim();
  const sku = String(body.sku || '').trim() || null;
  const price = Number(body.price || 0);
  if (!locationId || !name) return res.status(400).json({ ok: false, error: 'locationId and name required' });

  const sb = getService();
  const { data: product, error } = await sb
    .from('products')
    .insert([{ name, sku, price: Number.isFinite(price) ? price : 0, currency: body.currency || 'ZMW' }])
    .select('id, name, sku, price')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });

  await sb.from('product_locations').insert([{ product_id: product.id, location_id: locationId }]);
  await sb.from('inventory').upsert([{
    product_id: product.id,
    location: locationId,
    quantity: 0,
    updated_at: new Date().toISOString(),
  }], { onConflict: 'product_id,location' });

  res.status(200).json({ ok: true, product: { ...product, type: 'product' } });
}

async function handleSetCreate(req, res) {
  const body = req.body || {};
  const locationId = body.locationId;
  const name = String(body.name || body.combo_name || '').trim();
  const components = Array.isArray(body.components) ? body.components : [];
  const price = Number(body.price || 0);
  if (!locationId || !name) return res.status(400).json({ ok: false, error: 'locationId and name required' });
  if (!components.length) return res.status(400).json({ ok: false, error: 'At least one component required' });

  const sb = getService();
  let nextComboId = 1;
  const { data: latestCombo } = await sb.from('combos').select('id').order('id', { ascending: false }).limit(1);
  if (latestCombo?.[0]?.id) nextComboId = Number(latestCombo[0].id) + 1;

  const { data: combo, error } = await sb
    .from('combos')
    .insert([{
      id: nextComboId,
      combo_name: name,
      sku: body.sku || null,
      combo_price: Number.isFinite(price) ? price : 0,
      standard_price: Number.isFinite(price) ? price : 0,
    }])
    .select('id, combo_name, sku, standard_price, combo_price')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });

  await sb.from('combo_locations').insert([{ combo_id: combo.id, location_id: locationId }]);
  const itemRows = components.map((c) => ({
    combo_id: combo.id,
    product_id: c.product_id || c.productId,
    quantity: Number(c.quantity || c.qty || 1),
  })).filter((r) => r.product_id && r.quantity > 0);

  const { error: itemsErr } = await sb.from('combo_items').insert(itemRows);
  if (itemsErr) {
    let nextId = 1;
    const { data: latest } = await sb.from('combo_items').select('id').order('id', { ascending: false }).limit(1);
    if (latest?.[0]?.id) nextId = Number(latest[0].id) + 1;
    const withIds = itemRows.map((r) => ({ ...r, id: nextId++ }));
    const { error: retryErr } = await sb.from('combo_items').insert(withIds);
    if (retryErr) return res.status(500).json({ ok: false, error: retryErr.message });
  }

  res.status(200).json({
    ok: true,
    set: {
      id: combo.id,
      name: combo.combo_name,
      sku: combo.sku,
      price: combo.standard_price ?? combo.combo_price ?? 0,
      type: 'set',
      components: itemRows,
    },
  });
}

async function sumTransfers(sb, locationId, startISO, endISO, direction) {
  const locCol = direction === 'in' ? 'to_location' : 'from_location';
  const map = new Map();

  const { data: sessionsDt } = await sb
    .from('stock_transfer_sessions')
    .select('id')
    .eq(locCol, locationId)
    .eq('status', 'approved')
    .not('transfer_datetime', 'is', null)
    .gte('transfer_datetime', startISO)
    .lte('transfer_datetime', endISO);

  const startDate = String(startISO).slice(0, 10);
  const endDate = String(endISO).slice(0, 10);
  const { data: sessionsDate } = await sb
    .from('stock_transfer_sessions')
    .select('id')
    .eq(locCol, locationId)
    .eq('status', 'approved')
    .is('transfer_datetime', null)
    .gte('transfer_date', startDate)
    .lte('transfer_date', endDate);

  const ids = [...new Set([
    ...(sessionsDt || []).map((s) => s.id),
    ...(sessionsDate || []).map((s) => s.id),
  ])];
  if (!ids.length) return map;

  const { data: entries } = await sb
    .from('stock_transfer_entries')
    .select('product_id, quantity')
    .in('session_id', ids);
  (entries || []).forEach((e) => {
    map.set(e.product_id, (map.get(e.product_id) || 0) + Number(e.quantity || 0));
  });
  return map;
}

async function sumSales(sb, locationId, startISO, endISO) {
  const map = new Map();
  const startDate = String(startISO).slice(0, 10);
  const endDate = String(endISO).slice(0, 10);

  const { data: byDate } = await sb
    .from('sales')
    .select('id')
    .eq('location_id', locationId)
    .not('sale_date', 'is', null)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate);

  const { data: byCreated } = await sb
    .from('sales')
    .select('id')
    .eq('location_id', locationId)
    .is('sale_date', null)
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const ids = [...new Set([
    ...(byDate || []).map((s) => s.id),
    ...(byCreated || []).map((s) => s.id),
  ])];
  if (!ids.length) return map;

  const { data: items } = await sb
    .from('sales_items')
    .select('product_id, quantity')
    .in('sale_id', ids);
  (items || []).forEach((e) => {
    map.set(e.product_id, (map.get(e.product_id) || 0) + Number(e.quantity || 0));
  });
  return map;
}

function activeUnitPrice(product, atDate = new Date()) {
  const promo = Number(product?.promotional_price);
  const standard = Number(product?.price || 0);
  if (!Number.isFinite(promo) || promo <= 0) return standard;
  const start = product.promo_start_date ? new Date(product.promo_start_date) : null;
  const end = product.promo_end_date ? new Date(product.promo_end_date) : null;
  const t = atDate.getTime();
  if (start && t < start.getTime()) return standard;
  if (end && t > end.getTime()) return standard;
  return promo;
}

async function buildVarianceRows(sb, period) {
  const locationId = period.location_id;
  const startISO = period.begin_period_date || period.opened_at;
  const endISO = period.end_period_date || period.closed_at || new Date().toISOString();

  const { data: opening } = await sb
    .from('opening_stock_entries')
    .select('product_id, qty')
    .eq('session_id', period.id);
  const { data: closing } = await sb
    .from('closing_stock_entries')
    .select('product_id, qty')
    .eq('session_id', period.id);

  const openingMap = new Map((opening || []).map((r) => [r.product_id, Number(r.qty || 0)]));
  const closingMap = new Map((closing || []).map((r) => [r.product_id, Number(r.qty || 0)]));
  const transfersIn = await sumTransfers(sb, locationId, startISO, endISO, 'in');
  const transfersOut = await sumTransfers(sb, locationId, startISO, endISO, 'out');
  const salesMap = await sumSales(sb, locationId, startISO, endISO);

  const productIds = new Set([
    ...openingMap.keys(),
    ...closingMap.keys(),
    ...transfersIn.keys(),
    ...transfersOut.keys(),
    ...salesMap.keys(),
  ]);

  const { data: products } = await sb
    .from('products')
    .select('id, name, sku, price, promotional_price, promo_start_date, promo_end_date')
    .in('id', Array.from(productIds));
  const productMap = new Map((products || []).map((p) => [p.id, p]));

  // Load combos for set reconstruction on closing qtys
  const { data: comboLocs } = await sb.from('combo_locations').select('combo_id').eq('location_id', locationId);
  const comboIds = (comboLocs || []).map((r) => r.combo_id);
  let combos = [];
  let comboItems = [];
  if (comboIds.length) {
    const { data: c } = await sb.from('combos').select('id, combo_name, sku, standard_price, combo_price').in('id', comboIds);
    const { data: ci } = await sb.from('combo_items').select('combo_id, product_id, quantity').in('combo_id', comboIds);
    combos = c || [];
    comboItems = ci || [];
  }

  const remaining = new Map(closingMap);
  const setRows = [];
  for (const combo of combos) {
    const comps = comboItems.filter((i) => i.combo_id === combo.id);
    if (!comps.length) continue;
    let maxSets = Infinity;
    comps.forEach((comp) => {
      const have = remaining.get(comp.product_id) || 0;
      const need = Number(comp.quantity || 0);
      if (need <= 0) return;
      maxSets = Math.min(maxSets, Math.floor(have / need));
    });
    if (!Number.isFinite(maxSets) || maxSets <= 0) continue;
    comps.forEach((comp) => {
      const need = Number(comp.quantity || 0) * maxSets;
      remaining.set(comp.product_id, (remaining.get(comp.product_id) || 0) - need);
    });
    // Aggregate opening/transfers/sales for set display approximately from components
    let openQty = 0;
    let tin = 0;
    let tout = 0;
    let sales = 0;
    comps.forEach((comp) => {
      const need = Number(comp.quantity || 0);
      if (need <= 0) return;
      openQty += (openingMap.get(comp.product_id) || 0) / need;
      tin += (transfersIn.get(comp.product_id) || 0) / need;
      tout += (transfersOut.get(comp.product_id) || 0) / need;
      sales += (salesMap.get(comp.product_id) || 0) / need;
    });
    openQty = Math.floor(Math.min(...comps.map((comp) => {
      const need = Number(comp.quantity || 0) || 1;
      return (openingMap.get(comp.product_id) || 0) / need;
    })));
    // Prefer component-min for opening sets
    const expected = openQty + Math.floor(tin) - Math.floor(tout) - Math.floor(sales);
    const variance = maxSets - expected;
    const unit = Number(combo.standard_price ?? combo.combo_price ?? 0);
    setRows.push({
      sku: combo.sku || '',
      product_name: combo.combo_name,
      opening_stock_qty: openQty,
      transfers_in: Math.floor(tin),
      transfers_out: Math.floor(tout),
      sales: Math.floor(sales),
      expected_qty: expected,
      closing_stock_qty: maxSets,
      variance,
      variance_amount: variance * unit,
      is_set: true,
    });
  }

  const productRows = [];
  remaining.forEach((closingQty, productId) => {
    if (Math.abs(closingQty) < 1e-9 && !openingMap.has(productId) && !salesMap.has(productId)
      && !transfersIn.has(productId) && !transfersOut.has(productId)) {
      return;
    }
    const p = productMap.get(productId) || {};
    const openingQty = openingMap.get(productId) || 0;
    const tin = transfersIn.get(productId) || 0;
    const tout = transfersOut.get(productId) || 0;
    const sales = salesMap.get(productId) || 0;
    const expected = openingQty + tin - tout - sales;
    const variance = closingQty - expected;
    const unit = activeUnitPrice(p, new Date(endISO));
    productRows.push({
      sku: p.sku || '',
      product_name: p.name || productId,
      opening_stock_qty: openingQty,
      transfers_in: tin,
      transfers_out: tout,
      sales,
      expected_qty: expected,
      closing_stock_qty: closingQty,
      variance,
      variance_amount: variance * unit,
      is_set: false,
    });
  });

  return [...setRows, ...productRows].sort((a, b) => String(a.product_name).localeCompare(String(b.product_name)));
}

async function handleCountsClear(req, res) {
  const body = req.body || {};
  const eventId = body.eventId;
  const userEmail = emailOf(body);
  if (!eventId) return res.status(400).json({ ok: false, error: 'eventId required' });

  try {
    const sb = getService();
    const event = await assertCountingAllowed(sb, eventId);

    const { error: cErr } = await sb.from('stocktake_counts').delete().eq('event_id', eventId);
    if (cErr) throw cErr;
    const { error: lErr } = await sb.from('stocktake_count_log').delete().eq('event_id', eventId);
    if (lErr) throw lErr;
    const { error: sErr } = await sb.from('stocktake_set_scans').delete().eq('event_id', eventId);
    if (sErr) throw sErr;

    res.status(200).json({
      ok: true,
      eventId: event.id,
      locationId: event.location_id,
      clearedBy: userEmail || null,
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message || String(err) });
  }
}

async function handleEventCancel(req, res) {
  const body = req.body || {};
  const eventId = body.eventId;
  const userEmail = emailOf(body);
  if (!eventId) return res.status(400).json({ ok: false, error: 'eventId required' });

  const sb = getService();
  const { data: event, error } = await sb.from('stocktake_events').select('*').eq('id', eventId).maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!event) return res.status(404).json({ ok: false, error: 'Event not found' });
  if (event.status !== 'counting') {
    return res.status(409).json({ ok: false, error: 'Only an open counting session can be closed this way.' });
  }

  const [{ count: countRows, error: cErr }, { count: scanRows, error: sErr }] = await Promise.all([
    sb.from('stocktake_counts').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    sb.from('stocktake_set_scans').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
  ]);
  if (cErr) return res.status(500).json({ ok: false, error: cErr.message });
  if (sErr) return res.status(500).json({ ok: false, error: sErr.message });

  if ((countRows || 0) > 0 || (scanRows || 0) > 0) {
    return res.status(409).json({
      ok: false,
      error: 'Counts already exist. Clear counts for a fresh start, or submit the stocktake to finish.',
      hasCounts: true,
    });
  }

  const { data: updated, error: upErr } = await sb
    .from('stocktake_events')
    .update({
      status: 'cancelled',
      counting_enabled: false,
      submitted_at: new Date().toISOString(),
      submitted_by_email: userEmail || null,
      notes: [event.notes, 'Cancelled empty session'].filter(Boolean).join(' · '),
    })
    .eq('id', eventId)
    .select('*')
    .single();
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

  res.status(200).json({ ok: true, event: updated });
}

async function handleEventSubmit(req, res) {
  const body = req.body || {};
  const eventId = body.eventId;
  const userEmail = emailOf(body);
  if (!eventId) return res.status(400).json({ ok: false, error: 'eventId required' });

  const sb = getService();
  const { data: event, error } = await sb.from('stocktake_events').select('*').eq('id', eventId).maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!event) return res.status(404).json({ ok: false, error: 'Event not found' });
  if (event.status !== 'counting') {
    return res.status(409).json({ ok: false, error: 'Event already submitted.' });
  }

  const locationId = event.location_id;
  const now = new Date().toISOString();

  const { data: countRows, error: cErr } = await sb
    .from('stocktake_counts')
    .select('product_id, qty')
    .eq('event_id', eventId);
  if (cErr) return res.status(500).json({ ok: false, error: cErr.message });

  const totals = new Map();
  (countRows || []).forEach((r) => {
    totals.set(r.product_id, (totals.get(r.product_id) || 0) + Number(r.qty || 0));
  });

  const { data: locProducts } = await sb
    .from('product_locations')
    .select('product_id')
    .eq('location_id', locationId);
  (locProducts || []).forEach((r) => {
    if (!totals.has(r.product_id)) totals.set(r.product_id, 0);
  });

  const invPayload = Array.from(totals.entries()).map(([product_id, quantity]) => ({
    product_id,
    location: locationId,
    quantity,
    updated_at: now,
  }));
  if (invPayload.length) {
    const { error: invErr } = await sb.from('inventory').upsert(invPayload, { onConflict: 'product_id,location' });
    if (invErr) return res.status(500).json({ ok: false, error: invErr.message });
  }

  const { data: state } = await sb
    .from('stocktake_location_state')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle();
  const initialCompleted = Boolean(state?.initial_completed);

  let closedPeriod = null;
  let openedPeriod = null;
  let varianceRows = [];
  let submitType = 'initial';

  if (!initialCompleted) {
    const { data: period, error: pErr } = await sb
      .from('stock_periods')
      .insert([{
        location_id: locationId,
        status: 'open',
        opened_at: now,
        begin_period_date: now,
        source_event_id: eventId,
        updated_at: now,
      }])
      .select('*')
      .single();
    if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
    openedPeriod = period;

    const openingRows = Array.from(totals.entries()).map(([product_id, qty]) => ({
      session_id: period.id,
      product_id,
      qty,
    }));
    if (openingRows.length) {
      const { error: oErr } = await sb.from('opening_stock_entries').upsert(openingRows, { onConflict: 'session_id,product_id' });
      if (oErr) return res.status(500).json({ ok: false, error: oErr.message });
    }

    await sb.from('stocktake_location_state').upsert([{
      location_id: locationId,
      initial_completed: true,
      initial_completed_at: now,
      updated_at: now,
    }], { onConflict: 'location_id' });

    await sb.from('stocktake_events').update({
      status: 'submitted',
      counting_enabled: false,
      submitted_at: now,
      submitted_by_email: userEmail || null,
      is_initial: true,
      opened_period_id: period.id,
    }).eq('id', eventId);
  } else {
    submitType = 'rollover';
    const { data: openPeriod, error: opErr } = await sb
      .from('stock_periods')
      .select('*')
      .eq('location_id', locationId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (opErr) return res.status(500).json({ ok: false, error: opErr.message });
    if (!openPeriod) {
      return res.status(409).json({ ok: false, error: 'No open period found. Run an initial stocktake first.' });
    }

    const closingRows = Array.from(totals.entries()).map(([product_id, qty]) => ({
      session_id: openPeriod.id,
      product_id,
      qty,
    }));
    if (closingRows.length) {
      await sb.from('closing_stock_entries').delete().eq('session_id', openPeriod.id);
      const { error: clErr } = await sb.from('closing_stock_entries').insert(closingRows);
      if (clErr) return res.status(500).json({ ok: false, error: clErr.message });
    }

    const { data: closed, error: closeErr } = await sb
      .from('stock_periods')
      .update({
        status: 'closed',
        closed_at: now,
        end_period_date: now,
        variance_pdf_ready: true,
        updated_at: now,
        source_event_id: eventId,
      })
      .eq('id', openPeriod.id)
      .select('*')
      .single();
    if (closeErr) return res.status(500).json({ ok: false, error: closeErr.message });
    closedPeriod = closed;

    const { data: nextPeriod, error: nErr } = await sb
      .from('stock_periods')
      .insert([{
        location_id: locationId,
        status: 'open',
        opened_at: now,
        begin_period_date: now,
        source_event_id: eventId,
        updated_at: now,
      }])
      .select('*')
      .single();
    if (nErr) return res.status(500).json({ ok: false, error: nErr.message });
    openedPeriod = nextPeriod;

    const openingRows = Array.from(totals.entries()).map(([product_id, qty]) => ({
      session_id: nextPeriod.id,
      product_id,
      qty,
    }));
    if (openingRows.length) {
      const { error: oErr } = await sb.from('opening_stock_entries').upsert(openingRows, { onConflict: 'session_id,product_id' });
      if (oErr) return res.status(500).json({ ok: false, error: oErr.message });
    }

    varianceRows = await buildVarianceRows(sb, closed);

    await sb.from('stocktake_events').update({
      status: 'submitted',
      counting_enabled: false,
      submitted_at: now,
      submitted_by_email: userEmail || null,
      closed_period_id: closed.id,
      opened_period_id: nextPeriod.id,
    }).eq('id', eventId);
  }

  const { data: updatedEvent } = await sb.from('stocktake_events').select('*').eq('id', eventId).maybeSingle();

  res.status(200).json({
    ok: true,
    submitType,
    event: updatedEvent,
    closedPeriod,
    openedPeriod,
    appliedProducts: invPayload.length,
    varianceRows,
    kickSessions: true,
  });
}

async function handlePeriodsList(req, res) {
  const locationId = req.query?.locationId;
  if (!locationId) return res.status(400).json({ ok: false, error: 'locationId required' });
  const sb = getService();
  const { data, error } = await sb
    .from('stock_periods')
    .select('*')
    .eq('location_id', locationId)
    .order('opened_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.status(200).json({ ok: true, rows: data || [] });
}

async function handlePeriodDetail(req, res) {
  const periodId = req.query?.periodId;
  if (!periodId) return res.status(400).json({ ok: false, error: 'periodId required' });
  const sb = getService();
  const { data: period, error } = await sb.from('stock_periods').select('*').eq('id', periodId).maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!period) return res.status(404).json({ ok: false, error: 'Period not found' });

  const { data: opening } = await sb
    .from('opening_stock_entries')
    .select('product_id, qty, products(name, sku)')
    .eq('session_id', periodId);
  const { data: closing } = await sb
    .from('closing_stock_entries')
    .select('product_id, qty, products(name, sku)')
    .eq('session_id', periodId);

  res.status(200).json({
    ok: true,
    period,
    opening: (opening || []).map((r) => ({
      product_id: r.product_id,
      qty: Number(r.qty || 0),
      name: r.products?.name,
      sku: r.products?.sku,
    })),
    closing: (closing || []).map((r) => ({
      product_id: r.product_id,
      qty: Number(r.qty || 0),
      name: r.products?.name,
      sku: r.products?.sku,
    })),
  });
}

async function handlePeriodVariance(req, res) {
  const periodId = req.query?.periodId;
  if (!periodId) return res.status(400).json({ ok: false, error: 'periodId required' });
  const sb = getService();
  const { data: period, error } = await sb.from('stock_periods').select('*').eq('id', periodId).maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!period) return res.status(404).json({ ok: false, error: 'Period not found' });
  if (period.status !== 'closed') {
    return res.status(409).json({ ok: false, error: 'Variance PDF is only available after period close.' });
  }
  const rows = await buildVarianceRows(sb, period);
  const { data: company } = await sb.from('company_settings').select('*').limit(1).maybeSingle();
  res.status(200).json({ ok: true, period, rows, company: company || null });
}

export default async function handler(req, res) {
  const action = resolveAction(req);
  const method = ACTION_METHOD[action];
  const allowedMethods = method ? `${method}, OPTIONS` : 'GET, POST, OPTIONS';
  setCors(res, allowedMethods);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!method) return res.status(400).json({ ok: false, error: 'Unknown action' });
  if (req.method !== method) {
    res.setHeader('Allow', allowedMethods);
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }
  try {
    switch (action) {
      case 'login': return handleLogin(req, res);
      case 'auth-profile': return handleAuthProfile(req, res);
      case 'locations': return handleLocations(req, res);
      case 'location-state': return handleLocationState(req, res);
      case 'catalog': return handleCatalog(req, res);
      case 'events-list': return handleEventsList(req, res);
      case 'open-sessions': return handleOpenSessions(req, res);
      case 'event-get': return handleEventGet(req, res);
      case 'event-create': return handleEventCreate(req, res);
      case 'event-set-gate': return handleEventSetGate(req, res);
      case 'count-add': return handleCountAdd(req, res);
      case 'count-mine': return handleCountMine(req, res);
      case 'counts-import': return handleCountsImport(req, res);
      case 'counts-clear': return handleCountsClear(req, res);
      case 'import-template': return handleImportTemplate(req, res);
      case 'set-scan': return handleSetScan(req, res);
      case 'product-create': return handleProductCreate(req, res);
      case 'set-create': return handleSetCreate(req, res);
      case 'event-submit': return handleEventSubmit(req, res);
      case 'event-cancel': return handleEventCancel(req, res);
      case 'periods-list': return handlePeriodsList(req, res);
      case 'period-detail': return handlePeriodDetail(req, res);
      case 'period-variance': return handlePeriodVariance(req, res);
      default: return res.status(400).json({ ok: false, error: 'Unknown action' });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
