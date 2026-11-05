import db from '../dataClient';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { buildUpholsteryCatalogPayload } from '../utils/upholsteryCatalogView';
import { listCarpentryCatalogProducts } from '../utils/carpentryCatalogView';
import {
  fetchSharedProductionPortalSnapshot,
  invalidateProductionPortalSnapshotCache,
} from '../utils/loadProductionPortalCatalogInputs';
import { canManageCatalog, getCurrentUser } from '../accessControl';
import {
  saveUpholsteryProductSelection,
  saveUpholsteryRawAssemblyLink,
  saveUpholsteryProductMaterials,
} from '../utils/upholsteryCatalogMutations';

export { getCachedUpholsteryCatalog } from '../utils/productionPortalCatalogCache';

const CANONICAL = (process.env.REACT_APP_CANONICAL_ORIGIN || 'https://www.infinity-home.online').replace(/\/+$/, '');

function uniqueUrls(urls) {
  return [...new Set((urls || []).filter(Boolean))];
}

async function staffAuthHeaders() {
  const token = await firebaseGetAccessToken(false);
  if (!token) throw new Error('Sign in required to load Upholstery catalog');
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

export async function fetchUpholsteryCatalog({ forceFresh = false } = {}) {
  const snap = await fetchSharedProductionPortalSnapshot({ forceFresh });
  return {
    ...buildUpholsteryCatalogPayload(snap.assemblies, snap.setItems, snap.portalInputs),
    carpentryProducts: listCarpentryCatalogProducts(snap.assemblies),
    locations: snap.portalInputs?.locations || [],
  };
}

function shouldFallbackFromAdminError(message, status) {
  const msg = String(message || '').toLowerCase();
  if (status === 404) return true;
  return (
    msg.includes('unknown adminaction')
    || msg.includes('unknown op')
    || msg.includes('network error')
    || msg.includes('failed to fetch')
  );
}

async function postUpholsteryCatalogDirect(body) {
  const user = getCurrentUser();
  if (!canManageCatalog(user)) {
    throw new Error('Catalog admin access required');
  }
  const op = String(body?.op || '').trim().toLowerCase();
  if (op === 'save-product') {
    await saveUpholsteryProductSelection(
      db,
      body.assembly_id || body.assemblyId,
      body.selected !== false,
    );
    return { ok: true };
  }
  if (op === 'save-raw-link') {
    await saveUpholsteryRawAssemblyLink(
      db,
      body.assembly_id || body.finished_assembly_id,
      body.raw_assembly_id,
    );
    return { ok: true };
  }
  if (op === 'save-materials') {
    await saveUpholsteryProductMaterials(
      db,
      body.assembly_id || body.assemblyId,
      body.materials,
    );
    return { ok: true };
  }
  throw new Error(`Unknown op: ${op || '(missing)'}`);
}

export async function postUpholsteryCatalog(body) {
  invalidateProductionPortalSnapshotCache();

  try {
    const user = getCurrentUser();
    if (canManageCatalog(user)) {
      return await postUpholsteryCatalogDirect(body);
    }
  } catch {
    /* fallback to serverless endpoint */
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(await staffAuthHeaders()),
  };
  const urls = uniqueUrls([
    apiUrl('/api/admin?adminAction=upholstery-catalog'),
    `${CANONICAL}/api/admin?adminAction=upholstery-catalog`,
  ]);

  let lastErr = '';
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const { payload, raw } = await parseResponse(resp);
      if (resp.ok && payload?.ok !== false) return payload;
      lastErr = payload?.error || raw || `upholstery-catalog failed (${resp.status})`;
      if (!shouldFallbackFromAdminError(lastErr, resp.status)) {
        throw new Error(lastErr);
      }
    } catch (netErr) {
      lastErr = netErr?.message || 'Network error';
      if (!shouldFallbackFromAdminError(lastErr, 0)) throw netErr;
    }
  }

  try {
    return await postUpholsteryCatalogDirect(body);
  } catch (directErr) {
    throw new Error(directErr?.message || lastErr || 'upholstery-catalog failed');
  }
}
