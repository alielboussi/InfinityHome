import { createFirestoreServerClient } from './firestoreServerClient.js';
import { attachProductionAssemblyCatalogPhoto } from './productionPacketCatalogPhoto.js';
import {
  evaluateCarpentryWorkshopAppAccess,
  evaluateWarehouseProductionAppAccess,
} from '../../src/mobile/mobileAccessManifest.js';
import { getLoginAccessRecord } from './loginAccess.js';
import { resolveWarehouseProductionWhatsAppProducerName } from './warehouseProductionWhatsAppProducer.js';
import { normalizeMobileAccessGrant } from './mobileAccessDefaults.js';
import { enqueueWarehouseProductionLabelJob } from './productionLabelPrint.js';
import { normalizeWarehousePacketScan } from '../../src/utils/warehouseScanResolver.js';
import { rewriteLegacyProductImageUrl } from '../../src/utils/storageImageUrl.js';
import { isMattressCatalogProductName } from '../../src/utils/isMattressCatalogProductName.js';
import { buildWarehouseProductionLabelPngBase64 } from './warehouseProductionLabelImage.js';
import { sendWarehouseProductionWhatsApp } from './sendWarehouseProductionWhatsApp.js';
import { buildProductionWhatsAppNotifyPayload } from './warehouseProductionPresets.js';
import { upsertFinishedAssemblyInventoryQuantity } from './warehouseCatalogMobile.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';
import { parseUpholsteryMeta } from '../../src/utils/upholsteryCatalogView.js';
import { mirrorCarpentryProductionCatalogToFloor2Wip } from './mirrorCarpentryProductionCatalogToFloor2Wip.js';

async function productionWhatsappProducerName(user) {
  const record = await getLoginAccessRecord(user?.id);
  return resolveWarehouseProductionWhatsAppProducerName(user, record);
}

function pendingLabelQty(body) {
  const pending = body.pending_label_print || body.pendingLabelPrint;
  const qty = Math.floor(Number(pending?.qty) || 0);
  return qty > 0 ? qty : 0;
}

/** Carpentry defers labels until painting — WhatsApp qty comes from pending_portal_setup instead. */
function pendingProductionNotifyQty(body) {
  const fromLabels = pendingLabelQty(body);
  if (fromLabels > 0) return fromLabels;
  const portal = pendingPortalSetup(body);
  if (!portal) return 0;
  const qty = Math.floor(Number(
    portal.initial_quantity
    ?? portal.floor2_product_qty
    ?? portal.initialQuantity
    ?? portal.floor2ProductQty
  ) || 0);
  return qty > 0 ? qty : 0;
}

async function notifyNewProductionProductWhatsApp({
  user,
  assembly,
  qtyAdded,
  imageUrl,
  preset,
}) {
  const qty = Math.max(0, Math.floor(Number(qtyAdded) || 0));
  const image = String(imageUrl || assembly?.image_url || '').trim();
  const producedBy = await productionWhatsappProducerName(user);
  const sb = getService();
  try {
    const payload = await buildProductionWhatsAppNotifyPayload(sb, {
      variant: 'new',
      producedBy,
      sku: assembly?.family_sku || '',
      name: assembly?.name || '',
      qtyAdded: qty,
      qtyBefore: 0,
      preset,
      imageUrl: image,
    });
    await sendWarehouseProductionWhatsApp(payload);
  } catch (err) {
    console.warn('[warehouse-production-photo] WhatsApp notify failed:', err?.message || err);
  }
}

const MAX_IMAGE_BASE64_CHARS = 3_200_000;

function getService() {
  const client = createFirestoreServerClient();
  if (!client) throw new Error('Firebase admin not configured');
  return client;
}

