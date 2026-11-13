import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
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
