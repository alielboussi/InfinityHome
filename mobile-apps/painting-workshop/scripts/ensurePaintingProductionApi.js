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
