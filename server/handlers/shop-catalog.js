import { fetchShopCatalog, upsertShopListing, upsertShopSettings, LUSAKA_LOCATION_ID } from '../lib/firestoreShop.js';
import { requireBearerUser } from '../lib/verifyBearerUser.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const action = String(req.query?.action || req.body?.action || 'catalog').trim().toLowerCase();

    if (req.method === 'GET') {
      const publishedOnly = action !== 'admin-catalog';
      if (!publishedOnly) {
        await requireBearerUser(req);
      }
      const catalog = await fetchShopCatalog({
        locationId: LUSAKA_LOCATION_ID,
        publishedOnly,
      });
      res.status(200).json({ ok: true, ...catalog });
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    if (action === 'save-listing') {
      await requireBearerUser(req);
      const listing = await upsertShopListing(req.body?.listing || req.body || {});
      res.status(200).json({ ok: true, listing });
      return;
    }

    if (action === 'save-settings') {
      await requireBearerUser(req);
      const settings = await upsertShopSettings(req.body?.settings || req.body || {});
      res.status(200).json({ ok: true, settings });
      return;
    }

    const publishedOnly = action !== 'admin-catalog';
    const catalog = await fetchShopCatalog({
      locationId: LUSAKA_LOCATION_ID,
      publishedOnly,
    });
    res.status(200).json({ ok: true, ...catalog });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
