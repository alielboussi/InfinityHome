import { warehouseMobileRequest } from './warehouseMobileApi';

function labelDimPayload({ dimLength, dimWidth, dimHeight } = {}) {
  const out = {};
  const l = dimLength ?? '';
  const w = dimWidth ?? '';
  const h = dimHeight ?? '';
  if (l !== '' && l != null) out.dim_length = l;
  if (w !== '' && w != null) out.dim_width = w;
  if (h !== '' && h != null) out.dim_height = h;
  return out;
}

export async function fetchWarehouseCatalogLabelPreview({
  name, sku, printedAt, color, boxUnitsPerCarton, dimLength, dimWidth, dimHeight, photoFloor,
}) {
  return warehouseMobileRequest('production-label-preview', {
    name,
    sku,
    printed_at: printedAt,
    ...(color ? { color } : {}),
    ...(boxUnitsPerCarton > 0 ? { box_units_per_carton: boxUnitsPerCarton } : {}),
    ...labelDimPayload({ dimLength, dimWidth, dimHeight }),
    ...(photoFloor ? { photo_floor: photoFloor } : {}),
  });
}

export async function printWarehouseCatalogLabel({
  name, sku, copies = 1, color, boxUnitsPerCarton, dimLength, dimWidth, dimHeight, photoFloor,
}) {
  const payload = await warehouseMobileRequest('production-label-print', {
    name,
    sku,
    qty: copies,
    client_source: photoFloor === 'floor2' ? 'warehouse_floor2_mobile' : 'warehouse_catalog_mobile',
    ...(color ? { color } : {}),
    ...(boxUnitsPerCarton > 0 ? { box_units_per_carton: boxUnitsPerCarton } : {}),
    ...labelDimPayload({ dimLength, dimWidth, dimHeight }),
    ...(photoFloor ? { photo_floor: photoFloor } : {}),
  });
  return {
    labelPrintWarning: payload?.label_print_warning || null,
    labelPreviewPngBase64: payload?.label_preview_png_base64 || '',
    labelCopies: Number(payload?.label_copies) || copies,
    label: payload?.label || null,
  };
}
