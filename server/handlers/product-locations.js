import {
  getProductLocations,
  handleProductLocationsPost,
} from '../lib/firestoreProductLocations.js';

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
      const data = await getProductLocations(productId);
      res.status(200).json({ ok: true, rows: data.map((row) => ({ location_id: row.location_id })) });
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
    const result = await handleProductLocationsPost({
      ...(req.body || {}),
      action,
      a: action,
    });
    const status = result.status || (result.ok ? 200 : 500);
    res.status(status).json(result);
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({ ok: false, error: err.message || 'Unexpected error', details: err.details || null });
  }
}
