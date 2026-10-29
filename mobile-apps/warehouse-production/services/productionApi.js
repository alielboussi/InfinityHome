import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

const CLIENT_SOURCE = 'warehouse_production_app';

async function productionOp(op, body = {}) {
  return warehouseMobileRequest(op, body);
}

export async function fetchProductionAccess() {
  const payload = await productionOp('production-access-self');
  const grant = payload?.grant || null;
  return {
    allowed: Boolean(payload.allowed),
    displayName: payload.display_name || null,
    productionApp: grant?.warehouse_production_app || null,
  };
}

export async function fetchProductionCatalog() {
  return productionOp('catalog-list');
}

export async function fetchProductionRecentBaseNames() {
  const payload = await productionOp('production-recent-base-names', {});
  const list = payload?.base_names || payload?.baseNames || [];
  return Array.isArray(list) ? list : [];
}

async function suggestProductionBaseNameLocally(preset) {
  const {
    buildProductionItemName,
    fetchUniqueRandomProductionBaseName,
    pickRandomProductionBaseName,
  } = await import('../lib/productionItemName');
  const p = String(preset || '').trim();
  const baseName = p
    ? await fetchUniqueRandomProductionBaseName((candidate) => isProductionPacketNameTaken(
      buildProductionItemName(candidate, p),
    ))
    : pickRandomProductionBaseName();
  return {
    baseName,
    productName: p ? buildProductionItemName(baseName, p) : baseName,
  };
}

export async function fetchProductionSuggestedBaseName({ preset } = {}) {
  const p = String(preset || '').trim();
  const { buildProductionItemName, matchProductionGirlNameFromPool } = await import('../lib/productionItemName');
  try {
    const payload = await productionOp('production-suggest-base-name', {
      preset: p || undefined,
    });
    const baseName = matchProductionGirlNameFromPool(payload.base_name || '');
    if (baseName) {
      return {
        baseName,
        productName: p ? buildProductionItemName(baseName, p) : baseName,
      };
    }
  } catch {
    // use local pool below
  }
  return suggestProductionBaseNameLocally(p);
}

export async function isProductionPacketNameTaken(name, options = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;
  const payload = await productionOp('packet-name-check', {
    name: trimmed,
    exclude_packet_id: options.excludePacketId,
    exclude_assembly_id: options.excludeAssemblyId,
  });
  return Boolean(payload.taken);
}

export async function checkProductionProductName(name, options = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { taken: false, name: '' };
  return productionOp('packet-name-check', {
    name: trimmed,
    exclude_packet_id: options.excludePacketId,
    exclude_assembly_id: options.excludeAssemblyId,
  });
}

function parseCreateProductionPacketResponse(payload) {
  const packet = payload?.packet || null;
  const labelCopies = Number(payload?.label_copies);
  return {
    packet,
    labelCopies: Number.isFinite(labelCopies) ? labelCopies : 0,
    labelJobId: payload?.label_job_id || null,
    labelPrintWarning: payload?.label_print_warning || null,
    label: payload?.label || null,
    labelPreviewPngBase64: payload?.label_preview_png_base64 || '',
  };
}

export async function attachProductionProductPhoto({ assemblyId, imageBase64, pendingLabelPrint, onAttempt }) {
  const { attachProductionProductPhotoWithAi } = await import('./productionPhotoApi.js');
  return attachProductionProductPhotoWithAi({
    assemblyId,
    imageBase64,
    pendingLabelPrint,
    onAttempt,
  });
}

export async function createProductionPacket({
  name,
  warehouseLocationId,
  initialQuantity,
  imageBase64,
  dimLength,
  dimWidth,
  dimHeight,
  onPhotoAttempt,
} = {}) {
  const hasPhoto = Boolean(String(imageBase64 || '').trim());
  const createPayload = await productionOp('production-packet-create', {
    name,
    warehouse_location_id: warehouseLocationId,
    initial_quantity: initialQuantity,
    packet_number: 1,
    qty_per_unit: 1,
    client_source: CLIENT_SOURCE,
    defer_product_photo: hasPhoto,
    require_product_photo: false,
    dim_length: dimLength,
    dim_width: dimWidth,
    dim_height: dimHeight,
  });
  const parsed = parseCreateProductionPacketResponse(createPayload);
  if (!hasPhoto) {
    return parsed;
  }

  const assemblyId = String(
    createPayload?.assembly?.id
    || parsed.packet?.assembly_id
    || parsed.packet?.id
    || '',
  ).trim();
  if (!assemblyId) {
    const err = new Error('Product was created but the server did not return a product id for the photo.');
    err.code = 'product_saved_photo_failed';
    err.createResult = parsed;
    throw err;
  }

  const pendingLabelPrint = createPayload?.pending_label_print || null;
  let photoPayload = null;

  try {
    photoPayload = await attachProductionProductPhoto({
      assemblyId,
      imageBase64,
      pendingLabelPrint,
      onAttempt: onPhotoAttempt,
    });
    const photoLabelWarning = String(photoPayload?.label_print_warning || '').trim();
    if (photoLabelWarning) {
      parsed.labelPrintWarning = photoLabelWarning;
    }
    if (photoPayload?.label_job_id) {
      parsed.labelJobId = photoPayload.label_job_id;
    }
    if (photoPayload?.label_preview_png_base64) {
      parsed.labelPreviewPngBase64 = photoPayload.label_preview_png_base64;
    }
  } catch (photoErr) {
    const err = new Error(
      photoErr?.message
        || 'AI photo could not be saved. Check Warehouse — the product may exist without an image.',
    );
    err.code = 'product_saved_photo_failed';
    err.createResult = parsed;
    throw err;
  }

  return {
    ...parsed,
    photoSaved: true,
    catalogImageUrl: photoPayload?.catalog_image_url || null,
  };
}

export async function increaseProductionStock({ packetId, assemblyId, warehouseLocationId, delta }) {
  const body = {
    warehouse_location_id: warehouseLocationId,
    delta,
    client_source: CLIENT_SOURCE,
  };
  if (assemblyId) {
    body.assembly_id = assemblyId;
  } else {
    body.packet_id = packetId;
  }
  const payload = await productionOp('production-stock-increase', body);
  return {
    ...payload,
    labelPrintWarning: payload?.label_print_warning || null,
    labelPreviewPngBase64: payload?.label_preview_png_base64 || '',
    labelCopies: Number(payload?.label_copies) || delta,
  };
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

export async function resolveProductionScan(scan) {
  return productionOp('scan-resolve', { scan });
}
