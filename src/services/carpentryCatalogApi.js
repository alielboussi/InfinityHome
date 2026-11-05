import db from '../dataClient';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { buildCarpentryCatalogPayload } from '../utils/carpentryCatalogView';
import { loadProductionPortalCatalogInputs } from '../utils/loadProductionPortalCatalogInputs';
import { canManageCatalog, getCurrentUser } from '../accessControl';
import {
  saveCarpentryProductMaterials,
  saveCarpentryProductSelection,
  listCarpentryFloorRuns,
} from '../utils/carpentryCatalogMutations';
import { receiveStoreroomMaterial, createStoreroomMaterial, setStoreroomMaterialStockQty } from '../utils/storeroomStockMutations';

const CANONICAL = (process.env.REACT_APP_CANONICAL_ORIGIN || 'https://www.infinity-home.online').replace(/\/+$/, '');

async function staffAuthHeaders() {
  const token = await firebaseGetAccessToken(true);
  if (!token) throw new Error('Sign in required to load Carpentry catalog');
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

async function fetchCarpentryCatalogFromFirestore() {
  const [{ data, error }, { data: setItems, error: setItemsErr }] = await Promise.all([
    db.from('warehouse_assemblies').select('id, name, family_sku, item_kind, metadata'),
    db.from('warehouse_set_items').select('set_assembly_id, component_assembly_id, quantity, location_id'),
  ]);
  if (error) throw new Error(error.message || 'Failed to load warehouse catalog');
  if (setItemsErr) throw new Error(setItemsErr.message || 'Failed to load warehouse set lines');
  const portalInputs = await loadProductionPortalCatalogInputs(db);
  return buildCarpentryCatalogPayload(data || [], setItems || [], portalInputs);
}

export async function fetchCarpentryCatalog() {
  let headers;
  try {
    headers = await staffAuthHeaders();
  } catch (authErr) {
    return fetchCarpentryCatalogFromFirestore();
  }

  const body = JSON.stringify({ op: 'list' });
  const urls = [
    apiUrl('/api/admin?adminAction=carpentry-catalog'),
    `${CANONICAL}/api/admin?adminAction=carpentry-catalog`,
  ].filter(Boolean);

  let lastErr = '';
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body,
      });
      const { payload, raw } = await parseResponse(resp);
      if (resp.ok && payload?.ok) return payload;
      lastErr = payload?.error
        || (raw && !raw.startsWith('{') ? `Server error (${resp.status})` : '')
        || `carpentry-catalog failed (${resp.status})`;
    } catch (netErr) {
      lastErr = netErr?.message || 'Network error';
    }
  }

  try {
    return await fetchCarpentryCatalogFromFirestore();
  } catch (fallbackErr) {
    throw new Error(lastErr || fallbackErr?.message || 'carpentry-catalog failed');
  }
}

function shouldFallbackFromAdminError(message, status) {
  const msg = String(message || '').toLowerCase();
  if (status === 404) return true;
  return msg.includes('unknown adminaction') || msg.includes('network error') || msg.includes('failed to fetch');
}

async function postCarpentryCatalogDirect(body) {
  const user = getCurrentUser();
  if (!canManageCatalog(user)) {
    throw new Error('Catalog admin access required');
  }
  const op = String(body?.op || '').trim().toLowerCase();
  if (op === 'save-product') {
    await saveCarpentryProductSelection(
      db,
      body.assembly_id || body.assemblyId,
      body.selected !== false,
    );
    return { ok: true };
  }
  if (op === 'save-materials') {
    await saveCarpentryProductMaterials(
      db,
      body.assembly_id || body.assemblyId,
      body.materials,
    );
    return { ok: true };
  }
  if (op === 'list-floor-runs') {
    const result = await listCarpentryFloorRuns(db, { limit: body.limit });
    return { ok: true, ...result };
  }
  if (op === 'receive-storeroom') {
    const result = await receiveStoreroomMaterial(db, body);
    return { ok: true, ...result };
  }
  if (op === 'create-storeroom-material') {
    const result = await createStoreroomMaterial(db, body);
    return { ok: true, ...result };
  }
  if (op === 'set-storeroom-stock') {
    const result = await setStoreroomMaterialStockQty(db, body);
    return { ok: true, ...result };
  }
  throw new Error(`Unknown op: ${op || '(missing)'}`);
}

export async function postCarpentryCatalog(body) {
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
      lastErr = payload?.error || raw || `Save failed (${resp.status})`;
      if (!shouldFallbackFromAdminError(lastErr, resp.status)) {
        throw new Error(lastErr);
      }
    } catch (netErr) {
      lastErr = netErr?.message || 'Network error';
      if (!shouldFallbackFromAdminError(lastErr, 0)) throw netErr;
    }
  }

  try {
    return await postCarpentryCatalogDirect(body);
  } catch (directErr) {
    throw new Error(directErr?.message || lastErr || 'carpentry-catalog failed');
  }
}

export async function fetchCarpentryFloorRuns() {
  return postCarpentryCatalog({ op: 'list-floor-runs' });
}

export async function postStoreroomCreate(body) {
  return postCarpentryCatalog({ op: 'create-storeroom-material', ...body });
}

export async function postStoreroomSetStock(body) {
  return postCarpentryCatalog({ op: 'set-storeroom-stock', ...body });
}

/** @deprecated Prefer postStoreroomCreate */
export async function postStoreroomReceive(body) {
  return postCarpentryCatalog({ op: 'receive-storeroom', ...body });
}
