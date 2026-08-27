import { runFullFirebaseBackup } from '../lib/fullFirebaseBackup.js';

function assertCronAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return true;
  const auth = String(req.headers?.authorization || req.headers?.Authorization || '');
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer === secret;
}

function isTruthyForce(value) {
  if (value === true || value === 1) return true;
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const force = isTruthyForce(req.query?.force) || isTruthyForce(body.force);

  if (!force && !assertCronAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized cron request' });
    return;
  }

  try {
    const result = await runFullFirebaseBackup();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(result);
  } catch (err) {
    res.status(err?.status || 500).json({
      ok: false,
      error: err?.message || 'Full backup failed',
      stage: err?.stage || 'backup',
    });
  }
}