async function assertProductionKioskUser(user) {
  const record = await getLoginAccessRecord(user?.id, user?.email);
  const grant = normalizeMobileAccessGrant(record?.mobile_access || {}, user?.email);
  if (evaluateWarehouseProductionAppAccess(grant, user?.email)) {
    return grant;
  }
  if (evaluateCarpentryWorkshopAppAccess(grant, user?.email)) {
    return grant;
  }
  const err = new Error('You do not have access to warehouse production.');
  err.status = 403;
  throw err;
}

function promiseWithTimeout(promise, ms, timeoutMessage) {
  const cap = Math.max(1000, Number(ms) || 10000);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage || 'Timed out')), cap);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function pendingPortalSetup(body) {
  return body.pending_portal_setup || body.pendingPortalSetup || null;
}

async function runPendingPortalSetup(sb, body, user, assembly) {
  const pending = pendingPortalSetup(body);
  if (!pending || !assembly?.id) return null;

  const assemblyId = String(assembly.id).trim();
  const { data: freshRow } = await sb
    .from('warehouse_assemblies')
    .select('id, metadata')
    .eq('id', assemblyId)
    .maybeSingle();

  const record = await getLoginAccessRecord(user?.id, user?.email);
  const grant = normalizeMobileAccessGrant(record?.mobile_access || {}, user?.email);
  const isCarpentryOnlyUser = evaluateCarpentryWorkshopAppAccess(grant, user?.email)
    && !evaluateWarehouseProductionAppAccess(grant, user?.email);
  const presetLabel = String(body.preset || body.product_preset || '').trim();
  const { PRODUCTION_CARPENTRY_PRESETS } = await import('../../src/utils/productionItemName.js');
  const isCarpentryPreset = Boolean(
    presetLabel
    && PRODUCTION_CARPENTRY_PRESETS.some((p) => p.toLowerCase() === presetLabel.toLowerCase()),
  );
  const resolvedPortalCatalog = (isCarpentryOnlyUser || isCarpentryPreset)
    ? 'carpentry'
    : (pending.portal_catalog || pending.portalCatalog || 'upholstery');

  const floor2SeedQty = Math.max(0, Math.floor(
    Number(
      pending.floor2_product_qty
      ?? pending.initial_quantity
      ?? pending.initialQuantity
      ?? pending.floor2ProductQty
    ) || 0,
  ));

  if (resolvedPortalCatalog === 'carpentry') {
    const { parseCarpentryMeta } = await import('../../src/utils/carpentryCatalogView.js');
    if (parseCarpentryMeta(freshRow || assembly)?.selected) {
      if (floor2SeedQty > 0) {
        const { creditCarpentryFloor2SeedIfNeeded } = await import('./productionPortalAutoSelect.js');
        const seed = await creditCarpentryFloor2SeedIfNeeded(sb, assemblyId, floor2SeedQty, user?.id || user?.uid || null);
        return {
          applied: 'carpentry',
          skipped: seed.credited ? 'selection_only' : true,
          floor2_product_qty: seed.quantity ?? floor2SeedQty,
          floor2_seed: seed,
        };
      }
      return { applied: 'carpentry', skipped: true };
    }
  } else {
    const upholsteryMeta = parseUpholsteryMeta(freshRow || assembly);
    if (upholsteryMeta?.selected) {
      if (floor2SeedQty > 0) {
        const { creditCarpentryFloor2SeedIfNeeded } = await import('./productionPortalAutoSelect.js');
        const seed = await creditCarpentryFloor2SeedIfNeeded(sb, assemblyId, floor2SeedQty, user?.id || user?.uid || null);
        return {
          applied: 'upholstery',
          skipped: seed.credited ? 'selection_only' : true,
          floor2_product_qty: seed.quantity ?? floor2SeedQty,
          floor2_seed: seed,
        };
      }
      return { applied: 'upholstery', skipped: true };
    }
  }

  const warehouseLocationId = String(
    pending.warehouse_location_id || pending.warehouseLocationId || '',
  ).trim();
  const initialQty = Math.max(0, Math.floor(
    Number(pending.initial_quantity ?? pending.initialQuantity ?? pending.floor2_product_qty) || 0,
  ));
  const floor2SeedForPortal = Math.max(floor2SeedQty, initialQty, 1);

  if (
    warehouseLocationId
    && initialQty > 0
    && resolvedPortalCatalog !== 'carpentry'
    && resolvedPortalCatalog !== 'upholstery'
  ) {
    await upsertFinishedAssemblyInventoryQuantity(sb, {
      assemblyId,
      locationId: warehouseLocationId,
      quantity: initialQty,
    });
    void recomputeWarehouseLocationStockServer(sb, warehouseLocationId).catch((reErr) => {
      console.warn('[warehouse-production-photo] warehouse stock recompute deferred:', reErr?.message || reErr);
    });
  }

  const { autoSelectProductionPortalCatalog } = await import('./productionPortalAutoSelect.js');
  return autoSelectProductionPortalCatalog(sb, assemblyId, {
    clientSource: resolvedPortalCatalog === 'carpentry'
      ? 'carpentry_workshop_app'
      : (pending.client_source || body.client_source || ''),
    portal_catalog: resolvedPortalCatalog,
    auto_portal_catalog: pending.auto_portal_catalog,
    initialQuantity: floor2SeedForPortal,
    floor2_product_qty: floor2SeedForPortal,
    userId: user?.id || user?.uid || null,
  });
}

