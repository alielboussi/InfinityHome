import {
  assertLoginAllowed,
  createLoginAccessUser,
  deleteLoginAccess,
  isLoginAccessAdmin,
  listLoginAccessRecords,
  patchProductionAppAccess,
  setLoginAccessDisplayName,
  setLoginAccessEnabled,
  updateMobileAccessGrant,
} from '../lib/loginAccess.js';

function parseLoginAccessBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    body = {};
  }
  return body;
}

function resolveLoginAccessAction(req, body) {
  return String(
    req.query?.loginAccessAction
    || req.query?.login_access_action
    || body.login_access_action
    || body.loginAccessAction
    || body.action
    || '',
  )
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return undefined;
}

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
      const body = parseLoginAccessBody(req);
      const action = resolveLoginAccessAction(req, body);

      if (action === 'create-user') {
        const user = await createLoginAccessUser({
          email: body.email,
          password: body.password,
          displayName: body.display_name ?? body.displayName,
          actorEmail: actor.email,
        });
        res.status(200).json({ ok: true, user });
        return;
      }

      const uid = String(body.uid || body.id || '').trim();
      if (!uid) {
        res.status(400).json({ ok: false, error: 'uid is required' });
        return;
      }

      if (action === 'delete-access') {
        const result = await deleteLoginAccess({
          uid,
          actorEmail: actor.email,
        });
        res.status(200).json({ ok: true, ...result });
        return;
      }

      if (action === 'set-display-name') {
        const user = await setLoginAccessDisplayName({
          uid,
          displayName: body.display_name ?? body.displayName,
          actorEmail: actor.email,
        });
        res.status(200).json({ ok: true, user });
        return;
      }

      if (action === 'set-production-app-access') {
        const flag = body.warehouse_production_app ?? body.warehouseProductionApp;
        const kitweFlag = body.kitwe_send_delivery ?? body.kitweSendDelivery;
        const user = await patchProductionAppAccess({
          uid,
          warehouseProductionApp: flag,
          kitweSendDelivery: kitweFlag,
          mobileDisplayName: body.mobile_display_name ?? body.mobileDisplayName,
          actorEmail: actor.email,
        });
        res.status(200).json({ ok: true, user });
        return;
      }

      const loginEnabled = coerceBoolean(body.login_enabled ?? body.loginEnabled);
      const mobileAccess = body.mobile_access ?? body.mobileAccess;
      const mobileDisplayName = body.mobile_display_name ?? body.mobileDisplayName;
      const portalDisplayName = body.display_name ?? body.displayName;
      const updatingMobile = mobileAccess && typeof mobileAccess === 'object';
      const updatingMobileDisplayName = mobileDisplayName !== undefined;
      const updatingPortalDisplayName = portalDisplayName !== undefined;
      const updatingCatalog = updatingMobile || updatingMobileDisplayName;

      let user = null;

      if (typeof loginEnabled === 'boolean') {
        user = await setLoginAccessEnabled({
          uid,
          loginEnabled,
          actorEmail: actor.email,
        });
      }

      if (updatingCatalog) {
        user = await updateMobileAccessGrant({
          uid,
          mobileAccess: updatingMobile ? mobileAccess : undefined,
          mobileDisplayName: updatingMobileDisplayName ? mobileDisplayName : undefined,
          portalDisplayName: updatingPortalDisplayName ? portalDisplayName : undefined,
          actorEmail: actor.email,
        });
      } else if (updatingPortalDisplayName) {
        user = await setLoginAccessDisplayName({
          uid,
          displayName: portalDisplayName,
          actorEmail: actor.email,
        });
      }

      if (user) {
        res.status(200).json({ ok: true, user });
        return;
      }

      res.status(400).json({
        ok: false,
        error: updatingCatalog
          ? 'Failed to save warehouse catalog access (deploy latest API).'
          : 'login_enabled, mobile_access, or display_name is required',
      });
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
