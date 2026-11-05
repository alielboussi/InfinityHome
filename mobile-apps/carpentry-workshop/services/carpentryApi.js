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

const CARPENTRY_ROUTE = 'carpentry';

export async function fetchCarpentryProductionQuotes() {
  const payload = await warehouseMobileRequest('production-quotes-list', { route: CARPENTRY_ROUTE });
  return payload?.rows || [];
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
