import db from '../dataClient';
import { signInWithEmailPassword } from '../utils/authLogin';
import { buildLiveConsolidatedWithSets } from '../utils/stocktakeLiveTotals';

const API_TIMEOUT_MS = 12000;

function currentEmail() {
  try {
    const raw = localStorage.getItem('user');
    const user = raw ? JSON.parse(raw) : null;
    return String(user?.email || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function cleanTerm(value) {
  return String(value || '').trim().replace(/[,*%]/g, '');
}

const LOCATION_PRODUCT_IDS_TTL_MS = 5 * 60 * 1000;
const CATALOG_CACHE_TTL_MS = 60 * 1000;
const locationProductIdsCache = new Map();
const catalogCache = new Map();

function catalogCacheKey(locationId, term) {
  return `${locationId}|${String(term || '').toLowerCase()}`;
}

function buildIlikeOrFilter(fields, term) {
  const like = `%${term}%`;
  return fields.map((field) => `${field}.ilike.${like}`).join(',');
}

function isApiUnavailable(err) {
  const status = Number(err?.status || 0);
  if (status === 502 || status === 503 || status === 504) return true;
  const msg = String(err?.message || err?.name || '');
  return /abort|timeout|failed to fetch|network|gateway|name.?not.?resolved/i.test(msg);
}

async function fetchJson(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: controller?.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const err = new Error(data.error || (response.status === 504 ? 'Stocktake API timed out (Vercel).' : 'Request failed.'));
      err.payload = data;
      err.status = response.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error('Stocktake API timed out. Falling back to Supabase when possible.');
      timeoutErr.status = 504;
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withApiOrClient(apiCall, clientCall, { fallbackOnServerError = false } = {}) {
  try {
    return await apiCall();
  } catch (err) {
    const status = Number(err?.status || 0);
    const canFallback = isApiUnavailable(err) || (fallbackOnServerError && status >= 500);
    if (!canFallback) throw err;
    try {
      return await clientCall();
    } catch (clientErr) {
      const msg = clientErr?.message || err.message || 'Request failed.';
      throw new Error(
        /timeout|504|gateway|failed to fetch/i.test(String(err.message || ''))
          ? `${msg} (Vercel API unreachable — used Supabase fallback)`
          : msg,
      );
    }
  }
}

async function clientLoadLocationCombos(locationId) {
  if (!locationId) return { combos: [], comboItems: [] };
  const { data: comboLocs, error: clErr } = await db
    .from('combo_locations')
    .select('combo_id')
    .eq('location_id', locationId);
  if (clErr) throw clErr;
  const comboIds = [...new Set((comboLocs || []).map((r) => r.combo_id).filter(Boolean))];
  if (!comboIds.length) return { combos: [], comboItems: [] };
  const [{ data: combos, error: cErr }, { data: comboItems, error: iErr }] = await Promise.all([
    db.from('combos').select('id, combo_name, sku').in('id', comboIds),
    db.from('combo_items').select('combo_id, product_id, quantity').in('combo_id', comboIds),
  ]);
  if (cErr) throw cErr;
  if (iErr) throw iErr;
  return { combos: combos || [], comboItems: comboItems || [] };
}

async function clientFetchLocations() {
  const { data, error } = await db.from('locations').select('id, name').order('name');
  if (error) throw error;
  return { ok: true, rows: data || [] };
}

async function clientFetchLocationState(locationId) {
  const { data, error } = await db
    .from('stocktake_location_state')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) throw error;
  return {
    ok: true,
    state: data || { location_id: locationId, initial_completed: false },
  };
}

async function clientListEvents(locationId) {
  const { data, error } = await db
    .from('stocktake_events')
    .select('*')
    .eq('location_id', locationId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return { ok: true, rows: data || [] };
}

async function clientListOpenSessions() {
  const { data, error } = await db
    .from('stocktake_events')
    .select('id, location_id, status, counting_enabled, is_initial, created_at, created_by_email')
    .eq('status', 'counting')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const locationIds = [...new Set(rows.map((r) => r.location_id).filter(Boolean))];
  let locationMap = new Map();
  if (locationIds.length) {
    const { data: locs } = await db.from('locations').select('id, name').in('id', locationIds);
    locationMap = new Map((locs || []).map((l) => [l.id, l.name]));
  }
  return {
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      location_name: locationMap.get(r.location_id) || 'Location',
    })),
  };
}

async function clientGetEvent(eventId) {
  const { data: event, error } = await db
    .from('stocktake_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  if (!event) throw new Error('Event not found');

  const { data: counts, error: cErr } = await db
    .from('stocktake_counts')
    .select('product_id, user_email, qty, updated_at, products(name, sku)')
    .eq('event_id', eventId);
  if (cErr) throw cErr;

  const [{ combos, comboItems }, scansRes] = await Promise.all([
    clientLoadLocationCombos(event.location_id),
    db
      .from('stocktake_set_scans')
      .select('combo_id, user_email, set_qty, updated_at')
      .eq('event_id', eventId),
  ]);
  if (scansRes.error) throw scansRes.error;
  const setScans = scansRes.data || [];

  const consolidated = buildLiveConsolidatedWithSets({
    counts: counts || [],
    combos,
    comboItems,
    setScans,
  });

  return { ok: true, event, consolidated, counts: counts || [], set_scans: setScans };
}

async function clientCreateEvent(locationId, notes = '') {
  const userEmail = currentEmail();
  const { data: existingOpen } = await db
    .from('stocktake_events')
    .select('id')
    .eq('location_id', locationId)
    .eq('status', 'counting')
    .limit(1)
    .maybeSingle();
  if (existingOpen?.id) {
    const err = new Error('A counting session is already open for this location. Close it (if empty) or submit it first.');
    err.status = 409;
    throw err;
  }

  const { data: state } = await db
    .from('stocktake_location_state')
    .select('*')
    .eq('location_id', locationId)
    .maybeSingle();
  const isInitial = !Boolean(state?.initial_completed);

  const { data: event, error } = await db
    .from('stocktake_events')
    .insert([{
      location_id: locationId,
      status: 'counting',
      counting_enabled: true,
      is_initial: isInitial,
      created_by_email: userEmail || null,
      notes: notes || null,
    }])
    .select('*')
    .single();
  if (error) throw error;

  await db.from('stocktake_gate_audit').insert([{
    event_id: event.id,
    location_id: locationId,
    enabled: true,
    changed_by_email: userEmail || null,
  }]);

  return { ok: true, event, initialCompleted: Boolean(state?.initial_completed) };
}

async function clientCancelEvent(eventId, userEmail = currentEmail(), { force = false } = {}) {
  const { data: event, error } = await db
    .from('stocktake_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  if (!event) throw new Error('Event not found');
  if (event.status !== 'counting') throw new Error('Only an open counting session can be closed this way.');

  const [{ count: countRows }, { count: scanRows }] = await Promise.all([
    db.from('stocktake_counts').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    db.from('stocktake_set_scans').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
  ]);
  const hasCounts = (countRows || 0) > 0 || (scanRows || 0) > 0;
  if (hasCounts && !force) {
    throw new Error('Counts already exist. Clear counts for a fresh start, or submit the stocktake to finish.');
  }

  if (hasCounts && force) {
    const { error: delCountsErr } = await db.from('stocktake_counts').delete().eq('event_id', eventId);
    if (delCountsErr) throw delCountsErr;
    const { error: delLogErr } = await db.from('stocktake_count_log').delete().eq('event_id', eventId);
    if (delLogErr) throw delLogErr;
    const { error: delScansErr } = await db.from('stocktake_set_scans').delete().eq('event_id', eventId);
    if (delScansErr) throw delScansErr;
  }

  const cancelNote = force && hasCounts ? 'Force closed session (counts discarded)' : 'Cancelled empty session';
  const { data: updated, error: upErr } = await db
    .from('stocktake_events')
    .update({
      status: 'cancelled',
      counting_enabled: false,
      submitted_at: new Date().toISOString(),
      submitted_by_email: userEmail || null,
      notes: [event.notes, cancelNote].filter(Boolean).join(' · '),
    })
    .eq('id', eventId)
    .select('*')
    .single();
  if (upErr) throw upErr;
  return { ok: true, event: updated, forceClosed: force && hasCounts };
}

async function clientClearCounts(eventId) {
  const { error } = await db.from('stocktake_counts').delete().eq('event_id', eventId);
  if (error) throw error;
  await db.from('stocktake_set_scans').delete().eq('event_id', eventId);
  return { ok: true };
}

async function clientRemoveMyCount(eventId, productId, userEmail = currentEmail()) {
  const { error } = await db
    .from('stocktake_counts')
    .delete()
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .eq('user_email', userEmail);
  if (error) throw error;
  await db
    .from('stocktake_count_log')
    .delete()
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .eq('user_email', userEmail);
  return { ok: true };
}

async function clientClearMyCounts(eventId, userEmail = currentEmail()) {
  const { error } = await db
    .from('stocktake_counts')
    .delete()
    .eq('event_id', eventId)
    .eq('user_email', userEmail);
  if (error) throw error;
  await db.from('stocktake_count_log').delete().eq('event_id', eventId).eq('user_email', userEmail);
  await db.from('stocktake_set_scans').delete().eq('event_id', eventId).eq('user_email', userEmail);
  return { ok: true };
}

async function clientAddCount(eventId, productId, qty, userEmail = currentEmail()) {
  const add = Number(qty);
  if (!Number.isFinite(add) || add <= 0) throw new Error('qty must be > 0');
  if (!userEmail) throw new Error('userEmail required');

  const { data: event } = await db.from('stocktake_events').select('status, counting_enabled').eq('id', eventId).maybeSingle();
  if (!event || event.status !== 'counting') throw new Error('Counting session is not open.');
  if (!event.counting_enabled) throw new Error('Counting is paused for this session.');

  const { data: existing } = await db
    .from('stocktake_counts')
    .select('id, qty')
    .eq('event_id', eventId)
    .eq('product_id', productId)
    .eq('user_email', userEmail)
    .maybeSingle();

  const nextQty = Number(existing?.qty || 0) + add;
  const { data: row, error } = await db
    .from('stocktake_counts')
    .upsert([{
      event_id: eventId,
      product_id: productId,
      user_email: userEmail,
      qty: nextQty,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'event_id,product_id,user_email' })
    .select('*')
    .single();
  if (error) throw error;

  await db.from('stocktake_count_log').insert([{
    event_id: eventId,
    product_id: productId,
    user_email: userEmail,
    qty_added: add,
    qty_after: nextQty,
  }]);

  return { ok: true, row };
}

async function clientFetchMyCounts(eventId, userEmail = currentEmail()) {
  const { data, error } = await db
    .from('stocktake_counts')
    .select('product_id, qty, updated_at, products(name, sku)')
    .eq('event_id', eventId)
    .eq('user_email', userEmail)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return {
    ok: true,
    rows: (data || []).map((r) => ({
      product_id: r.product_id,
      qty: r.qty,
      updated_at: r.updated_at,
      name: r.products?.name || null,
      sku: r.products?.sku || null,
    })),
  };
}

async function resolveLocationProductIds(locationId) {
  const cached = locationProductIdsCache.get(locationId);
  if (cached && Date.now() - cached.at < LOCATION_PRODUCT_IDS_TTL_MS) {
    return cached.ids;
  }

  const ids = new Set();
  const [{ data: linked, error: plErr }, { data: invRows, error: invErr }] = await Promise.all([
    db.from('product_locations').select('product_id').eq('location_id', locationId),
    // All Products shows location stock from inventory — include those too.
    db.from('inventory').select('product_id').eq('location', locationId),
  ]);
  if (plErr) throw plErr;
  if (invErr) throw invErr;
  (linked || []).forEach((r) => { if (r.product_id) ids.add(String(r.product_id)); });
  (invRows || []).forEach((r) => { if (r.product_id) ids.add(String(r.product_id)); });
  const list = [...ids];
  locationProductIdsCache.set(locationId, { ids: list, at: Date.now() });
  return list;
}

async function fetchLocationProductsByTerm(locationProductIds, term) {
  const orFilter = buildIlikeOrFilter(['name', 'sku'], term);

  if (locationProductIds.length <= 200) {
    const { data, error } = await db
      .from('products')
      .select('id, name, sku, price')
      .in('id', locationProductIds)
      .or(orFilter)
      .order('name')
      .limit(80);
    if (error) throw error;
    return (data || []).map((p) => ({ ...p, type: 'product' }));
  }

  const { data, error } = await db
    .from('products')
    .select('id, name, sku, price')
    .or(orFilter)
    .order('name')
    .limit(150);
  if (error) throw error;
  const idSet = new Set(locationProductIds.map(String));
  return (data || [])
    .filter((p) => idSet.has(String(p.id)))
    .slice(0, 80)
    .map((p) => ({ ...p, type: 'product' }));
}

async function clientFetchCatalog(locationId, q = '') {
  const term = cleanTerm(q);
  const cacheKey = catalogCacheKey(locationId, term);
  const cached = catalogCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CATALOG_CACHE_TTL_MS) {
    return cached.data;
  }

  const locationProductIdsPromise = resolveLocationProductIds(locationId);
  const comboLocsPromise = db
    .from('combo_locations')
    .select('combo_id')
    .eq('location_id', locationId);

  const [locationProductIds, { data: comboLocs, error: clErr }] = await Promise.all([
    locationProductIdsPromise,
    comboLocsPromise,
  ]);
  if (clErr) throw clErr;

  let products = [];
  if (locationProductIds.length) {
    if (term) {
      products = await fetchLocationProductsByTerm(locationProductIds, term);
    } else {
      const chunk = locationProductIds.slice(0, 120);
      const { data, error } = await db
        .from('products')
        .select('id, name, sku, price')
        .in('id', chunk)
        .order('name')
        .limit(80);
      if (error) throw error;
      products = (data || []).map((p) => ({ ...p, type: 'product' }));
    }
  }

  const comboIds = [...new Set((comboLocs || []).map((r) => r.combo_id).filter(Boolean))];
  let sets = [];
  if (comboIds.length) {
    let comboQuery = db
      .from('combos')
      .select('id, combo_name, sku, standard_price, combo_price, promotional_price')
      .in('id', comboIds)
      .order('combo_name')
      .limit(80);
    if (term) {
      const like = `%${term}%`;
      comboQuery = comboQuery.or(`combo_name.ilike.${like},sku.ilike.${like}`);
    }
    const { data: combos, error: sErr } = await comboQuery;
    if (sErr) throw sErr;
    const matchedComboIds = (combos || []).map((c) => c.id).filter(Boolean);
    let byCombo = new Map();
    if (matchedComboIds.length) {
      const { data: items } = await db
        .from('combo_items')
        .select('combo_id, product_id, quantity')
        .in('combo_id', matchedComboIds);
      byCombo = new Map();
      (items || []).forEach((row) => {
        if (!byCombo.has(row.combo_id)) byCombo.set(row.combo_id, []);
        byCombo.get(row.combo_id).push({ product_id: row.product_id, quantity: Number(row.quantity || 0) });
      });
    }
    sets = (combos || []).map((c) => ({
      id: c.id,
      name: c.combo_name,
      sku: c.sku,
      price: c.standard_price ?? c.combo_price ?? c.promotional_price ?? 0,
      type: 'set',
      components: byCombo.get(c.id) || [],
    }));
  }

  const payload = { ok: true, products, sets };
  catalogCache.set(cacheKey, { data: payload, at: Date.now() });
  return payload;
}

export function invalidateStocktakeCatalogCache(locationId) {
  if (!locationId) {
    catalogCache.clear();
    locationProductIdsCache.clear();
    return;
  }
  locationProductIdsCache.delete(locationId);
  for (const key of catalogCache.keys()) {
    if (key.startsWith(`${locationId}|`)) catalogCache.delete(key);
  }
}

async function clientListPeriods(locationId) {
  const { data, error } = await db
    .from('stock_periods')
    .select('*')
    .eq('location_id', locationId)
    .order('opened_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return { ok: true, rows: data || [] };
}

export function stocktakeCountSessionKey(eventId) {
  return `stocktake:countSession:${eventId}`;
}

/** Email/password via Supabase Auth (localhost + production). */
export async function stocktakeLogin(email, password) {
  const result = await signInWithEmailPassword(email, password);
  if (!result.ok) {
    const err = new Error(result.error || 'Login failed.');
    err.payload = result;
    throw err;
  }
  return result;
}

export async function fetchLocations() {
  return withApiOrClient(
    () => fetchJson('/api/stocktake-locations'),
    clientFetchLocations,
  );
}

export async function fetchLocationState(locationId) {
  return withApiOrClient(
    () => fetchJson(`/api/stocktake-location-state?locationId=${encodeURIComponent(locationId)}`),
    () => clientFetchLocationState(locationId),
  );
}

export async function fetchCatalog(locationId, q = '') {
  // Prefer direct Supabase for catalog — faster and works when Vercel API is down.
  try {
    return await clientFetchCatalog(locationId, q);
  } catch (clientErr) {
    const params = new URLSearchParams({ locationId, q });
    try {
      return await fetchJson(`/api/stocktake-catalog?${params}`, {}, 8000);
    } catch (apiErr) {
      throw new Error(clientErr?.message || apiErr?.message || 'Failed to load products.');
    }
  }
}

export async function listEvents(locationId) {
  return withApiOrClient(
    () => fetchJson(`/api/stocktake-events-list?locationId=${encodeURIComponent(locationId)}`),
    () => clientListEvents(locationId),
  );
}

export async function listOpenSessions() {
  // Prefer Supabase so counters can join sessions when Vercel API is down.
  try {
    return await clientListOpenSessions();
  } catch (clientErr) {
    try {
      return await fetchJson('/api/stocktake-open-sessions', {}, 8000);
    } catch (apiErr) {
      throw new Error(clientErr?.message || apiErr?.message || 'Failed to load open sessions.');
    }
  }
}

export async function getEvent(eventId) {
  return withApiOrClient(
    () => fetchJson(`/api/stocktake-event-get?eventId=${encodeURIComponent(eventId)}`),
    () => clientGetEvent(eventId),
  );
}

export async function createEvent(locationId, notes = '') {
  return withApiOrClient(
    () => fetchJson('/api/stocktake-event-create', {
      method: 'POST',
      body: JSON.stringify({ locationId, notes, userEmail: currentEmail() }),
    }),
    () => clientCreateEvent(locationId, notes),
  );
}

export async function setEventGate(eventId, enabled) {
  return withApiOrClient(
    () => fetchJson('/api/stocktake-event-set-gate', {
      method: 'POST',
      body: JSON.stringify({ eventId, enabled, userEmail: currentEmail() }),
    }),
    async () => {
      const userEmail = currentEmail();
      const { data: event, error } = await db.from('stocktake_events').select('*').eq('id', eventId).maybeSingle();
      if (error) throw error;
      if (!event) throw new Error('Event not found');
      if (event.status !== 'counting') throw new Error('Gate can only change while event is counting.');
      const { data: updated, error: upErr } = await db
        .from('stocktake_events')
        .update({ counting_enabled: Boolean(enabled) })
        .eq('id', eventId)
        .select('*')
        .single();
      if (upErr) throw upErr;
      await db.from('stocktake_gate_audit').insert([{
        event_id: eventId,
        location_id: event.location_id,
        enabled: Boolean(enabled),
        changed_by_email: userEmail || null,
      }]);
      return { ok: true, event: updated };
    },
  );
}

export async function importCounts(eventId, rows, userEmail = currentEmail()) {
  // Import is complex (SKU resolution); keep API-first. If API is down, tell user clearly.
  try {
    return await fetchJson('/api/stocktake-counts-import', {
      method: 'POST',
      body: JSON.stringify({ eventId, rows, userEmail }),
    });
  } catch (err) {
    if (isApiUnavailable(err)) {
      throw new Error('Excel import needs the Vercel stocktake API. Start counting items in the app, or wait until the API is back.');
    }
    throw err;
  }
}

export async function clearCounts(eventId, userEmail = currentEmail()) {
  return withApiOrClient(
    () => fetchJson('/api/stocktake-counts-clear', {
      method: 'POST',
      body: JSON.stringify({ eventId, userEmail }),
    }),
    () => clientClearCounts(eventId),
  );
}

export async function removeMyCount(eventId, productId, userEmail = currentEmail()) {
  return withApiOrClient(
    () => fetchJson('/api/stocktake-count-remove-mine', {
      method: 'POST',
      body: JSON.stringify({ eventId, productId, userEmail }),
    }),
    () => clientRemoveMyCount(eventId, productId, userEmail),
  );
}

export async function clearMyCounts(eventId, userEmail = currentEmail()) {
  return withApiOrClient(
    () => fetchJson('/api/stocktake-count-clear-mine', {
      method: 'POST',
      body: JSON.stringify({ eventId, userEmail }),
    }),
    () => clientClearMyCounts(eventId, userEmail),
  );
}

export async function cancelEvent(eventId, userEmail = currentEmail(), { force = false } = {}) {
  return withApiOrClient(
    () => fetchJson('/api/stocktake-event-cancel', {
      method: 'POST',
      body: JSON.stringify({ eventId, userEmail, force }),
    }),
    () => clientCancelEvent(eventId, userEmail, { force }),
  );
}

async function clientFetchImportTemplate(locationId) {
  const productIds = await resolveLocationProductIds(locationId);
  const products = [];
  for (let i = 0; i < productIds.length; i += 150) {
    const chunk = productIds.slice(i, i + 150);
    const { data, error } = await db
      .from('products')
      .select('id, sku, name')
      .in('id', chunk);
    if (error) throw error;
    products.push(...(data || []));
  }

  const { data: comboRows, error: comboErr } = await db.from('combos').select('sku');
  if (comboErr) throw comboErr;
  const setSkus = new Set(
    (comboRows || [])
      .map((c) => String(c.sku || '').trim().toLowerCase())
      .filter(Boolean),
  );

  const rows = products
    .filter((p) => {
      const sku = String(p.sku || '').trim().toLowerCase();
      return sku && !setSkus.has(sku);
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      productName: p.name,
      quantity: '',
    }));

  return { ok: true, locationId, rows };
}

export async function fetchImportTemplate(locationId) {
  return withApiOrClient(
    () => fetchJson(`/api/stocktake-import-template?locationId=${encodeURIComponent(locationId)}`),
    () => clientFetchImportTemplate(locationId),
    { fallbackOnServerError: true },
  );
}

export async function addCount(eventId, productId, qty, userEmail = currentEmail()) {
  return withApiOrClient(
    () => fetchJson('/api/stocktake-count-add', {
      method: 'POST',
      body: JSON.stringify({ eventId, productId, qty, userEmail }),
    }),
    () => clientAddCount(eventId, productId, qty, userEmail),
  );
}

export async function fetchMyCounts(eventId, userEmail = currentEmail()) {
  const params = new URLSearchParams({ eventId, userEmail });
  return withApiOrClient(
    () => fetchJson(`/api/stocktake-count-mine?${params}`),
    () => clientFetchMyCounts(eventId, userEmail),
  );
}

export async function scanSet(eventId, comboId, qty, userEmail = currentEmail()) {
  try {
    return await fetchJson('/api/stocktake-set-scan', {
      method: 'POST',
      body: JSON.stringify({ eventId, comboId, qty, userEmail }),
    });
  } catch (err) {
    if (!isApiUnavailable(err)) throw err;
    // Expand set components client-side and add counts
    const { data: comps, error } = await db
      .from('combo_items')
      .select('product_id, quantity')
      .eq('combo_id', comboId);
    if (error) throw error;
    const sets = Number(qty) || 1;
    for (const c of comps || []) {
      const lineQty = sets * Number(c.quantity || 0);
      if (lineQty > 0) await clientAddCount(eventId, c.product_id, lineQty, userEmail);
    }
    const { data: existingScan } = await db
      .from('stocktake_set_scans')
      .select('id, set_qty')
      .eq('event_id', eventId)
      .eq('combo_id', comboId)
      .eq('user_email', userEmail)
      .maybeSingle();
    const nextSetQty = Number(existingScan?.set_qty || 0) + sets;
    await db.from('stocktake_set_scans').upsert([{
      event_id: eventId,
      combo_id: comboId,
      user_email: userEmail,
      set_qty: nextSetQty,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'event_id,combo_id,user_email' });
    return { ok: true, setQty: nextSetQty };
  }
}

export async function createProduct(locationId, payload) {
  try {
    return await fetchJson('/api/stocktake-product-create', {
      method: 'POST',
      body: JSON.stringify({ locationId, ...payload, userEmail: currentEmail() }),
    });
  } catch (err) {
    if (!isApiUnavailable(err)) throw err;
    const { data: product, error } = await db
      .from('products')
      .insert([{
        name: payload.name,
        sku: payload.sku || null,
        price: Number(payload.price || 0),
      }])
      .select('id, name, sku, price')
      .single();
    if (error) throw error;
    await db.from('product_locations').insert([{
      product_id: product.id,
      location_id: locationId,
    }]);
    return { ok: true, product };
  }
}

export async function createSet(locationId, payload) {
  try {
    return await fetchJson('/api/stocktake-set-create', {
      method: 'POST',
      body: JSON.stringify({ locationId, ...payload, userEmail: currentEmail() }),
    });
  } catch (err) {
    if (!isApiUnavailable(err)) throw err;
    throw new Error('Creating sets needs the Vercel stocktake API right now. Try again when the API is back.');
  }
}

export async function submitEvent(eventId, options = {}) {
  const payload = { eventId, userEmail: currentEmail() };
  if (Array.isArray(options.finalTotals) && options.finalTotals.length) {
    payload.finalTotals = options.finalTotals;
  }
  try {
    return await fetchJson('/api/stocktake-event-submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, 120000);
  } catch (err) {
    if (isApiUnavailable(err)) {
      const detail = String(err?.payload?.error || err?.message || '');
      if (/local stocktake api unavailable/i.test(detail)) {
        throw new Error('Local stocktake API failed to start. Restart npm start and ensure FIREBASE_SERVICE_ACCOUNT is set in .env.local.');
      }
      throw new Error('Submit needs the Vercel stocktake API (updates inventory + periods). Counting still works via Supabase — redeploy/fix Vercel, then submit.');
    }
    throw err;
  }
}

export async function listPeriods(locationId) {
  return withApiOrClient(
    () => fetchJson(`/api/stocktake-periods-list?locationId=${encodeURIComponent(locationId)}`),
    () => clientListPeriods(locationId),
  );
}

export async function getPeriodDetail(periodId) {
  try {
    return await fetchJson(`/api/stocktake-period-detail?periodId=${encodeURIComponent(periodId)}`);
  } catch (err) {
    if (!isApiUnavailable(err)) throw err;
    const { data, error } = await db.from('stock_periods').select('*').eq('id', periodId).maybeSingle();
    if (error) throw error;
    return { ok: true, period: data, rows: [] };
  }
}

export async function getPeriodVariance(periodId) {
  try {
    return await fetchJson(`/api/stocktake-period-variance?periodId=${encodeURIComponent(periodId)}`);
  } catch (err) {
    if (isApiUnavailable(err)) {
      throw new Error('Variance report needs the Vercel stocktake API. Try again when the deployment is responding.');
    }
    throw err;
  }
}
