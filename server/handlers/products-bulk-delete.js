import { createClient } from '@supabase/supabase-js';
import { canDeleteProducts } from '../../src/accessControl.js';

function assertServiceRoleKey(serviceKey) {
  try {
    const parts = String(serviceKey || '').split('.');
    if (parts.length < 2) return;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    if (payload?.role && payload.role !== 'service_role') {
      const error = new Error('SUPABASE_SERVICE_ROLE is not a service role key');
      error.status = 500;
      error.details = { role: payload.role };
      throw error;
    }
  } catch (err) {
    if (err?.status) throw err;
  }
}

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
  assertServiceRoleKey(serviceKey);
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

function getSupabaseAnonClient() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL (or REACT_APP_SUPABASE_URL)');
    if (!anonKey) missing.push('SUPABASE_ANON_KEY (or REACT_APP_SUPABASE_ANON_KEY)');
    const error = new Error('Supabase anon environment variables missing');
    error.status = 500;
    error.details = { missing };
    throw error;
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
}

async function getRequestUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  const supabase = getSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    const authError = new Error(error.message || 'Invalid session');
    authError.status = 401;
    throw authError;
  }
  return data?.user || null;
}

async function deleteByIds(supabase, table, column, ids) {
  if (!ids.length) return;
  const { error } = await supabase.from(table).delete().in(column, ids);
  if (error) throw error;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const actor = await getRequestUser(req);
    if (!actor) {
      res.status(401).json({ ok: false, error: 'Authentication required' });
      return;
    }
    if (!canDeleteProducts(actor)) {
      res.status(403).json({ ok: false, error: 'You are not allowed to delete products.' });
      return;
    }

    const rawIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
    const productIds = Array.from(new Set(rawIds.map(id => String(id)).filter(Boolean)));
    if (productIds.length === 0) {
      res.status(400).json({ ok: false, error: 'No product IDs provided' });
      return;
    }

    const supabase = getSupabaseServiceClient();

    await deleteByIds(supabase, 'product_images', 'product_id', productIds);
    await deleteByIds(supabase, 'product_locations', 'product_id', productIds);
    await deleteByIds(supabase, 'inventory', 'product_id', productIds);
    await deleteByIds(supabase, 'stock_transfer_entries', 'product_id', productIds);
    await deleteByIds(supabase, 'opening_stock_entries', 'product_id', productIds);
    await deleteByIds(supabase, 'closing_stock_entries', 'product_id', productIds);
    await deleteByIds(supabase, 'combo_items', 'product_id', productIds);

    const { data: deletedRows, error: deleteErr } = await supabase
      .from('products')
      .delete()
      .in('id', productIds)
      .select('id');
    if (deleteErr) {
      res.status(500).json({
        ok: false,
        error: deleteErr.message || String(deleteErr),
        code: deleteErr.code || null,
        details: deleteErr.details || null,
      });
      return;
    }

    const deletedIds = (deletedRows || []).map(row => row.id);
    res.status(200).json({ ok: true, deletedIds, deletedCount: deletedIds.length });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({
      ok: false,
      error: err?.message || 'Unexpected error',
      details: err?.details || null,
    });
  }
}
