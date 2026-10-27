import { createFirestoreServerClient } from './firestoreServerClient.js';
import { attachProductionAssemblyCatalogPhoto } from './productionPacketCatalogPhoto.js';
import { evaluateWarehouseProductionAppAccess } from '../../src/mobile/mobileAccessManifest.js';
import { getLoginAccessRecord } from './loginAccess.js';
import { normalizeMobileAccessGrant } from './mobileAccessDefaults.js';
import { enqueueWarehouseProductionLabelJob } from './productionLabelPrint.js';
import { normalizeWarehousePacketScan } from '../../src/utils/warehouseScanResolver.js';
import { rewriteLegacyProductImageUrl } from '../../src/utils/storageImageUrl.js';

const MAX_IMAGE_BASE64_CHARS = 3_200_000;

function getService() {
  const client = createFirestoreServerClient();
  if (!client) throw new Error('Firebase admin not configured');
  return client;
}

async function assertProductionKioskUser(user) {
  const record = await getLoginAccessRecord(user?.id);
  const grant = normalizeMobileAccessGrant(record?.mobile_access || {}, user?.email);
  if (evaluateWarehouseProductionAppAccess(grant, user?.email)) {
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
  const printedAt = new Date();

  let labelJobId = null;
  let labelPrintWarning = null;
  try {
    labelJobId = await promiseWithTimeout(
      enqueueWarehouseProductionLabelJob(sb, {
        name,
        sku: labelSku,
        qty: labelCopies,
        printedBy: user?.full_name || user?.display_name || user?.email,
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

/**
 * AI catalog photo for a finished warehouse product (Gemini retouch + storage + assembly image_url).
 */
export async function runProductionAssemblyPhotoAttach(body, user) {
  await assertProductionKioskUser(user);
  const sb = getService();
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  const imageBase64 = String(body.image_base64 || body.imageBase64 || '').trim();
  const requireAi = body.require_ai_retouch === true
    || body.requireAiRetouch === true
    || String(body.client_source || '').trim() === 'warehouse_production_app';
  const forceReupload = body.force_reupload === true || body.forceReupload === true;
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

  const existingUrl = String(assembly.image_url || '').trim();
  if (!forceReupload && existingUrl) {
    const catalogImageUrl = rewriteLegacyProductImageUrl(existingUrl) || existingUrl;
    const labelResult = await runPendingLabelPrint(sb, body, user, assembly);
    return {
      assembly_id: assemblyId,
      catalog_image_url: catalogImageUrl,
      assembly: { ...assembly, image_url: catalogImageUrl },
      idempotent: true,
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
    skipAiRetouch: false,
    requireAiRetouch: requireAi,
  });

  const labelResult = await runPendingLabelPrint(sb, body, user, assembly);

  return {
    assembly_id: assemblyId,
    catalog_image_url: catalogImageUrl,
    assembly: { ...assembly, image_url: catalogImageUrl },
    ...labelResult,
  };
}
