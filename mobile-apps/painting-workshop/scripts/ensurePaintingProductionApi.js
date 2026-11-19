/**
 * Shared UI (materialized from upholstery) imports ../services/productionApi.
 * Painting job APIs live in paintingApi.js — this shim is required at runtime.
 */
const fs = require('fs');
const path = require('path');

const dest = path.join(path.resolve(__dirname, '..'), 'services', 'productionApi.js');

const SOURCE = `import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
export {
  fetchProductionStoreroomMaterials,
  saveProductionJobMaterials,
} from './paintingApi';

const CLIENT_SOURCE = 'painting_workshop_app';

async function productionOp(op, body = {}) {
  return warehouseMobileRequest(op, body);
}

export async function fetchProductionRecentBaseNames() {
  const payload = await productionOp('production-recent-base-names', {});
  const list = payload?.base_names || payload?.baseNames || [];
  return Array.isArray(list) ? list : [];
}

export async function fetchProductionLabelPreview({ name, sku, printedAt }) {
  return productionOp('production-label-preview', {
    name,
    sku,
    printed_at: printedAt,
  });
}

export async function printProductionLabel({ name, sku, copies = 1 }) {
  const payload = await productionOp('production-label-print', {
    name,
    sku,
    qty: copies,
    client_source: CLIENT_SOURCE,
  });
  return {
    labelPrintWarning: payload?.label_print_warning || null,
    labelPreviewPngBase64: payload?.label_preview_png_base64 || '',
    labelCopies: Number(payload?.label_copies) || copies,
    label: payload?.label || null,
    labelJobId: payload?.label_job_id || null,
  };
}

let floor2ListCache = { at: 0, rows: [], floor2LocationId: '' };
const FLOOR2_LIST_TTL_MS = 90_000;

export async function fetchProductionFloor2CatalogMeta({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh
    && floor2ListCache.rows.length
    && now - floor2ListCache.at < FLOOR2_LIST_TTL_MS
  ) {
    return { products: floor2ListCache.rows, floor2LocationId: floor2ListCache.floor2LocationId };
  }
  const payload = await productionOp('production-floor2-list', {});
  const rows = payload?.products || [];
  const floor2LocationId = String(payload?.floor2_location_id || '').trim();
  floor2ListCache = { at: now, rows, floor2LocationId };
  return { products: rows, floor2LocationId };
}
`;

function main() {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const prev = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  if (prev === SOURCE) {
    console.log('[ensurePaintingProductionApi] skip — up to date');
    return;
  }
  fs.writeFileSync(dest, SOURCE, 'utf8');
  console.log('[ensurePaintingProductionApi] ok');
}

main();
