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
