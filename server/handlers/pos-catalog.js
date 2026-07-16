import { createClient } from '@supabase/supabase-js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase service env not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE)');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } });
}

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

async function selectProductsByIds(supabase, productIds) {
  const ids = Array.from(new Set((productIds || []).map((value) => String(value || '').trim()).filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)));
  if (!ids.length) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, price, promotional_price, currency')
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  const chunks = chunkArray(ids, 200);
  let rows = [];
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, price, promotional_price, currency')
      .in('id', chunk);
    if (error) throw error;
    rows = rows.concat(data || []);
  }

  return rows;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const supabase = getSupabaseServiceClient();
    const action = String(req.query?.action || req.body?.action || '').trim().toLowerCase();

    if (req.method === 'GET') {
      if (action !== 'locations') {
        res.status(400).json({ ok: false, error: 'Unknown GET action' });
        return;
      }

      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) {
        res.status(500).json({ ok: false, error: error.message || String(error) });
        return;
      }

      res.status(200).json({ ok: true, rows: data || [] });
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    const body = req.body || {};
    const locationId = body.locationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(body.locationId))
      ? String(body.locationId)
      : null;
    const requestedProductIds = Array.isArray(body.productIds) ? body.productIds : [];

    const [combosRes, comboLocationsRes, comboItemsRes, productLocationsRes] = await Promise.all([
      supabase
        .from('combos')
        .select('id, combo_name, sku, standard_price, promotional_price, combo_price, currency'),
      supabase
        .from('combo_locations')
        .select('combo_id, location_id'),
      supabase
        .from('combo_items')
        .select('combo_id, product_id, quantity'),
      locationId
        ? supabase
            .from('product_locations')
            .select('product_id, location_id')
            .eq('location_id', locationId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (combosRes.error) throw combosRes.error;
    if (comboLocationsRes.error) throw comboLocationsRes.error;
    if (comboItemsRes.error) throw comboItemsRes.error;
    if (productLocationsRes.error) throw productLocationsRes.error;

    const derivedProductIds = [
      ...requestedProductIds,
      ...(productLocationsRes.data || []).map((row) => row.product_id),
      ...(comboItemsRes.data || []).map((row) => row.product_id),
    ];

    const products = await selectProductsByIds(supabase, derivedProductIds);

    res.status(200).json({
      ok: true,
      rows: {
        combos: combosRes.data || [],
        combo_locations: comboLocationsRes.data || [],
        combo_items: comboItemsRes.data || [],
        product_locations: productLocationsRes.data || [],
        products,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
