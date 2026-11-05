import db from '../dataClient';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { buildUpholsteryCatalogPayload } from '../utils/upholsteryCatalogView';
import { loadProductionPortalCatalogInputs } from '../utils/loadProductionPortalCatalogInputs';
import { canManageCatalog, getCurrentUser } from '../accessControl';
import {
  saveUpholsteryProductSelection,
  saveUpholsteryRawAssemblyLink,
  saveUpholsteryProductMaterials,
} from '../utils/upholsteryCatalogMutations';

const CANONICAL = (process.env.REACT_APP_CANONICAL_ORIGIN || 'https://www.infinity-home.online').replace(/\/+$/, '');

async function staffAuthHeaders() {
  const token = await firebaseGetAccessToken(true);
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

async function fetchUpholsteryCatalogFromFirestore() {
  const [{ data, error }, { data: setItems, error: setItemsErr }] = await Promise.all([
    db.from('warehouse_assemblies').select('id, name, family_sku, item_kind, metadata'),
    db.from('warehouse_set_items').select('set_assembly_id, component_assembly_id, quantity, location_id'),
  ]);
  if (error) throw new Error(error.message || 'Failed to load warehouse catalog');
  if (setItemsErr) throw new Error(setItemsErr.message || 'Failed to load warehouse set lines');
  const portalInputs = await loadProductionPortalCatalogInputs(db);
  return buildUpholsteryCatalogPayload(data || [], setItems || [], portalInputs);
}

export async function fetchUpholsteryCatalog() {
  let headers;
  try {
    headers = await staffAuthHeaders();
  } catch (authErr) {
    return fetchUpholsteryCatalogFromFirestore();
  }

  const body = JSON.stringify({ op: 'list' });
  const urls = [
    apiUrl('/api/admin?adminAction=upholstery-catalog'),
    `${CANONICAL}/api/admin?adminAction=upholstery-catalog`,
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
        || `upholstery-catalog failed (${resp.status})`;
    } catch (netErr) {
      lastErr = netErr?.message || 'Network error';
    }
  }

  try {
    return await fetchUpholsteryCatalogFromFirestore();
  } catch (fallbackErr) {
    throw new Error(lastErr || fallbackErr?.message || 'upholstery-catalog failed');
  }
}

function shouldFallbackFromAdminError(message, status) {
  const msg = String(message || '').toLowerCase();
  if (status === 404) return true;
  return msg.includes('unknown adminaction') || msg.includes('network error') || msg.includes('failed to fetch');
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
  const headers = {
    'Content-Type': 'application/json',
    ...(await staffAuthHeaders()),
  };
  const urls = [
    apiUrl('/api/admin?adminAction=upholstery-catalog'),
    `${CANONICAL}/api/admin?adminAction=upholstery-catalog`,
  ].filter(Boolean);

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
