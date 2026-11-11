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

export async function fetchUpholsteryCatalogAssemblyIds() {
  const payload = await productionOp('upholstery-catalog-list');
  const rows = payload?.products || payload?.upholsteryProducts || [];
  return rows.map((row) => String(row.id || row.assembly_id || '')).filter(Boolean);
}

const MANUFACTURE_LIST_STALE_MS = 90_000;
let manufactureListCache = null;
let manufactureListFetchedAt = 0;
/** @type {Promise<unknown[]> | null} */
let manufactureListInflight = null;

export function invalidateUpholsteryManufactureListCache() {
  manufactureListCache = null;
  manufactureListFetchedAt = 0;
  manufactureListInflight = null;
}

/** Instant paint when returning to Manufacture within the stale window. */
export function peekUpholsteryManufactureListCache() {
  if (!Array.isArray(manufactureListCache)) return null;
  if (Date.now() - manufactureListFetchedAt > MANUFACTURE_LIST_STALE_MS) return null;
  return manufactureListCache;
}

export async function fetchUpholsteryManufactureProducts({ force = false } = {}) {
  const now = Date.now();
  if (
    !force
    && Array.isArray(manufactureListCache)
    && now - manufactureListFetchedAt <= MANUFACTURE_LIST_STALE_MS
  ) {
    return manufactureListCache;
  }
  if (manufactureListInflight && !force) {
    return manufactureListInflight;
  }
  const run = async () => {
    const payload = await productionOp('upholstery-manufacture-list');
    const list = Array.isArray(payload?.products) ? payload.products : [];
    manufactureListCache = list;
    manufactureListFetchedAt = Date.now();
    return list;
  };
  const pending = run().finally(() => {
    if (manufactureListInflight === pending) {
      manufactureListInflight = null;
    }
  });
  manufactureListInflight = pending;
  return pending;
}

export async function runUpholsteryManufacture({ rawAssemblyId, productQty = 1 }) {
  return productionOp('upholstery-manufacture', {
    raw_assembly_id: rawAssemblyId,
    product_qty: productQty,
  });
}

export async function uploadUpholsteryFloor2WipPhoto({ rawAssemblyId, imageBase64 }) {
  const payload = await productionOp('upholstery-floor2-wip-photo', {
    raw_assembly_id: rawAssemblyId,
    image_base64: imageBase64,
  });
  invalidateUpholsteryManufactureListCache();
  return payload;
}

export async function fetchUpholsteryProductionJobs({ activeOnly = true } = {}) {
  try {
    const payload = await productionOp('upholstery-job-list', {
      active_only: activeOnly,
    });
    const jobs = payload?.jobs;
    if (Array.isArray(jobs)) return jobs;
    return [];
  } catch (err) {
    if (isUnknownWarehouseOpError(err?.message)) {
      throw new Error(
        'Production jobs are not on the server yet. Deploy the latest Infinity Home API, then try again.',
      );
    }
    throw err;
  }
}

function isUnknownWarehouseOpError(message) {
  return /unknown op/i.test(String(message || ''));
}

export async function startUpholsteryProductionJob({ rawAssemblyId, productQty = 1 }) {
  try {
    const payload = await productionOp('upholstery-job-start', {
      raw_assembly_id: rawAssemblyId,
      product_qty: productQty,
    });
    return payload?.job || payload;
  } catch (err) {
    if (isUnknownWarehouseOpError(err?.message)) {
      throw new Error(
        'Production jobs are not on the server yet. Deploy the latest Infinity Home API, then try again.',
      );
    }
    throw err;
  }
}

export async function pauseUpholsteryProductionJob(jobId) {
  const payload = await productionOp('upholstery-job-pause', { job_id: jobId });
  return payload?.job || payload;
}

export async function resumeUpholsteryProductionJob(jobId) {
  const payload = await productionOp('upholstery-job-resume', { job_id: jobId });
  return payload?.job || payload;
}

export async function toggleUpholsteryProductionJobUnit(jobId, unitIndex) {
  const payload = await productionOp('upholstery-job-check-unit', {
    job_id: jobId,
    unit_index: unitIndex,
  });
  return payload?.job || payload;
}

export async function finishUpholsteryProductionJob(jobId) {
  return productionOp('upholstery-job-finish', { job_id: jobId });
}

/** Lightweight preset refresh — same data as portal /warehouse-production-presets. */
export async function fetchProductionPresets() {
  const payload = await productionOp('production-presets-list');
  return {
    seater: payload.seater || payload.production_presets?.seater || [],
    carpentry: payload.carpentry || payload.production_presets?.carpentry || [],
  };
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
    assemblyId: String(payload?.assembly?.id || packet?.assembly_id || packet?.id || '').trim(),
    labelCopies: Number.isFinite(labelCopies) ? labelCopies : 0,
    labelJobId: payload?.label_job_id || null,
    labelPrintWarning: payload?.label_print_warning || null,
    label: payload?.label || null,
    labelPreviewPngBase64: payload?.label_preview_png_base64 || '',
    pendingLabelPrint: payload?.pending_label_print || payload?.pendingLabelPrint || null,
    pendingPortalSetup: payload?.pending_portal_setup || payload?.pendingPortalSetup || null,
  };
}

