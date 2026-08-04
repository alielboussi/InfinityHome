import { fetchPosCatalog, fetchPosLocations } from '../lib/firestoreProductLocations.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const action = String(req.query?.action || req.body?.action || '').trim().toLowerCase();

    if (req.method === 'GET') {
      if (action !== 'locations') {
        res.status(400).json({ ok: false, error: 'Unknown GET action' });
        return;
      }

      const rows = await fetchPosLocations();
      res.status(200).json({ ok: true, rows });
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

    const rows = await fetchPosCatalog({ locationId, requestedProductIds });
    res.status(200).json({ ok: true, rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
