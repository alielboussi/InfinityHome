import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

export async function fetchCarpentryAccess() {
  const payload = await warehouseMobileRequest('carpentry-access-self');
  return {
    allowed: Boolean(payload?.allowed),
    displayName: payload?.display_name || null,
    grant: payload?.grant || null,
  };
}

export async function fetchCarpentryCatalog() {
  const payload = await warehouseMobileRequest('carpentry-catalog-list');
  return payload?.carpentryProducts || [];
}

export async function runCarpentryManufacture({ assemblyId, productQty = 1 }) {
  return warehouseMobileRequest('carpentry-manufacture', {
    assembly_id: assemblyId,
    product_qty: productQty,
  });
}

export async function fetchCarpentryManufactureProducts() {
  const payload = await warehouseMobileRequest('carpentry-manufacture-list');
  return payload?.products || [];
}

/** Warehouse Floor 2 WIP catalog (create / manufacture / painting). */
export async function fetchCarpentryFloor2Products() {
  const payload = await warehouseMobileRequest('carpentry-floor2-list', {});
  return payload?.products || [];
}

export async function increaseCarpentryFloor2Stock({ assemblyId, delta, quantity } = {}) {
  const deltaNum = Math.floor(Number(delta ?? quantity ?? 0));
  if (!Number.isFinite(deltaNum) || deltaNum === 0) {
    throw new Error('Enter a non-zero quantity.');
  }
  return warehouseMobileRequest('carpentry-floor2-stock-increase', {
    assembly_id: assemblyId,
    delta: deltaNum,
  });
}

export async function startCarpentryProductionJob({ assemblyId, productQty = 1 }) {
  return warehouseMobileRequest('carpentry-job-start', {
    assembly_id: assemblyId,
    product_qty: productQty,
  });
}

export async function fetchCarpentryProductionJobs({ activeOnly = true } = {}) {
  const payload = await warehouseMobileRequest('carpentry-job-list', { active_only: activeOnly });
  return payload?.jobs || [];
}

export async function pauseCarpentryProductionJob(jobId) {
  return warehouseMobileRequest('carpentry-job-pause', { job_id: jobId });
}

export async function resumeCarpentryProductionJob(jobId) {
  return warehouseMobileRequest('carpentry-job-resume', { job_id: jobId });
}

export async function finishCarpentryProductionJob(jobId) {
  return warehouseMobileRequest('carpentry-job-finish', { job_id: jobId });
}

export async function fetchCarpentryFinishingProducts() {
  const payload = await warehouseMobileRequest('carpentry-finishing-list');
  return payload?.products || [];
}

export async function runCarpentryFinishing({ assemblyId, productQty = 1 }) {
  return warehouseMobileRequest('carpentry-finishing', {
    assembly_id: assemblyId,
    product_qty: productQty,
  });
}

export async function sendCarpentryProductToPainting({ assemblyId, productQty = 1 }) {
  return warehouseMobileRequest('painting-send-from-floor2', {
    assembly_id: assemblyId,
    product_qty: productQty,
  });
}

const CARPENTRY_ROUTE = 'carpentry';

export async function fetchCarpentryProductionQuotes() {
  try {
    const payload = await warehouseMobileRequest('production-quotes-list', { route: CARPENTRY_ROUTE });
    return payload?.rows || [];
  } catch (err) {
    if (/unknown op/i.test(String(err?.message || ''))) {
      return [];
    }
    throw err;
  }
}

export async function acceptCarpentryQuote(quoteId) {
  return warehouseMobileRequest('production-quote-accept', { route: CARPENTRY_ROUTE, quote_id: quoteId });
}

export async function completeCarpentryQuote(quoteId) {
  return warehouseMobileRequest('production-quote-complete', { route: CARPENTRY_ROUTE, quote_id: quoteId });
}

export async function scanCarpentryQuoteMaterial(quoteId, scan, quantity = 1) {
  return warehouseMobileRequest('production-quote-material-scan', {
    route: CARPENTRY_ROUTE,
    quote_id: quoteId,
    scan,
    quantity,
  });
}

let floor2ListCache = { at: 0, rows: [] };
const FLOOR2_LIST_TTL_MS = 90_000;

export async function fetchProductionFloor2Products({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && floor2ListCache.rows.length && now - floor2ListCache.at < FLOOR2_LIST_TTL_MS) {
    return floor2ListCache.rows;
  }
  const payload = await warehouseMobileRequest('production-floor2-list', {});
  const rows = payload?.products || [];
  floor2ListCache = { at: now, rows };
  return rows;
}

export async function pushProductionFloor2Manufacture({ assemblyId, productQty = 1, channel = 'carpentry' } = {}) {
  return warehouseMobileRequest('production-floor2-manufacture-push', {
    assembly_id: assemblyId,
    product_qty: productQty,
    channel,
  });
}

export async function fetchProductionStoreroomMaterials() {
  const payload = await warehouseMobileRequest('production-storeroom-materials-list', {});
  return payload?.materials || [];
}

export async function saveProductionJobMaterials({ jobKind, jobId, returnOrderId, materialLines } = {}) {
  return warehouseMobileRequest('production-job-materials-save', {
    job_kind: jobKind,
    job_id: jobId,
    return_order_id: returnOrderId,
    material_lines: materialLines,
  });
}
