import { canDeleteProducts } from '../../src/accessControl.js';
import { getDataClient } from '../lib/getDataClient.js';
import { verifyBearerUser } from '../lib/verifyBearerUser.js';

async function getRequestUser(req) {
  try {
    return await verifyBearerUser(req);
  } catch (err) {
    const authError = new Error(err?.message || 'Invalid session');
    authError.status = err?.status || 401;
    throw authError;
  }
}

async function deleteByIds(db, table, column, ids) {
  if (!ids.length) return;
  const { error } = await db.from(table).delete().in(column, ids);
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

    const db = getDataClient();

    await deleteByIds(db, 'product_images', 'product_id', productIds);
    await deleteByIds(db, 'product_locations', 'product_id', productIds);
    await deleteByIds(db, 'inventory', 'product_id', productIds);
    await deleteByIds(db, 'stock_transfer_entries', 'product_id', productIds);
    await deleteByIds(db, 'opening_stock_entries', 'product_id', productIds);
    await deleteByIds(db, 'closing_stock_entries', 'product_id', productIds);
    await deleteByIds(db, 'combo_items', 'product_id', productIds);

    const { data: deletedRows, error: deleteErr } = await db
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
