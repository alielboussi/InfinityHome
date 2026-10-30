import { warehouseMobileRequest } from './warehouseMobileApi';

export async function fetchWarehouseCatalogLabelPreview({ name, sku, printedAt }) {
  return warehouseMobileRequest('production-label-preview', {
    name,
    sku,
    printed_at: printedAt,
  });
}

export async function printWarehouseCatalogLabel({ name, sku, copies = 1 }) {
  const payload = await warehouseMobileRequest('production-label-print', {
    name,
    sku,
    qty: copies,
    client_source: 'warehouse_catalog_mobile',
  });
  return {
    labelPrintWarning: payload?.label_print_warning || null,
    labelPreviewPngBase64: payload?.label_preview_png_base64 || '',
    labelCopies: Number(payload?.label_copies) || copies,
    label: payload?.label || null,
  };
}