async function runPendingLabelPrint(sb, body, user, assembly) {
  const pending = body.pending_label_print || body.pendingLabelPrint;
  if (!pending || Math.floor(Number(pending.qty) || 0) < 1) {
    return { label_job_id: null, label_print_warning: null };
  }

  const name = String(pending.name || assembly?.name || '').trim();
  const rawSku = String(pending.sku || assembly?.family_sku || '').trim();
  const labelSku = normalizeWarehousePacketScan(rawSku) || rawSku;
  const labelCopies = Math.max(0, Math.floor(Number(pending.qty) || 0));
  const clientSource = String(pending.client_source || body.client_source || '').trim()
    || 'warehouse_production_app';
  if (clientSource === 'carpentry_workshop_app') {
    return { label_job_id: null, label_print_warning: null };
  }
  const printedAt = new Date();
  const labelPrintedBy = (await productionWhatsappProducerName(user)) || 'Production kiosk';

  let labelJobId = null;
  let labelPrintWarning = null;
  try {
    labelJobId = await promiseWithTimeout(
      enqueueWarehouseProductionLabelJob(sb, {
        name,
        sku: labelSku,
        qty: labelCopies,
        printedBy: labelPrintedBy,
        source: clientSource,
        printedAt,
      }),
      15000,
      'Label print timed out',
    );
    if (!labelJobId) {
      labelPrintWarning = 'Product photo saved but labels were not sent to the printer (Zebra Weblink is not configured on the server).';
    }
  } catch (printErr) {
    const { formatZebraPrintError } = await import('./formatZebraPrintError.js');
    const timedOut = String(printErr?.message || '').toLowerCase().includes('timed out');
    labelPrintWarning = timedOut
      ? 'Photo saved. Labels may still print — if not, add stock again to reprint.'
      : formatZebraPrintError(printErr);
    console.warn('[warehouse-production-photo] label print failed:', printErr?.message || printErr);
  }

  return { label_job_id: labelJobId, label_print_warning: labelPrintWarning };
}

async function buildLabelPreviewForAssembly(assembly, printedAt = new Date()) {
  const sku = String(assembly?.family_sku || '').trim();
  const name = String(assembly?.name || '').trim();
  if (!sku || !name) return null;
  try {
    return await buildWarehouseProductionLabelPngBase64({ name, sku, printedAt });
  } catch (err) {
    console.warn('[warehouse-production-photo] label preview png failed:', err?.message || err);
    return null;
  }
}

/**
 * AI catalog photo for a finished warehouse product (Gemini retouch + storage + assembly image_url).
 */
