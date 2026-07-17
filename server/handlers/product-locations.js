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
  return /null value in column\s+"id"/i.test(error.message)
    || /duplicate key value violates unique constraint.*combo_locations_pkey/i.test(error.message);
};

const comboLocationKey = (row) => `${coerceNumeric(row.combo_id)}::${row.location_id}`;

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

function dedupeComboRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = comboLocationKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

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
  if (!rows.length) return;
  for (const chunk of chunkArray(rows, 500)) {
    let { error } = await supabase.from('combo_locations').insert(chunk);
    if (needsManualComboLocationId(error)) {
      let nextId = await fetchNextComboLocationId(supabase);
      const rowsWithIds = chunk.map((row) => ({ ...row, id: nextId++ }));
      ({ error } = await supabase.from('combo_locations').insert(rowsWithIds));
    }
    if (error) throw error;
  }
}

/** Bulk-add semantics: upsert pairs idempotently (avoids unique_combo_location on large batches). */
async function upsertComboRows(supabase, rows) {
  const uniqueRows = dedupeComboRows(rows);
  if (!uniqueRows.length) return 0;

  for (const chunk of chunkArray(uniqueRows, 500)) {
    let { error } = await supabase
      .from('combo_locations')
      .upsert(chunk, { onConflict: 'combo_id,location_id' });
    if (needsManualComboLocationId(error)) {
      let nextId = await fetchNextComboLocationId(supabase);
      const rowsWithIds = chunk.map((row) => ({ ...row, id: nextId++ }));
      ({ error } = await supabase
        .from('combo_locations')
        .upsert(rowsWithIds, { onConflict: 'combo_id,location_id' }));
    }
    if (error) throw error;
  }
  return uniqueRows.length;
}

/** Delete many (entity_id, location_id) pairs efficiently, grouped by location. */
async function deletePairsByLocation(supabase, table, idColumn, rows) {
  const byLocation = new Map();
  for (const row of rows) {
    const locId = row.location_id;
    const entityId = row[idColumn];
    if (!locId || entityId == null) continue;
    if (!byLocation.has(locId)) byLocation.set(locId, []);
    byLocation.get(locId).push(entityId);
  }

  let deleted = 0;
  for (const [locId, ids] of byLocation.entries()) {
    const uniqueIds = [...new Set(ids)];
    for (const idChunk of chunkArray(uniqueIds, 200)) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('location_id', locId)
        .in(idColumn, idChunk);
      if (error) throw error;
      deleted += idChunk.length;
    }
  }
  return deleted;
}

async function upsertProductRows(supabase, rows) {
  for (const chunk of chunkArray(rows, 500)) {
    const { error } = await supabase
      .from('product_locations')
      .upsert(chunk, { onConflict: 'product_id,location_id' });
    if (error) throw error;
  }
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
      const { rows, replaceComboId, deleteComboId, upsert, remove } = req.body || {};
      const cleanRows = (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.combo_id && row?.location_id)
        .map((row) => ({
          combo_id: coerceNumeric(row.combo_id),
          location_id: row.location_id,
        }));

      const supabase = getSupabaseServiceClient();
      const targetComboId = replaceComboId || deleteComboId || (cleanRows[0]?.combo_id ?? null);

      if (remove && cleanRows.length) {
        try {
          const count = await deletePairsByLocation(supabase, 'combo_locations', 'combo_id', cleanRows);
          res.status(200).json({ ok: true, count });
          return;
        } catch (error) {
          res.status(500).json({ ok: false, error: error.message || String(error) });
          return;
        }
      }

      if (upsert && cleanRows.length) {
        try {
          const count = await upsertComboRows(supabase, cleanRows);
          res.status(200).json({ ok: true, count });
          return;
        } catch (error) {
          res.status(500).json({ ok: false, error: error.message || String(error) });
          return;
        }
      }

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

    const { rows, replaceProductId, remove } = req.body || {};
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

    if (remove) {
      if (!cleanRows.length) {
        res.status(400).json({ ok: false, error: 'No valid rows to remove' });
        return;
      }
      try {
        const count = await deletePairsByLocation(supabase, 'product_locations', 'product_id', cleanRows);
        res.status(200).json({ ok: true, count });
        return;
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message || String(error) });
        return;
      }
    }

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
      try {
        await upsertProductRows(supabase, cleanRows);
      } catch (error) {
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
