import { createClient } from '@supabase/supabase-js';

function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceKey) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL (or REACT_APP_SUPABASE_URL)');
    if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE');
    const error = new Error('Supabase service environment variables missing');
    error.status = 500;
    error.details = { missing };
    throw error;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

const coerceNumeric = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
};

const needsManualComboLocationId = (error) => {
  if (!error?.message) return false;
  return /null value in column\s+"id"/i.test(error.message);
};

async function fetchNextComboLocationId(supabase) {
  const { data, error } = await supabase
    .from('combo_locations')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw error;
  const latest = Array.isArray(data) && data.length ? Number(data[0].id) : 0;
  return Number.isFinite(latest) ? latest + 1 : 1;
}

async function insertComboRows(supabase, rows) {
  let { error } = await supabase.from('combo_locations').insert(rows);
  if (needsManualComboLocationId(error)) {
    let nextId = await fetchNextComboLocationId(supabase);
    const rowsWithIds = rows.map((row) => ({ ...row, id: nextId++ }));
    ({ error } = await supabase.from('combo_locations').insert(rowsWithIds));
  }
  if (error) throw error;
}

function resolveAction(req) {
  return String(req.query?.action || req.query?.a || req.body?.action || req.body?.a || '')
    .trim()
    .toLowerCase();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const productId = req.query?.product_id;
      if (!productId) {
        res.status(400).json({ ok: false, error: 'Missing product_id' });
        return;
      }
      const supabase = getSupabaseServiceClient();
      const { data, error } = await supabase
        .from('product_locations')
        .select('location_id')
        .eq('product_id', productId);
      if (error) {
        res.status(500).json({ ok: false, error: error.message || String(error) });
        return;
      }
      res.status(200).json({ ok: true, rows: data || [] });
      return;
    } catch (err) {
      const status = err?.status || 500;
      res.status(status).json({ ok: false, error: err.message || 'Unexpected error', details: err.details || null });
      return;
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const action = resolveAction(req);

    if (action === 'combo') {
      const { rows, replaceComboId, deleteComboId } = req.body || {};
      const cleanRows = (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.combo_id && row?.location_id)
        .map((row) => ({
          combo_id: coerceNumeric(row.combo_id),
          location_id: row.location_id,
        }));

      const supabase = getSupabaseServiceClient();
      const targetComboId = replaceComboId || deleteComboId || (cleanRows[0]?.combo_id ?? null);

      if (replaceComboId || deleteComboId) {
        if (!targetComboId && targetComboId !== 0) {
          res.status(400).json({ ok: false, error: 'Missing combo id for replace/delete' });
          return;
        }
        const { error: delErr } = await supabase
          .from('combo_locations')
          .delete()
          .eq('combo_id', coerceNumeric(targetComboId));
        if (delErr) {
          res.status(500).json({ ok: false, error: delErr.message || String(delErr) });
          return;
        }
      }

      if (!deleteComboId && cleanRows.length) {
        await insertComboRows(supabase, cleanRows);
      }

      res.status(200).json({ ok: true, count: cleanRows.length });
      return;
    }

    const { rows, replaceProductId } = req.body || {};
    if (!Array.isArray(rows)) {
      res.status(400).json({ ok: false, error: 'Missing rows' });
      return;
    }

    const cleanRows = rows
      .filter(row => row?.product_id && row?.location_id)
      .map(row => ({ product_id: row.product_id, location_id: row.location_id }));

    if (!cleanRows.length && !replaceProductId) {
      res.status(400).json({ ok: false, error: 'No valid rows to insert' });
      return;
    }

    const supabase = getSupabaseServiceClient();

    if (replaceProductId) {
      const { error: delErr } = await supabase
        .from('product_locations')
        .delete()
        .eq('product_id', replaceProductId);
      if (delErr) {
        res.status(500).json({ ok: false, error: delErr.message || String(delErr) });
        return;
      }
    }

    if (cleanRows.length > 0) {
      const { error } = await supabase
        .from('product_locations')
        .upsert(cleanRows, { onConflict: 'product_id,location_id' });
      if (error) {
        res.status(500).json({ ok: false, error: error.message || String(error) });
        return;
      }
    }

    res.status(200).json({ ok: true, count: cleanRows.length });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({ ok: false, error: err.message || 'Unexpected error', details: err.details || null });
  }
}