export async function runProductionAssemblyPhotoAttach(body, user) {
  await assertProductionKioskUser(user);
  const sb = getService();
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  const imageBase64 = String(body.image_base64 || body.imageBase64 || '').trim();
  /** This handler is Production-only — always Gemini retouch (catalog uses warehouse-catalog-photo). */
  const requireAi = true;
  const forceReupload = body.force_reupload === true || body.forceReupload === true;
  const preset = String(body.preset || body.product_preset || '').trim();
  if (!assemblyId) throw new Error('assembly_id is required.');

  const { data: assembly, error: loadErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, inventory_mode, image_url')
    .eq('id', assemblyId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load product');
  if (!assembly) throw new Error('Product not found.');
  if (String(assembly.inventory_mode || '').toLowerCase() !== 'finished') {
    throw new Error('Photos can only be attached to finished warehouse products.');
  }
  if (isMattressCatalogProductName(assembly.name)) {
    throw new Error('AI catalog photo retouch is only for furniture. Mattresses are saved without a production photo.');
  }

  const existingUrl = String(assembly.image_url || '').trim();
  if (!forceReupload && existingUrl) {
    const catalogImageUrl = rewriteLegacyProductImageUrl(existingUrl) || existingUrl;
    await sb.from('warehouse_assemblies').update({
      image_url: catalogImageUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', assemblyId);
    const portalResult = await runPendingPortalSetup(sb, body, user, assembly);
    await mirrorCarpentryProductionCatalogToFloor2Wip(sb, assemblyId, catalogImageUrl, {
      body,
      portalResult,
    }).catch((err) => {
      console.warn('[warehouse-production-photo] Floor 2 WIP mirror failed:', err?.message || err);
    });
    const labelResult = await runPendingLabelPrint(sb, body, user, assembly);
    const label_preview_png_base64 = await buildLabelPreviewForAssembly(assembly);
    return {
      assembly_id: assemblyId,
      catalog_image_url: catalogImageUrl,
      assembly: { ...assembly, image_url: catalogImageUrl },
      idempotent: true,
      portal_catalog: portalResult,
      label_preview_png_base64,
      ...labelResult,
    };
  }

  if (!imageBase64) throw new Error('Product photo is required.');
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    throw new Error('Photo is too large. Retake the picture or update the app and try again.');
  }

  const catalogImageUrl = await attachProductionAssemblyCatalogPhoto(sb, {
    assembly,
    imageBase64,
    productName: assembly.name,
    preset,
    skipAiRetouch: false,
    requireAiRetouch: requireAi,
    directCatalogUpload: false,
  });

  if (catalogImageUrl) {
    const { error: saveErr } = await sb.from('warehouse_assemblies').update({
      image_url: catalogImageUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', assemblyId);
    if (saveErr) throw new Error(saveErr.message || 'Failed to save product photo on the web portal.');
  }

  const [portalResult, labelResult, label_preview_png_base64] = await Promise.all([
    runPendingPortalSetup(sb, body, user, assembly),
    runPendingLabelPrint(sb, body, user, assembly),
    buildLabelPreviewForAssembly(assembly),
  ]);

  await mirrorCarpentryProductionCatalogToFloor2Wip(sb, assemblyId, catalogImageUrl, {
    body,
    portalResult,
  }).catch((err) => {
    console.warn('[warehouse-production-photo] Floor 2 WIP mirror failed:', err?.message || err);
  });

  void notifyNewProductionProductWhatsApp({
    user,
    assembly,
    qtyAdded: pendingProductionNotifyQty(body),
    imageUrl: catalogImageUrl,
    preset: body.preset || body.product_preset,
  }).catch((err) => {
    console.warn('[warehouse-production-photo] WhatsApp notify failed:', err?.message || err);
  });

  return {
    assembly_id: assemblyId,
    catalog_image_url: catalogImageUrl,
    assembly: { ...assembly, image_url: catalogImageUrl },
    portal_catalog: portalResult,
    label_preview_png_base64,
    ...labelResult,
  };
}