export async function cancelProductionPacketDraft(assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) throw new Error('assembly_id is required.');
  return productionOp('production-packet-cancel-draft', { assembly_id: id });
}

export async function attachProductionProductPhoto({
  assemblyId,
  imageBase64,
  pendingLabelPrint,
  pendingPortalSetup: pendingPortalSetupPayload,
  preset,
  alsoFloor2Wip,
  onAttempt,
}) {
  const { attachProductionProductPhotoWithAi } = await import('./productionPhotoApi.js');
  return attachProductionProductPhotoWithAi({
    assemblyId,
    imageBase64,
    pendingLabelPrint,
    pendingPortalSetup: pendingPortalSetupPayload,
    preset,
    alsoFloor2Wip,
    onAttempt,
  });
}

/** Carpentry workshop — new SKU on Warehouse Floor 2 WIP (optional photo on create). */
export async function createCarpentryFloor2Product({
  name,
  baseName,
  preset,
  quantity,
  imageBase64,
  dimLength,
  dimWidth,
  dimHeight,
} = {}) {
  return productionOp('carpentry-floor2-create-product', {
    name,
    base_name: baseName,
    preset: preset ? String(preset).trim() : undefined,
    quantity,
    initial_quantity: quantity,
    image_base64: imageBase64,
    dim_length: dimLength,
    dim_width: dimWidth,
    dim_height: dimHeight,
  });
}

export async function uploadCarpentryFloor2ProductPhoto({ assemblyId, imageBase64 }) {
  return productionOp('carpentry-floor2-photo-upload', {
    assembly_id: assemblyId,
    image_base64: imageBase64,
  });
}

/** Create finished product + stock only (photo deferred — attach with attachProductionProductPhoto). */
export async function createProductionProductOnly({
  name,
  warehouseLocationId,
  initialQuantity,
  dimLength,
  dimWidth,
  dimHeight,
  preset,
} = {}) {
  const createPayload = await productionOp('production-packet-create', {
    name,
    warehouse_location_id: warehouseLocationId,
    initial_quantity: initialQuantity,
    packet_number: 1,
    qty_per_unit: 1,
    client_source: CLIENT_SOURCE,
    portal_catalog: 'upholstery',
    defer_product_photo: true,
    require_product_photo: false,
    dim_length: dimLength,
    dim_width: dimWidth,
    dim_height: dimHeight,
    preset: preset ? String(preset).trim() : undefined,
    product_preset: preset ? String(preset).trim() : undefined,
  });
  const parsed = parseCreateProductionPacketResponse(createPayload);
  if (!parsed.assemblyId) {
    throw new Error('Product save failed — server did not return a product id.');
  }
  return parsed;
}

