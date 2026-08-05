import {
  assertLoginAllowed,
  isLoginAccessAdmin,
  listLoginAccessRecords,
  setLoginAccessEnabled,
} from '../lib/loginAccess.js';

async function requireAdmin(req) {
  const { requireBearerUser } = await import('../lib/verifyBearerUser.js');
  const actor = await requireBearerUser(req);
  if (!isLoginAccessAdmin(actor.email)) {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
  return actor;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      await requireAdmin(req);
      const users = await listLoginAccessRecords();
      res.status(200).json({ ok: true, users });
      return;
    }

    if (req.method === 'POST') {
      const actor = await requireAdmin(req);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const uid = String(body.uid || body.id || '').trim();
      if (!uid) {
        res.status(400).json({ ok: false, error: 'uid is required' });
        return;
      }
      const loginEnabled = body.login_enabled ?? body.loginEnabled;
      if (typeof loginEnabled !== 'boolean') {
        res.status(400).json({ ok: false, error: 'login_enabled boolean is required' });
        return;
      }
      const user = await setLoginAccessEnabled({
        uid,
        loginEnabled,
        actorEmail: actor.email,
      });
      res.status(200).json({ ok: true, user });
      return;
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (err) {
    const status = err?.status || 500;
    res.status(status).json({
      ok: false,
      error: err?.message || 'Login access request failed',
      code: err?.code || null,
    });
  }
}

export { assertLoginAllowed };
