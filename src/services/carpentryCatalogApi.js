import db from '../dataClient';
import { apiUrl, withApiHeaders } from '../utils/apiUrl';
import { firebaseGetAccessToken } from '../utils/firebaseAuthApi';
import { buildCarpentryCatalogPayload } from '../utils/carpentryCatalogView';
import {
  fetchSharedProductionPortalSnapshot,
  getCachedProductionPortalSnapshot,
  invalidateProductionPortalSnapshotCache,
} from '../utils/loadProductionPortalCatalogInputs';
import { canManageCatalog, getCurrentUser } from '../accessControl';
import {
  saveCarpentryProductMaterials,
  saveCarpentryProductSelection,
  listCarpentryFloorRuns,
  addFloor1ProductToFloor2Local,
  setFloor2ProductStockQtyLocal,
} from '../utils/carpentryCatalogMutations';
import { receiveStoreroomMaterial, createStoreroomMaterial, setStoreroomMaterialStockQty } from '../utils/storeroomStockMutations';
import { cacheClear, cacheGet, cacheSet } from '../utils/staleCache';

const CANONICAL = (process.env.REACT_APP_CANONICAL_ORIGIN || 'https://www.infinity-home.online').replace(/\/+$/, '');
const FLOOR_RUNS_CACHE_KEY = 'warehouse:floor2Runs:v1';

function uniqueUrls(urls) {
  return [...new Set((urls || []).filter(Boolean))];
}

async function staffAuthHeaders() {
  const token = await firebaseGetAccessToken(false);
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

export function getCachedCarpentryCatalog() {
  const snap = getCachedProductionPortalSnapshot();
  if (!snap || !Array.isArray(snap.assemblies)) return null;
  return {
    ...buildCarpentryCatalogPayload(snap.assemblies, snap.setItems, snap.portalInputs),
    locations: snap.portalInputs?.locations || [],
  };
}

export function getCachedCarpentryFloorRuns() {
  return cacheGet(FLOOR_RUNS_CACHE_KEY);
}

export async function fetchCarpentryCatalog({ forceFresh = false } = {}) {
  const snap = await fetchSharedProductionPortalSnapshot({ forceFresh });
  return {
    ...buildCarpentryCatalogPayload(snap.assemblies, snap.setItems, snap.portalInputs),
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
  if (op === 'add-floor2-product') {
    const result = await addFloor1ProductToFloor2Local(db, {
      assemblyId: body.assembly_id || body.assemblyId,
      productQty: body.product_qty ?? body.productQty ?? body.quantity ?? 1,
      userId: user?.id || null,
    });
    return { ok: true, ...result };
  }
  if (op === 'set-floor2-stock') {
    const result = await setFloor2ProductStockQtyLocal(db, {
      assemblyId: body.assembly_id || body.assemblyId,
      quantity: body.quantity ?? body.product_qty ?? body.productQty ?? 0,
    });
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
  const op = String(body?.op || '').trim().toLowerCase();
  if (op !== 'list-floor-runs' && op !== 'list') {
    invalidateProductionPortalSnapshotCache();
    cacheClear(FLOOR_RUNS_CACHE_KEY);
  }

  let headers;
  try {
    headers = {
      'Content-Type': 'application/json',
      ...(await staffAuthHeaders()),
    };
  } catch {
    return postCarpentryCatalogDirect(body);
  }

  const urls = uniqueUrls([
    apiUrl('/api/admin?adminAction=carpentry-catalog'),
    `${CANONICAL}/api/admin?adminAction=carpentry-catalog`,
  ]);

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
  try {
    const result = await listCarpentryFloorRuns(db, { limit: 200 });
    const payload = { ok: true, ...result };
    cacheSet(FLOOR_RUNS_CACHE_KEY, payload, 60 * 1000);
    return payload;
  } catch {
    const payload = await postCarpentryCatalog({ op: 'list-floor-runs' });
    cacheSet(FLOOR_RUNS_CACHE_KEY, payload, 60 * 1000);
    return payload;
  }
}

export async function postAddFloor2Product(assemblyId, productQty = 1) {
  invalidateProductionPortalSnapshotCache();
  cacheClear(FLOOR_RUNS_CACHE_KEY);
  try {
    const user = getCurrentUser();
    if (canManageCatalog(user)) {
      const result = await addFloor1ProductToFloor2Local(db, {
        assemblyId,
        productQty,
        userId: user?.id || null,
      });
      return { ok: true, ...result };
    }
  } catch {
    /* fallback to API */
  }
  return postCarpentryCatalog({
    op: 'add-floor2-product',
    assembly_id: assemblyId,
    product_qty: productQty,
  });
}

export async function postSetFloor2ProductStock(assemblyId, quantity) {
  invalidateProductionPortalSnapshotCache();
  cacheClear(FLOOR_RUNS_CACHE_KEY);
  try {
    const user = getCurrentUser();
    if (canManageCatalog(user)) {
      const result = await setFloor2ProductStockQtyLocal(db, {
        assemblyId,
        quantity,
      });
      return { ok: true, ...result };
    }
  } catch {
    /* fallback to API */
  }
  return postCarpentryCatalog({
    op: 'set-floor2-stock',
    assembly_id: assemblyId,
    quantity,
  });
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