export async function createProductionPacket({
  name,
  warehouseLocationId,
  initialQuantity,
  imageBase64,
  dimLength,
  dimWidth,
  dimHeight,
  preset,
  onPhotoAttempt,
  existingAssemblyId,
  pendingLabelPrint,
  pendingPortalSetup: pendingPortalSetupArg,
} = {}) {
  const resumeAssemblyId = String(existingAssemblyId || '').trim();
  const hasPhoto = Boolean(String(imageBase64 || '').trim());

  if (resumeAssemblyId && hasPhoto) {
    let photoPayload = null;
    try {
      photoPayload = await attachProductionProductPhoto({
        assemblyId: resumeAssemblyId,
        imageBase64,
        pendingLabelPrint,
        pendingPortalSetup: pendingPortalSetupArg,
        preset,
        onAttempt: onPhotoAttempt,
      });
    } catch (photoErr) {
      const err = new Error(
        photoErr?.message
          || 'AI photo could not be saved. Tap Save and take the photo again to retry.',
      );
      err.code = 'product_saved_photo_failed';
      err.createResult = {
        assemblyId: resumeAssemblyId,
        pendingLabelPrint,
        labelCopies: Math.max(0, Math.floor(Number(initialQuantity) || 0)),
      };
      throw err;
    }
    const labelCopies = Math.max(0, Math.floor(Number(initialQuantity) || 0));
    return {
      packet: { id: resumeAssemblyId, assembly_id: resumeAssemblyId },
      assemblyId: resumeAssemblyId,
      labelCopies,
      labelJobId: photoPayload?.label_job_id || null,
      labelPrintWarning: photoPayload?.label_print_warning || null,
      label: null,
      labelPreviewPngBase64: photoPayload?.label_preview_png_base64 || '',
      photoSaved: true,
      catalogImageUrl: photoPayload?.catalog_image_url || null,
    };
  }

  const createPayload = await productionOp('production-packet-create', {
    name,
    warehouse_location_id: warehouseLocationId,
    initial_quantity: initialQuantity,
    packet_number: 1,
    qty_per_unit: 1,
    client_source: CLIENT_SOURCE,
    portal_catalog: 'upholstery',
    defer_product_photo: hasPhoto,
    require_product_photo: false,
    dim_length: dimLength,
    dim_width: dimWidth,
    dim_height: dimHeight,
    preset: preset ? String(preset).trim() : undefined,
    product_preset: preset ? String(preset).trim() : undefined,
  });
  const parsed = parseCreateProductionPacketResponse(createPayload);
  if (!hasPhoto) {
    return parsed;
  }

  const assemblyId = parsed.assemblyId;
  if (!assemblyId) {
    const err = new Error('Product was created but the server did not return a product id for the photo.');
    err.code = 'product_saved_photo_failed';
    err.createResult = parsed;
    throw err;
  }

  const resolvedPendingLabelPrint = parsed.pendingLabelPrint
    || createPayload?.pending_label_print
    || createPayload?.pendingLabelPrint
    || pendingLabelPrint
    || null;
  const resolvedPendingPortalSetup = parsed.pendingPortalSetup
    || createPayload?.pending_portal_setup
    || createPayload?.pendingPortalSetup
    || pendingPortalSetupArg
    || null;
  let photoPayload = null;

  try {
    photoPayload = await attachProductionProductPhoto({
      assemblyId,
      imageBase64,
      pendingLabelPrint: resolvedPendingLabelPrint,
      pendingPortalSetup: resolvedPendingPortalSetup,
      preset,
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
    err.createResult = {
      ...parsed,
      assemblyId,
      pendingLabelPrint: resolvedPendingLabelPrint,
    };
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

const UPHOLSTERY_ROUTE = 'upholstery';

export async function fetchUpholsteryProductionQuotes() {
  try {
    const payload = await productionOp('production-quotes-list', { route: UPHOLSTERY_ROUTE });
    return payload?.rows || payload?.quotes || [];
  } catch (err) {
    if (/unknown op/i.test(String(err?.message || ''))) {
      return [];
    }
    throw err;
  }
}

export async function fetchProductionQuoteArabicTranslations(texts = []) {
  try {
    const payload = await productionOp('production-quote-translate-arabic', { texts });
    return payload?.translations || {};
  } catch {
    return {};
  }
}

export async function acceptUpholsteryQuote(quoteId) {
  return productionOp('production-quote-accept', {
    route: UPHOLSTERY_ROUTE,
    quote_id: quoteId,
  });
}

export async function completeUpholsteryQuote(quoteId) {
  return productionOp('production-quote-complete', {
    route: UPHOLSTERY_ROUTE,
    quote_id: quoteId,
  });
}

export async function pauseUpholsteryQuote(quoteId) {
  return productionOp('production-quote-pause', {
    route: UPHOLSTERY_ROUTE,
    quote_id: quoteId,
  });
}

export async function resumeUpholsteryQuote(quoteId) {
  return productionOp('production-quote-resume', {
    route: UPHOLSTERY_ROUTE,
    quote_id: quoteId,
  });
}

export async function scanUpholsteryQuoteMaterial(quoteId, scan, quantity = 1) {
  return productionOp('production-quote-material-scan', {
    route: UPHOLSTERY_ROUTE,
    quote_id: quoteId,
    scan,
    quantity,
  });
}

let floor2ListCache = { at: 0, rows: [] };
const FLOOR2_LIST_TTL_MS = 90_000;

export async function fetchProductionFloor2Products({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh
    && floor2ListCache.rows.length
    && now - floor2ListCache.at < FLOOR2_LIST_TTL_MS
  ) {
    return floor2ListCache.rows;
  }
  const payload = await productionOp('production-floor2-list', {});
  const rows = payload?.products || [];
  floor2ListCache = { at: now, rows };
  return rows;
}

export async function pushProductionFloor2Manufacture({
  assemblyId,
  productQty = 1,
  channel = 'upholstery',
} = {}) {
  return productionOp('production-floor2-manufacture-push', {
    assembly_id: assemblyId,
    product_qty: productQty,
    channel,
  });
}

export async function fetchProductionStoreroomMaterials() {
  const payload = await productionOp('production-storeroom-materials-list', {});
  if (Array.isArray(payload)) {
    return { materials: payload, storerooms: [], storeroom_labels: [], uom_options: [] };
  }
  return {
    materials: payload?.materials || [],
    storerooms: payload?.storerooms || [],
    storeroom_labels: payload?.storeroom_labels || [],
    uom_options: payload?.uom_options || [],
  };
}

export async function saveProductionJobMaterials({
  jobKind,
  jobId,
  returnOrderId,
  productionRoute,
  materialLines,
  preferredStoreroomLocationId,
} = {}) {
  return productionOp('production-job-materials-save', {
    job_kind: jobKind,
    job_id: jobId,
    return_order_id: returnOrderId,
    production_route: productionRoute,
    material_lines: materialLines,
    preferred_storeroom_location_id: preferredStoreroomLocationId || undefined,
  });
}
