import db from '../dataClient';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { canManageCatalog, getCurrentUser } from '../accessControl';
import {
  createMaterialUom,
  listMaterialUoms,
  materialUomSelectOptions,
} from '../utils/materialUomMutations';

const CANONICAL = (process.env.REACT_APP_CANONICAL_ORIGIN || 'https://www.infinity-home.online').replace(/\/+$/, '');

async function staffAuthHeaders() {
  const token = await firebaseGetAccessToken(true);
  if (!token) throw new Error('Sign in required');
  return withApiHeaders({
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  });
}

async function parseResponse(resp) {
  const raw = await resp.text().catch(() => '');
  if (!raw) return { payload: {}, raw: '' };
  try {
    return { payload: JSON.parse(raw), raw };
  } catch {
    return { payload: {}, raw };
  }
}

async function listFromFirestore() {
  const rows = await listMaterialUoms(db);
  return { ok: true, uoms: rows, options: materialUomSelectOptions(rows) };
}

export async function fetchMaterialUoms() {
  let headers;
  try {
    headers = await staffAuthHeaders();
  } catch {
    return listFromFirestore();
  }
  const body = JSON.stringify({ op: 'list-material-uoms' });
  const urls = [
    apiUrl('/api/admin?adminAction=carpentry-catalog'),
    `${CANONICAL}/api/admin?adminAction=carpentry-catalog`,
  ].filter(Boolean);
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body,
      });
      const { payload } = await parseResponse(resp);
      if (resp.ok && payload?.ok) return payload;
    } catch {
      /* fallback */
    }
  }
  return listFromFirestore();
}

async function saveDirect(body) {
  if (!canManageCatalog(getCurrentUser())) {
    throw new Error('Catalog admin access required');
  }
  const op = String(body?.op || '').trim().toLowerCase();
  if (op === 'save-material-uom') {
    const row = await createMaterialUom(db, body);
    return { ok: true, uom: row };
  }
  throw new Error(`Unknown op: ${op}`);
}

export async function postMaterialUom(body) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await staffAuthHeaders()),
  };
  const urls = [
    apiUrl('/api/admin?adminAction=carpentry-catalog'),
    `${CANONICAL}/api/admin?adminAction=carpentry-catalog`,
  ].filter(Boolean);
  let lastErr = 'Save failed';
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const { payload, raw } = await parseResponse(resp);
      if (resp.ok && payload?.ok !== false) return payload;
      lastErr = payload?.error || raw || lastErr;
      const msg = String(lastErr).toLowerCase();
      if (!msg.includes('unknown adminaction') && resp.status !== 404) {
        throw new Error(lastErr);
      }
    } catch (err) {
      lastErr = err?.message || lastErr;
    }
  }
  return saveDirect(body);
}

export async function createMaterialUomViaApi({ code, label }) {
  return postMaterialUom({ op: 'save-material-uom', code, label });
}
