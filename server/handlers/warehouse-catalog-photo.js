/**
 * Long-running warehouse-catalog AI product photo attach (Vercel admin dispatcher — up to 300s).
 */
import { runCatalogAssemblyPhotoAttach } from '../lib/warehouseCatalogPhotoAttach.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { verifyBearerUser } = await import('../lib/verifyBearerUser.js');
    const user = await verifyBearerUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await runCatalogAssemblyPhotoAttach(body, user);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({
      ok: false,
      error: err?.message || 'Catalog photo attach failed',
    });
  }
}
