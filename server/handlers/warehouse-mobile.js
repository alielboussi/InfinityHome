import { createFirestoreServerClient } from '../lib/firestoreServerClient.js';
import {
  allocateWarehouseDeliveryNumber,
  resetWarehouseDeliveryNumberSequence,
} from '../lib/warehouseDeliveryNumber.js';
import { validateAssemblyShipmentBom, isAssemblyDeliveryFinishedUnits } from '../lib/warehouseMobileBom.js';
import {
  assemblyUsesWarehouseBoxLabels,
  deliveryTruckBoxesToFinishedUnits,
} from '../../src/utils/warehouseDeliveryBoxUnits.js';
import { assemblyUnitsPerCarton } from '../../src/utils/warehouseUnitsPerCarton.js';
import { newUuid } from '../lib/uuid.js';
import {
  normalizeWarehouseSku,
  normalizeWarehouseSkuKey,
} from '../../src/utils/warehouseAssemblyMath.js';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
  resolvePacketFromScan,
} from '../../src/utils/warehouseScanResolver.js';
import { buildPacketsByAssembly } from '../../src/utils/warehouseAssemblyPacketPool.js';
import {
  createCategoryForMobile,
  fetchCatalogForMobile,
  findOrCreateWarehouseColorServer,
  saveAssemblyForMobile,
  savePacketForMobile,
  bulkSyncProductTurkishNames,
  setAssemblyProductQuantityForMobile,
  setPacketQuantityForMobile,
  upsertFinishedAssemblyInventoryQuantity,
} from '../lib/warehouseCatalogMobile.js';
import { purgeWarehouseAssemblyInventoryAndFloorRuns } from '../../src/utils/warehouseAssemblyDelete.js';
import { getLoginAccessRecord, isLoginAccessAdmin } from '../lib/loginAccess.js';
import { buildWarehouseDeliveryWhatsAppMessage } from '../lib/buildWarehouseDeliveryWhatsAppMessage.js';
import { buildWarehouseDeliveryWhatsAppProductGroups } from '../../src/utils/kitweDeliveryWhatsAppAdmin.js';
import { loadWarehouseDeliveryColorContext, createWarehouseDeliveryNameFormatter } from '../lib/warehouseDeliveryNameFormatter.js';
import { sendWarehouseDeliveryWhatsApp } from '../lib/sendWarehouseDeliveryWhatsApp.js';
import { buildWarehouseDeliveryNotePdfBase64 } from '../lib/buildWarehouseDeliveryNotePdfBase64.js';
import { normalizeMobileAccessGrant } from '../lib/mobileAccessDefaults.js';
import {
  evaluateCarpentryWorkshopAppAccess,
  evaluatePaintingWorkshopAppAccess,
  evaluateWarehouseDeliveryDriverAppAccess,
  evaluateWarehouseProductionAppAccess,
  isCatalogLocationPhotoUploadAllowed,
  isCatalogLocationStockIncreaseAllowed,
  isMobileScreenAccessAllowed,
  isWarehouseCatalogAddProductAllowed,
  isWarehouseCatalogLabelPrintAllowed,
  isWarehouseFloor2CreateProductAllowed,
  isWarehouseFloor2CreateSetAllowed,
  isWarehouseProductionAppAllowed,
  isWarehouseProductionKitweDeliveryAllowed,
  isWarehouseProductionOperatorAllowed,
  isWarehouseProductionPhotoUploadAllowed,
  isWarehouseProductStockQtyEditAllowed,
  isWarehouseProductTurkishSyncAllowed,
  isWorkshopOrDeliveryScreenAllowed,
} from '../../src/mobile/mobileAccessManifest.js';
import { canManageCatalog } from '../../src/accessControl.js';
import {
  buildProductionItemName,
  extractProductionBaseName,
  matchProductionGirlNameFromPool,
  normalizeWarehousePacketNameKey,
} from '../../src/utils/productionItemName.js';
import {
  attachProductionAssemblyCatalogPhoto,
  attachProductionPacketCatalogPhoto,
} from '../lib/productionPacketCatalogPhoto.js';
import { suggestUniqueProductionBaseName } from '../lib/productionSuggestBaseName.js';
import { titleCaseWords } from '../../src/utils/titleCaseWords.js';
import {
  recomputeWarehouseLocationStockServer,
  setWarehousePacketQuantityServer,
} from '../lib/warehouseLocationStockRecompute.js';
import {
  getWarehouseProductionLogEntry,
  listRecentProductionBaseNames,
  listWarehouseProductionLog,
  logWarehouseProductionCreate,
  logWarehouseProductionStockIncrease,
  syncWarehouseProductionLogPacketName,
  updateWarehouseProductionLogEntry,
} from '../lib/warehouseProductionLog.js';
import {
  WAREHOUSE_ACCEPT_USER_ID,
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
  deliveryCustomerSentLines,
  warehousePacketDisplayLabel,
} from '../../src/utils/warehouseDelivery.js';
import {
  buildDeliveryPrintGroupsFromEntries,
  printGroupsFromQuoteLines,
  sanitizeDeliveryNotePrintGroups,
  whatsAppProductGroupsFromPrintGroups,
} from '../../src/utils/warehouseDeliveryPrintGroups.js';
import { buildProductionLineSummaryRow } from '../../src/utils/quoteProductionItemFields.js';
import {
  isWarehouseSetDeliveryGroup,
  resolveSetComponentsForDelivery,
} from '../../src/utils/warehouseDeliverySetPrint.js';
import { isWarehouseSetAssembly } from '../../src/utils/warehouseCatalogHierarchy.js';
import { acceptWarehouseDeliveryServer } from '../lib/warehouseDeliveryAccept.js';
import { cancelWarehouseDeliveryServer, deleteWarehouseDeliverySessionHard } from '../lib/cancelWarehouseDelivery.js';
import { assertPacketStockAvailable, assertAssemblyStockAvailable } from '../lib/warehouseDeliveryStock.js';
import {
  listWarehouseDeliveryDrivers,
  saveWarehouseDeliveryDrivers,
} from '../lib/warehouseDeliveryDrivers.js';
import { HASSAN_AWAD } from '../../src/accessControl.js';
import { generateRandomWarehouseSku16 } from '../../src/utils/warehouseRandomSku.js';
import { isMattressCatalogProductName } from '../../src/utils/isMattressCatalogProductName.js';
import { enqueueWarehouseProductionLabelJob } from '../lib/productionLabelPrint.js';
import { LABEL_PHOTO_FLOOR2, resolveLabelPhotoFloor } from '../lib/warehouseLabelPhotoFloor.js';
import { findProductionNameClash } from '../lib/productionCatalogNameCheck.js';
import { runProductionAssemblyPhotoAttach } from '../lib/warehouseProductionPhotoAttach.js';
import {
  acceptWarehouseReturnOrder,
  assertWarehouseReturnCreator,
  assertWarehouseReturnProductionAccess,
  completeWarehouseReturnOrder,
  createWarehouseReturnOrder,
  listKitweReturnProductOptions,
  listReturnQuoteCustomers,
  listWarehouseReturnOrders,
  pauseWarehouseReturnOrder,
  resumeWarehouseReturnOrder,
  prepareReturnShipmentSession,
  prepareReturnCustomerDeliverySession,
  submitReturnCustomerDelivery,
  submitReturnShipment,
  printReturnCustomerPickupLabel,
  listRepairFloor2DeliveriesForCatalog,
  repairFloor2DeliveryAssemblyMap,
} from '../lib/warehouseReturnOrders.js';
import { registerProductionPushToken } from '../lib/productionExpoPush.js';
import {
  assertWarehouseStorageCreator,
  assertWarehouseStorageProductionAccess,
  createManualWarehouseStorageSend,
  getPosSaleDetailForStorage,
  getWarehouseStorageSend,
  listPosSalesForStorage,
  listWarehouseStorageSends,
  prepareWarehouseStorageDelivery,
  reprintWarehouseStorageLabels,
  submitWarehouseStorageDelivery,
  submitWarehouseStorageSend,
  listStorageSendsForSentDeliveries,
  buildSoldDeliverySentDetail,
} from '../lib/warehouseStorageSends.js';
import {
  firebaseStoragePublicUrl,
  uploadBufferToFirebaseStorage,
} from '../lib/firebaseStorage.js';
import {
  buildProductionLabelMeta,
  buildWarehouseProductionLabelPngBase64,
} from '../lib/warehouseProductionLabelImage.js';
import { resolveWarehouseProductionLabelColorForPrint } from '../lib/resolveWarehouseProductionLabelColor.js';
import {
  listProductionPresetsGrouped,
  saveProductionPresetsGrouped,
  buildProductionWhatsAppNotifyPayload,
} from '../lib/warehouseProductionPresets.js';
import { ensureCategoryIdForProductionPreset } from '../lib/productionPresetCategory.js';
import { resolveWarehouseMobileDisplayName } from '../../src/utils/warehouseMobileDisplayName.js';

async function productionWhatsappProducerName(user) {
  const record = await getLoginAccessRecord(user?.id);
  return resolveWarehouseMobileDisplayName(user, record);
}

function queueProductionWhatsAppNotify(payload) {
  import('../lib/sendWarehouseProductionWhatsApp.js')
    .then(({ sendWarehouseProductionWhatsApp }) => sendWarehouseProductionWhatsApp(payload))
    .catch((err) => {
      console.warn('[warehouse-mobile] production WhatsApp failed:', err?.message || err);
    });
}

async function queueProductionWhatsAppNotifyForProduct(sb, base) {
  try {
    const payload = await buildProductionWhatsAppPayload(sb, base);
    queueProductionWhatsAppNotify(payload);
  } catch (err) {
    console.warn('[warehouse-mobile] production WhatsApp routing failed:', err?.message || err);
    queueProductionWhatsAppNotify(base);
  }
}

async function buildProductionWhatsAppPayload(sb, base) {
  return buildProductionWhatsAppNotifyPayload(sb, base);
}

function inferPresetFromCreateBody(body, productName) {
  const explicit = String(body?.preset || body?.product_preset || '').trim();
  if (explicit) return explicit;
  return '';
}

function getService() {
  const client = createFirestoreServerClient();
  if (!client) throw new Error('Firebase admin not configured');
  return client;
}

function warehouseMobileErrorMessage(err) {
  if (!err) return 'Warehouse mobile request failed';
  if (typeof err === 'string') return err;
  const msg = err.message;
  if (typeof msg === 'string' && msg.trim() && msg !== '[object Object]') return msg.trim();
  if (typeof err.details === 'string' && err.details.trim()) return err.details.trim();
  return 'Warehouse mobile request failed';
}

async function requireUser(req) {
  const { verifyBearerUser } = await import('../lib/verifyBearerUser.js');
  return verifyBearerUser(req);
}

async function mobileAccessGrantForUser(user) {
  const record = await getLoginAccessRecord(user?.id, user?.email);
  return normalizeMobileAccessGrant(record?.mobile_access || {}, user?.email);
}

async function assertUniqueSku(sb, sku, { excludeAssemblyId, excludePacketId } = {}) {
  const key = normalizeWarehouseSkuKey(sku);
  if (!key) throw new Error('SKU is required');

  const [{ data: assemblies }, { data: packets }, { data: products }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, family_sku'),
    sb.from('warehouse_packets').select('id, name, sku'),
    sb.from('products').select('id, name, sku'),
  ]);

  const productClash = (assemblies || []).find(
    (r) => normalizeWarehouseSkuKey(r.family_sku) === key
      && String(r.id) !== String(excludeAssemblyId || ''),
  );
  if (productClash) {
    throw new Error(`SKU already used by warehouse product "${productClash.name}".`);
  }
  const packetClash = (packets || []).find(
    (r) => normalizeWarehouseSkuKey(r.sku) === key
      && String(r.id) !== String(excludePacketId || ''),
  );
  if (packetClash) {
    throw new Error(`SKU already used by warehouse packet "${packetClash.name}".`);
  }
  const legacyClash = (products || []).find(
    (r) => normalizeWarehouseSkuKey(r.sku) === key,
  );
  if (legacyClash) {
    throw new Error(`SKU already used by catalog product "${legacyClash.name}".`);
  }
}

async function opGenerateUniqueSku(body) {
  const sb = getService();
  const exclude = {
    excludeAssemblyId: body.exclude_assembly_id || body.excludeAssemblyId,
    excludePacketId: body.exclude_packet_id || body.excludePacketId,
  };
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const sku = generateRandomWarehouseSku16();
    try {
      await assertUniqueSku(sb, sku, exclude);
      return { sku };
    } catch (err) {
      const msg = String(err?.message || '');
      if (!msg.toLowerCase().includes('already used') && !msg.includes('SKU')) {
        throw err;
      }
    }
  }
  throw new Error('Could not generate a unique SKU. Try again.');
}

async function opScanResolve(body) {
  const scan = String(body.scan || '').trim();
  if (!scan) throw new Error('Scan value is required.');
  const { parseProductPhotoQrSku, productionScanResolveCandidates } = await import(
    '../../src/utils/productionLabelQrScan.js'
  );
  const sb = getService();
  const assemblyFields = 'id, name, family_sku, packet_count, image_url, dim_length, dim_width, dim_height, category_id, inventory_mode';
  const [{ data: packets }, { data: assemblies }] = await Promise.all([
    sb.from('warehouse_packets').select('id, sku, name, packet_number, assembly_id, qty_per_unit'),
    sb.from('warehouse_assemblies').select(assemblyFields),
  ]);
  let packet = null;
  for (const candidate of productionScanResolveCandidates(scan)) {
    packet = resolvePacketFromScan(candidate, packets || []);
    if (packet) break;
  }
  if (!packet) {
    const photoSku = parseProductPhotoQrSku(scan);
    if (photoSku) {
      packet = (packets || []).find(
        (p) => String(p.sku || '').toUpperCase() === photoSku.toUpperCase(),
      ) || null;
    }
  }
  if (!packet) {
    const nameKey = normalizeWarehousePacketNameKey(scan);
    if (nameKey) {
      packet = (packets || []).find(
        (p) => normalizeWarehousePacketNameKey(p.name) === nameKey,
      ) || null;
    }
  }
  if (packet) {
    const assembly = packet.assembly_id
      ? (assemblies || []).find((a) => String(a.id) === String(packet.assembly_id))
      : null;
    return { kind: 'packet', packet, assembly };
  }
  let assembly = null;
  for (const candidate of productionScanResolveCandidates(scan)) {
    const productKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(candidate));
    assembly = (assemblies || []).find((a) => {
      const stored = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(a.family_sku));
      for (const k of productKeys) {
        if (k && stored.has(k)) return true;
      }
      return false;
    });
    if (assembly) break;
  }
  if (assembly) {
    return { kind: 'assembly', assembly };
  }
  return { kind: 'unknown', scan };
}

async function assertProductionKioskUser(user) {
  const grant = await mobileAccessGrantForUser(user);
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

async function assertCarpentryWorkshopUser(user) {
  const grant = await mobileAccessGrantForUser(user);
  if (evaluateCarpentryWorkshopAppAccess(grant, user?.email)) {
    return grant;
  }
  const err = new Error('You do not have access to the carpentry workshop app.');
  err.status = 403;
  throw err;
}

async function assertPaintingWorkshopUser(user) {
  const grant = await mobileAccessGrantForUser(user);
  if (evaluatePaintingWorkshopAppAccess(grant, user?.email)) {
    return grant;
  }
  const err = new Error('You do not have access to the painting workshop app.');
  err.status = 403;
  throw err;
}

/** Catalog portal + production app — same Zebra / worker label template. */
async function assertWarehouseLabelPrintUser(user) {
  if (canManageCatalog(user) || isLoginAccessAdmin(user?.email)) {
    return;
  }
  const grant = await mobileAccessGrantForUser(user);
  if (isWarehouseCatalogLabelPrintAllowed(grant)) {
    return;
  }
  await assertProductionKioskUser(user);
}

async function assertUniquePacketName(sb, name, { excludePacketId } = {}) {
  const key = normalizeWarehousePacketNameKey(name);
  if (!key) throw new Error('Name is required');
  const { data, error } = await sb.from('warehouse_packets').select('id, name');
  if (error) throw new Error(error.message || 'Failed to validate packet name');
  const clash = (data || []).find(
    (row) => normalizeWarehousePacketNameKey(row.name) === key
      && String(row.id) !== String(excludePacketId || ''),
  );
  if (clash) {
    throw new Error(`A packet named "${clash.name}" already exists.`);
  }
}

async function assertUniqueAssemblyName(sb, name, { excludeAssemblyId } = {}) {
  const key = normalizeWarehousePacketNameKey(name);
  if (!key) throw new Error('Name is required');
  const { data, error } = await sb.from('warehouse_assemblies').select('id, name');
  if (error) throw new Error(error.message || 'Failed to validate product name');
  const clash = (data || []).find(
    (row) => normalizeWarehousePacketNameKey(row.name) === key
      && String(row.id) !== String(excludeAssemblyId || ''),
  );
  if (clash) {
    throw new Error(`A product named "${clash.name}" already exists.`);
  }
}

async function assertUniqueProductionProductName(sb, name, { excludePacketId, excludeAssemblyId } = {}) {
  await assertUniquePacketName(sb, name, { excludePacketId });
  await assertUniqueAssemblyName(sb, name, { excludeAssemblyId });
}

async function opProductionPushRegister(body, user) {
  if (!user?.email && !user?.id) throw new Error('Authentication required.');
  const appTarget = String(body.app_target || body.appTarget || 'upholstery').trim().toLowerCase();
  return registerProductionPushToken({
    userId: user?.id || user?.uid,
    email: user?.email,
    expoPushToken: body.expo_push_token,
    appTarget,
    pushPrefs: body.push_prefs || body.pushPrefs || null,
  });
}

async function opProductionAccessSelf(user) {
  const grant = await mobileAccessGrantForUser(user);
  const record = await getLoginAccessRecord(user?.id);
  return {
    allowed: evaluateWarehouseProductionAppAccess(grant, user?.email),
    display_name: record?.mobile_display_name || record?.display_name || user?.full_name || user?.email || null,
    grant,
  };
}

async function opCarpentryAccessSelf(user) {
  const grant = await mobileAccessGrantForUser(user);
  const record = await getLoginAccessRecord(user?.id);
  return {
    allowed: evaluateCarpentryWorkshopAppAccess(grant, user?.email),
    display_name: record?.mobile_display_name || record?.display_name || user?.full_name || user?.email || null,
    grant,
  };
}

async function opPaintingAccessSelf(user) {
  const grant = await mobileAccessGrantForUser(user);
  const record = await getLoginAccessRecord(user?.id);
  return {
    allowed: evaluatePaintingWorkshopAppAccess(grant, user?.email),
    display_name: record?.mobile_display_name || record?.display_name || user?.full_name || user?.email || null,
    grant,
  };
}

async function opDeliveryAccessSelf(user) {
  const grant = await mobileAccessGrantForUser(user);
  const record = await getLoginAccessRecord(user?.id);
  return {
    allowed: evaluateWarehouseDeliveryDriverAppAccess(grant, user?.email),
    display_name: record?.mobile_display_name || record?.display_name || user?.full_name || user?.email || null,
    grant,
  };
}

async function opOrdersAccessSelf(user) {
  const grant = await mobileAccessGrantForUser(user);
  const { opOrdersAccessSelf: run } = await import('../lib/ordersAppMobile.js');
  return run(user, grant);
}

async function withOrdersApp(user, fn) {
  const grant = await mobileAccessGrantForUser(user);
  const { assertOrdersAppUser } = await import('../lib/ordersAppMobile.js');
  await assertOrdersAppUser(user, grant);
  return fn(getService());
}

async function opCarpentryCatalogList(user) {
  await assertCarpentryWorkshopUser(user);
  const sb = createFirestoreServerClient();
  const { data: assemblies, error } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, item_kind, metadata');
  if (error) throw new Error(error.message || 'Failed to load carpentry catalog');
  const { listCarpentryCatalogProducts } = await import('../lib/carpentryCatalog.js');
  return { carpentryProducts: listCarpentryCatalogProducts(assemblies || []) };
}

async function opUpholsteryCatalogList(user) {
  await assertProductionKioskUser(user);
  const sb = getService();
  const { data: assemblies, error } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, item_kind, metadata');
  if (error) throw new Error(error.message || 'Failed to load upholstery catalog');
  const { listUpholsteryCatalogProducts } = await import('../lib/upholsteryCatalog.js');
  return { products: listUpholsteryCatalogProducts(assemblies || []) };
}

async function opUpholsteryManufactureList(user) {
  await assertProductionKioskUser(user);
  const sb = getService();
  const { listUpholsteryManufactureCandidates } = await import('../lib/upholsteryManufacture.js');
  return listUpholsteryManufactureCandidates(sb);
}

async function opUpholsteryManufacture(body, user) {
  await assertProductionKioskUser(user);
  const rawAssemblyId = String(body.raw_assembly_id || body.rawAssemblyId || body.assembly_id || '').trim();
  if (!rawAssemblyId) throw new Error('raw_assembly_id required');
  const productQty = Math.max(1, Math.floor(Number(body.product_qty ?? body.productQty) || 1));
  const sb = getService();
  const { executeUpholsteryManufacture } = await import('../lib/upholsteryManufacture.js');
  const result = await executeUpholsteryManufacture(sb, {
    rawAssemblyId,
    productQty,
    userId: user?.id || user?.uid,
  });
  try {
    const { notifyProductionManufactureJob } = await import('../lib/productionExpoPush.js');
    await notifyProductionManufactureJob({ channel: 'upholstery', job: result?.job });
  } catch (pushErr) {
    console.warn('[warehouse-mobile] upholstery manufacture job push notify failed:', pushErr?.message || pushErr);
  }
  return result;
}

async function opUpholsteryFloor2WipPhotoUpload(body, user) {
  const grant = await assertProductionKioskUser(user);
  if (
    !isWarehouseProductionPhotoUploadAllowed(grant, user?.email)
    && !canManageCatalog(user)
    && !isLoginAccessAdmin(user?.email)
  ) {
    const err = new Error('Picture upload is disabled for your account in User Access.');
    err.status = 403;
    throw err;
  }
  const assemblyId = String(
    body.raw_assembly_id || body.rawAssemblyId || body.assembly_id || body.assemblyId || '',
  ).trim();
  const imageBase64 = String(body.image_base64 || body.imageBase64 || '').trim();
  if (!assemblyId) throw new Error('raw_assembly_id is required.');
  if (!imageBase64) throw new Error('Photo is required.');
  if (imageBase64.length > 3_200_000) {
    throw new Error('Photo is too large. Try taking a closer or smaller image.');
  }

  const sb = getService();
  const { data: existing, error: loadErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, metadata')
    .eq('id', assemblyId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load product');
  if (!existing) throw new Error('Product not found.');

  const { jpegBufferFromCatalogDirectUpload } = await import('../lib/catalogDirectPhotoUpload.js');
  const { mergeWarehouseFloor2WipImageMetadata } = await import('../../src/utils/warehouseFloor2WipImage.js');
  const jpeg = await jpegBufferFromCatalogDirectUpload(imageBase64);
  const objectPath = `warehouse-assemblies/${assemblyId}/floor2-wip/main-${Date.now()}.jpg`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: 'productimages',
    objectPath,
    buffer: jpeg,
    contentType: 'image/jpeg',
    cacheControl: '86400',
  });
  const publicUrl = firebaseStoragePublicUrl('productimages', objectPath);
  if (!publicUrl) throw new Error('Failed to resolve public image URL.');

  const now = new Date().toISOString();
  const metadata = mergeWarehouseFloor2WipImageMetadata(existing.metadata, publicUrl);
  const { error: updErr } = await sb
    .from('warehouse_assemblies')
    .update({ metadata, updated_at: now })
    .eq('id', assemblyId);
  if (updErr) throw new Error(updErr.message || 'Failed to save Floor 2 WIP photo');

  return {
    assembly_id: assemblyId,
    raw_assembly_id: assemblyId,
    image_url: publicUrl,
  };
}

function storeroomScreenIdForIndex(index) {
  const n = Math.floor(Number(index) || 0);
  if (n === 1) return 'warehouse_storeroom_1';
  if (n === 2) return 'warehouse_storeroom_2';
  if (n === 3) return 'warehouse_storeroom_3';
  return '';
}

async function assertCatalogScreenViewUser(user, screenId) {
  if (canManageCatalog(user) || isLoginAccessAdmin(user?.email)) {
    return mobileAccessGrantForUser(user);
  }
  const grant = await mobileAccessGrantForUser(user);
  if (isMobileScreenAccessAllowed(grant, screenId)) {
    return grant;
  }
  const err = new Error('You do not have access to this page in User Access.');
  err.status = 403;
  throw err;
}

async function opCatalogFloor2List(user, { carpentryWorkshop = false, productionKiosk = false } = {}) {
  if (carpentryWorkshop) {
    await assertCarpentryWorkshopUser(user);
  } else if (productionKiosk) {
    await assertProductionKioskUser(user);
  } else {
    await assertCatalogScreenViewUser(user, 'warehouse_floor_2');
  }
  const sb = getService();
  const { resolveWarehouseFloor2Location } = await import('../../src/constants/warehouseFloorLocations.js');
  const { readWarehouseFloor2WipImageUrl } = await import('../../src/utils/warehouseFloor2WipImage.js');

  const [{ data: assemblies, error: aErr }, { data: locRows, error: locErr }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, family_sku, item_kind, metadata, category_id, image_url, dim_length, dim_width, dim_height'),
    sb.from('locations').select('id, name'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load catalog');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  if (!floor2Loc?.id) {
    return { products: [], floor2Missing: true };
  }
  const floor2Id = String(floor2Loc.id);
  const { data: invRows, error: invErr } = await sb
    .from('warehouse_assembly_inventory')
    .select('assembly_id, quantity')
    .eq('location_id', floor2Id);
  if (invErr) throw new Error(invErr.message || 'Failed to load Floor 2 stock');
  const allRows = assemblies || [];
  const { buildCarpentryFinishingCandidates } = await import('../../src/utils/carpentryFinishingView.js');
  const floor2Inv = (invRows || []).map((row) => ({ ...row, location_id: floor2Id }));
  const candidates = buildCarpentryFinishingCandidates(allRows, floor2Inv, floor2Id);
  const asmById = new Map(allRows.map((row) => [String(row.id), row]));
  const products = candidates.map((row) => {
    const aid = String(row.assembly_id || row.id);
    const asm = asmById.get(aid);
    const wipImage = readWarehouseFloor2WipImageUrl(asm || row);
    const floor2SetName = String(asm?.metadata?.floor2_set_name || '').trim();
    return {
      id: aid,
      assembly_id: aid,
      raw_assembly_id: aid,
      name: String(row.name || aid).trim(),
      raw_name: String(row.name || aid).trim(),
      family_sku: String(row.family_sku || '').trim(),
      quantity: row.floor2_qty,
      floor2_qty: row.floor2_qty,
      image_url: wipImage,
      floor2_image_url: wipImage,
      floor2_set_name: floor2SetName || undefined,
      dim_length: asm?.dim_length ?? null,
      dim_width: asm?.dim_width ?? null,
      dim_height: asm?.dim_height ?? null,
    };
  });
  return { products, floor2_location_id: floor2Id };
}

function parseCatalogAssemblyDimField(raw, fieldName) {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error(`Invalid value for ${fieldName}`);
    err.status = 400;
    throw err;
  }
  return n;
}

async function opCatalogFloor2UpdateDimensions(body, user) {
  await assertCatalogScreenViewUser(user, 'warehouse_floor_2');
  const grant = await mobileAccessGrantForUser(user);
  if (
    !isWarehouseProductStockQtyEditAllowed(grant)
    && !canManageCatalog(user)
    && !isLoginAccessAdmin(user?.email)
  ) {
    const err = new Error('Editing product dimensions is disabled for your account in User Access.');
    err.status = 403;
    throw err;
  }
  const assemblyId = String(
    body.assembly_id || body.assemblyId || '',
  ).trim();
  if (!assemblyId) throw new Error('assembly_id is required.');
  const patch = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, 'dim_length') || Object.prototype.hasOwnProperty.call(body, 'dimLength')) {
    patch.dim_length = parseCatalogAssemblyDimField(body.dim_length ?? body.dimLength, 'dim_length');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'dim_width') || Object.prototype.hasOwnProperty.call(body, 'dimWidth')) {
    patch.dim_width = parseCatalogAssemblyDimField(body.dim_width ?? body.dimWidth, 'dim_width');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'dim_height') || Object.prototype.hasOwnProperty.call(body, 'dimHeight')) {
    patch.dim_height = parseCatalogAssemblyDimField(body.dim_height ?? body.dimHeight, 'dim_height');
  }
  if (Object.keys(patch).length <= 1) throw new Error('At least one dimension (dim_length, dim_width, dim_height) is required.');
  const sb = getService();
  const { data, error } = await sb
    .from('warehouse_assemblies')
    .update(patch)
    .eq('id', assemblyId)
    .select('id, dim_length, dim_width, dim_height')
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to save dimensions');
  if (!data?.id) throw new Error('Product not found.');
  return {
    assembly_id: String(data.id),
    dim_length: data.dim_length,
    dim_width: data.dim_width,
    dim_height: data.dim_height,
  };
}

async function opCatalogFloor2StockIncrease(body, user, { carpentryWorkshop = false } = {}) {
  if (carpentryWorkshop) {
    await assertCarpentryWorkshopUser(user);
  } else {
    const grant = await assertCatalogScreenViewUser(user, 'warehouse_floor_2');
    if (
      !isCatalogLocationStockIncreaseAllowed(grant, 'warehouse_floor_2', user?.email)
      && !canManageCatalog(user)
      && !isLoginAccessAdmin(user?.email)
    ) {
      const err = new Error('Floor 2 stock qty adjustment is disabled for your account in User Access.');
      err.status = 403;
      throw err;
    }
  }
  const assemblyId = String(
    body.assembly_id || body.assemblyId || body.raw_assembly_id || body.rawAssemblyId || '',
  ).trim();
  const delta = Math.floor(Number(body.delta ?? body.quantity ?? body.product_qty ?? 0));
  if (!assemblyId) throw new Error('assembly_id is required.');
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Enter a non-zero quantity to add or decrease.');
  }
  const sb = getService();
  if (delta > 0) {
    const { addFloor1ProductToFloor2 } = await import('../lib/carpentryManufacture.js');
    const res = await addFloor1ProductToFloor2(sb, {
      assemblyId,
      productQty: delta,
      userId: user?.id || user?.uid || null,
    });
    const { data: inv } = await sb
      .from('warehouse_assembly_inventory')
      .select('quantity')
      .eq('assembly_id', assemblyId)
      .eq('location_id', res.floor2_location_id)
      .maybeSingle();
    return {
      ...res,
      quantity: Math.max(0, Math.floor(Number(inv?.quantity) || 0)),
    };
  }
  const { resolveWarehouseFloor2Location } = await import('../../src/constants/warehouseFloorLocations.js');
  const { setFloor2ProductStockQty } = await import('../lib/carpentryManufacture.js');
  const { data: locRows } = await sb.from('locations').select('id, name');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : WAREHOUSE_FROM_LOCATION_ID;
  const { data: inv } = await sb
    .from('warehouse_assembly_inventory')
    .select('quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', floor2Id)
    .maybeSingle();
  const currentQty = Math.max(0, Math.floor(Number(inv?.quantity) || 0));
  const nextQty = Math.max(0, currentQty + delta);
  return setFloor2ProductStockQty(sb, {
    assemblyId,
    quantity: nextQty,
  });
}

async function opCatalogFloor2CreateProduct(body, user, { carpentryWorkshop = false } = {}) {
  if (carpentryWorkshop) {
    await assertCarpentryWorkshopUser(user);
  } else {
    const grant = await assertCatalogScreenViewUser(user, 'warehouse_floor_2');
    if (
      !isWarehouseFloor2CreateProductAllowed(grant, user?.email)
      && !canManageCatalog(user)
      && !isLoginAccessAdmin(user?.email)
    ) {
      const err = new Error('Creating Floor 2 products (+ Prod) is disabled for your account in User Access.');
      err.status = 403;
      throw err;
    }
  }

  const rawName = String(body.name || '').trim();
  const baseName = String(body.base_name || body.baseName || '').trim();
  const preset = String(body.preset || '').trim();
  const finalName = titleCaseWords(rawName || buildProductionItemName(baseName, preset));
  if (!finalName) throw new Error('Product name is required.');

  const initialQty = Math.max(0, Math.floor(Number(body.quantity ?? body.initial_quantity ?? 0) || 0));
  const sb = getService();

  const generated = await opGenerateUniqueSku({});
  const familySku = normalizeWarehouseProductSku(generated.sku);
  const bodyCategoryId = String(body.category_id ?? body.categoryId ?? '').trim();
  let categoryId = bodyCategoryId || null;
  if (!categoryId && preset) {
    categoryId = await ensureCategoryIdForProductionPreset(sb, preset);
  }

  const { requireWarehouseFloor2Location } = await import('../lib/productionFloor1StockPolicy.js');
  const { mergeWarehouseFloor2WipImageMetadata } = await import('../../src/utils/warehouseFloor2WipImage.js');
  const { saveCarpentryProductSelection } = await import('../lib/carpentryCatalog.js');
  const { data: locRows, error: locErr } = await sb.from('locations').select('id, name');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations.');
  const floor2Id = requireWarehouseFloor2Location(locRows || []);

  const assembly = await saveAssemblyForMobile(sb, {
    name: finalName,
    family_sku: familySku,
    category_id: categoryId,
    warehouse_location_id: floor2Id,
    inventory_mode: 'finished',
    packet_count: null,
    packet_links: [],
    location_ids: [],
    units_per_carton: 1,
  });
  const assemblyId = String(assembly.id || '');
  if (!assemblyId) throw new Error('Failed to create product.');

  await saveCarpentryProductSelection(sb, assemblyId, true);

  let imageUrl = '';
  const imageBase64 = String(body.image_base64 || body.imageBase64 || '').trim();
  if (imageBase64) {
    const { attachProductionAssemblyCatalogPhoto } = await import('../lib/productionPacketCatalogPhoto.js');
    const { data: freshAsm } = await sb
      .from('warehouse_assemblies')
      .select('id, name, family_sku, metadata, image_url')
      .eq('id', assemblyId)
      .maybeSingle();
    imageUrl = await attachProductionAssemblyCatalogPhoto(sb, {
      assembly: freshAsm || assembly,
      imageBase64,
      productName: finalName,
      preset,
      skipAiRetouch: false,
      requireAiRetouch: carpentryWorkshop,
      directCatalogUpload: !carpentryWorkshop,
    });
    const { data: afterPhoto } = await sb
      .from('warehouse_assemblies')
      .select('metadata')
      .eq('id', assemblyId)
      .maybeSingle();
    const metadata = mergeWarehouseFloor2WipImageMetadata(afterPhoto?.metadata || freshAsm?.metadata, imageUrl);
    const { error: metaErr } = await sb
      .from('warehouse_assemblies')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', assemblyId);
    if (metaErr) throw new Error(metaErr.message || 'Failed to save product photo.');
  }

  const now = new Date().toISOString();
  const { error: invErr } = await sb.from('warehouse_assembly_inventory').upsert({
    assembly_id: assemblyId,
    location_id: floor2Id,
    quantity: initialQty,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
  if (invErr) throw new Error(invErr.message || 'Failed to save Floor 2 quantity.');

  await recomputeWarehouseLocationStockServer(sb, floor2Id);

  try {
    const { addFloor2ProductToFloor1 } = await import('../lib/carpentryManufacture.js');
    await addFloor2ProductToFloor1(sb, {
      assemblyId,
      productQty: 0,
      userId: user?.id || user?.uid || null,
      ensureInventoryRow: true,
    });
  } catch (mirrorErr) {
    console.warn('[catalog-floor2-create-product] Floor 1 mirror failed:', mirrorErr?.message || mirrorErr);
  }

  const clientSource = carpentryWorkshop ? 'carpentry_workshop_app' : 'warehouse_floor_2';
  const labelSku = normalizeWarehousePacketScan(familySku) || familySku;
  const labelCopies = Math.max(0, Math.floor(Number(initialQty) || 0));
  const deferLabels = Boolean(carpentryWorkshop && !imageBase64 && labelCopies > 0);
  const printedAt = new Date();
  const labelPrintedBy = (await productionWhatsappProducerName(user)) || 'Carpentry workshop';
  let labelJobId = null;
  let labelPrintWarning = null;
  if (carpentryWorkshop && labelCopies > 0 && !deferLabels) {
    try {
      labelJobId = await enqueueWarehouseProductionLabelJob(sb, {
        name: finalName,
        sku: labelSku,
        qty: labelCopies,
        printedBy: labelPrintedBy,
        source: clientSource,
        printedAt,
        photoFloor: clientSource === 'warehouse_floor_2' ? LABEL_PHOTO_FLOOR2 : undefined,
      });
      if (!labelJobId) {
        labelPrintWarning = 'Item saved but labels were not sent to the printer (Zebra Weblink is not configured on the server).';
      }
    } catch (printErr) {
      const { formatZebraPrintError } = await import('../lib/formatZebraPrintError.js');
      labelPrintWarning = formatZebraPrintError(printErr);
      console.warn('[warehouse-mobile] carpentry floor2 label print failed:', printErr?.message || printErr);
    }
  }

  const preview = carpentryWorkshop && labelCopies > 0
    ? await buildProductionLabelPreviewPayload({
      name: finalName,
      sku: labelSku,
      printedAt,
      skipPng: deferLabels,
      photoFloor: LABEL_PHOTO_FLOOR2,
    })
    : { label: null, label_preview_png_base64: null };

  return {
    product: {
      id: assemblyId,
      assembly_id: assemblyId,
      raw_assembly_id: assemblyId,
      name: finalName,
      raw_name: finalName,
      family_sku: familySku,
      quantity: initialQty,
      floor2_qty: initialQty,
      image_url: imageUrl,
      family_image_url: '',
    },
  ...(carpentryWorkshop
    ? {
      label_copies: labelCopies,
      label_job_id: labelJobId,
      label_print_warning: labelPrintWarning,
      pending_label_print: deferLabels
        ? {
          name: finalName,
          sku: labelSku,
          qty: labelCopies,
          client_source: clientSource,
        }
        : null,
      label: preview.label,
      label_preview_png_base64: preview.label_preview_png_base64,
    }
    : {}),
  };
}

async function opCatalogFloor2CreateSet(body, user) {
  const grant = await assertCatalogScreenViewUser(user, 'warehouse_floor_2');
  if (
    !isWarehouseFloor2CreateSetAllowed(grant, user?.email)
    && !canManageCatalog(user)
    && !isLoginAccessAdmin(user?.email)
  ) {
    const err = new Error('Creating Floor 2 sets (+ Set) is disabled for your account in User Access.');
    err.status = 403;
    throw err;
  }

  const baseName = titleCaseWords(String(body.base_name || body.baseName || body.name || '').trim());
  if (!baseName) throw new Error('Family base name is required.');

  const rawComponents = Array.isArray(body.components) ? body.components : [];
  const presetsFromBody = Array.isArray(body.presets) ? body.presets : [];
  const normalizedComponents = rawComponents.length
    ? rawComponents
      .map((c) => {
        const hasQty = c?.quantity !== undefined && c?.quantity !== null && String(c?.quantity).trim() !== ''
          || (c?.qty !== undefined && c?.qty !== null && String(c?.qty).trim() !== '');
        return {
          assembly_id: String(c?.assembly_id || c?.assemblyId || c?.id || '').trim(),
          preset: String(c?.preset || '').trim(),
          name: String(c?.name || '').trim(),
          hasQty,
          quantity: hasQty ? Math.max(0, Math.floor(Number(c?.quantity ?? c?.qty ?? 0) || 0)) : null,
        };
      })
      .filter((c) => c.assembly_id || c.preset || c.name)
    : presetsFromBody
      .map((p) => ({
        assembly_id: '',
        preset: String(p || '').trim(),
        name: '',
        hasQty: true,
        quantity: Math.max(0, Math.floor(Number(body.quantity ?? 0) || 0)),
      }))
      .filter((c) => c.preset);

  if (!normalizedComponents.length) {
    throw new Error('Select at least one product for the set.');
  }

  const sb = getService();
  const { resolveWarehouseFloor2Location } = await import('../../src/constants/warehouseFloorLocations.js');
  const {
    mergeWarehouseFloor2WipImageMetadata,
    readWarehouseFloor2WipImageUrl,
  } = await import('../../src/utils/warehouseFloor2WipImage.js');
  const { data: locRows } = await sb.from('locations').select('id, name');
  const floor2Loc = resolveWarehouseFloor2Location(locRows || []);
  const floor2Id = floor2Loc?.id ? String(floor2Loc.id) : WAREHOUSE_FROM_LOCATION_ID;

  let uploadedCoverUrl = '';
  const imageBase64 = String(body.image_base64 || body.imageBase64 || '').trim();
  if (imageBase64) {
    const { jpegBufferFromCatalogDirectUpload } = await import('../lib/catalogDirectPhotoUpload.js');
    const jpeg = await jpegBufferFromCatalogDirectUpload(imageBase64);
    const objectPath = `warehouse-assemblies/floor2-set-cover/${Date.now()}-${baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
    await uploadBufferToFirebaseStorage({
      bucketFolder: 'productimages',
      objectPath,
      buffer: jpeg,
      contentType: 'image/jpeg',
      cacheControl: '86400',
    });
    uploadedCoverUrl = firebaseStoragePublicUrl('productimages', objectPath) || '';
  }

  const createdProducts = [];
  const now = new Date().toISOString();

  for (const comp of normalizedComponents) {
    if (comp.assembly_id) {
      const { data: existingAsm } = await sb
        .from('warehouse_assemblies')
        .select('id, name, family_sku, metadata')
        .eq('id', comp.assembly_id)
        .maybeSingle();
      if (!existingAsm?.id) continue;
      const aid = String(existingAsm.id);
      const compName = String(existingAsm.name || comp.name || aid).trim();
      let metadata = {
        ...(existingAsm.metadata || {}),
        floor2_set_name: baseName,
        carpentry: {
          ...(existingAsm.metadata?.carpentry || {}),
          selected: true,
        },
      };
      if (uploadedCoverUrl) {
        metadata = mergeWarehouseFloor2WipImageMetadata(metadata, uploadedCoverUrl);
      }
      await sb
        .from('warehouse_assemblies')
        .update({ metadata, updated_at: now })
        .eq('id', aid);

      let finalQty = 0;
      if (comp.hasQty && comp.quantity !== null) {
        finalQty = comp.quantity;
        await sb.from('warehouse_assembly_inventory').upsert({
          assembly_id: aid,
          location_id: floor2Id,
          quantity: finalQty,
          updated_at: now,
        }, { onConflict: 'assembly_id,location_id' });
      } else {
        const { data: invRow } = await sb
          .from('warehouse_assembly_inventory')
          .select('quantity')
          .eq('assembly_id', aid)
          .eq('location_id', floor2Id)
          .maybeSingle();
        finalQty = Math.max(0, Math.floor(Number(invRow?.quantity) || 0));
      }

      createdProducts.push({
        id: aid,
        assembly_id: aid,
        raw_assembly_id: aid,
        name: compName,
        raw_name: compName,
        family_sku: String(existingAsm.family_sku || '').trim(),
        quantity: finalQty,
        floor2_qty: finalQty,
        image_url: readWarehouseFloor2WipImageUrl({ metadata }) || '',
        floor2_set_name: baseName,
      });
      continue;
    }

    const compName = titleCaseWords(comp.name || buildProductionItemName(baseName, comp.preset));
    if (!compName) continue;
    const generated = await opGenerateUniqueSku({});
    const familySku = normalizeWarehouseProductSku(generated.sku);
    const categoryId = comp.preset ? await ensureCategoryIdForProductionPreset(sb, comp.preset) : null;

    const assembly = await saveAssemblyForMobile(sb, {
      name: compName,
      family_sku: familySku,
      category_id: categoryId,
      warehouse_location_id: WAREHOUSE_FROM_LOCATION_ID,
      inventory_mode: 'finished',
      packet_count: null,
      packet_links: [],
      location_ids: [],
      units_per_carton: 1,
    });
    const assemblyId = String(assembly.id || '');
    if (!assemblyId) continue;

    let metadata = {
      ...(assembly.metadata || {}),
      floor2_set_name: baseName,
      carpentry: {
        ...(assembly.metadata?.carpentry || {}),
        selected: true,
      },
    };
    if (uploadedCoverUrl) {
      metadata = mergeWarehouseFloor2WipImageMetadata(metadata, uploadedCoverUrl);
    }

    await sb
      .from('warehouse_assemblies')
      .update({ metadata, updated_at: now })
      .eq('id', assemblyId);

    const compQty = Math.max(0, Number(comp.quantity) || 0);
    await sb.from('warehouse_assembly_inventory').upsert({
      assembly_id: assemblyId,
      location_id: floor2Id,
      quantity: compQty,
      updated_at: now,
    }, { onConflict: 'assembly_id,location_id' });

    createdProducts.push({
      id: assemblyId,
      assembly_id: assemblyId,
      raw_assembly_id: assemblyId,
      name: compName,
      raw_name: compName,
      family_sku: familySku,
      quantity: compQty,
      floor2_qty: compQty,
      image_url: uploadedCoverUrl || readWarehouseFloor2WipImageUrl({ metadata }) || '',
      floor2_set_name: baseName,
    });
  }

  await recomputeWarehouseLocationStockServer(sb, floor2Id);

  return {
    products: createdProducts,
    family_base: baseName,
    image_url: uploadedCoverUrl,
  };
}

async function opCatalogFloor2PhotoUpload(body, user, { carpentryWorkshop = false } = {}) {
  if (carpentryWorkshop) {
    await assertCarpentryWorkshopUser(user);
  } else {
    const grant = await assertCatalogScreenViewUser(user, 'warehouse_floor_2');
    if (
      !isCatalogLocationPhotoUploadAllowed(grant, 'warehouse_floor_2', user?.email)
      && !canManageCatalog(user)
      && !isLoginAccessAdmin(user?.email)
    ) {
      const err = new Error('Floor 2 image upload is disabled for your account in User Access.');
      err.status = 403;
      throw err;
    }
  }
  const assemblyId = String(
    body.assembly_id || body.assemblyId || body.raw_assembly_id || body.rawAssemblyId || '',
  ).trim();
  const imageBase64 = String(body.image_base64 || body.imageBase64 || '').trim();
  if (!assemblyId) throw new Error('assembly_id is required.');
  if (!imageBase64) throw new Error('Photo is required.');
  if (imageBase64.length > 3_200_000) {
    throw new Error('Photo is too large. Try selecting a smaller image.');
  }

  const sb = getService();
  const { data: existing, error: loadErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, metadata')
    .eq('id', assemblyId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load product');
  if (!existing) throw new Error('Product not found.');

  const { jpegBufferFromCatalogDirectUpload } = await import('../lib/catalogDirectPhotoUpload.js');
  const { mergeWarehouseFloor2WipImageMetadata } = await import('../../src/utils/warehouseFloor2WipImage.js');
  const jpeg = await jpegBufferFromCatalogDirectUpload(imageBase64);
  const objectPath = `warehouse-assemblies/${assemblyId}/floor2-wip/main-${Date.now()}.jpg`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: 'productimages',
    objectPath,
    buffer: jpeg,
    contentType: 'image/jpeg',
    cacheControl: '86400',
  });
  const publicUrl = firebaseStoragePublicUrl('productimages', objectPath);
  if (!publicUrl) throw new Error('Failed to resolve public image URL.');

  const now = new Date().toISOString();
  const metadata = mergeWarehouseFloor2WipImageMetadata(existing.metadata, publicUrl);
  const { error: updErr } = await sb
    .from('warehouse_assemblies')
    .update({ metadata, updated_at: now })
    .eq('id', assemblyId);
  if (updErr) throw new Error(updErr.message || 'Failed to save Floor 2 photo');

  return {
    assembly_id: assemblyId,
    image_url: publicUrl,
  };
}

async function purgeFloor2WipStorageObjects(assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) return;
  try {
    const admin = (await import('firebase-admin')).default;
    const { getFirebaseAdminApp } = await import('../lib/firebaseAdmin.js');
    const app = getFirebaseAdminApp();
    if (!app) return;
    const bucketName = String(
      process.env.FIREBASE_STORAGE_BUCKET
      || process.env.REACT_APP_FIREBASE_STORAGE_BUCKET
      || '',
    ).trim();
    const gcs = bucketName ? admin.storage().bucket(bucketName) : admin.storage().bucket();
    const [files] = await gcs.getFiles({ prefix: `warehouse-assemblies/${id}/floor2-wip/` });
    if (files?.length) {
      await Promise.all(files.map((file) => file.delete().catch(() => {})));
    }
  } catch (err) {
    console.warn('purgeFloor2WipStorageObjects:', err?.message || err);
  }
}

async function opCatalogFarmList(user) {
  await assertCatalogScreenViewUser(user, 'warehouse_farm_1');
  const { catalogFarmList } = await import('../lib/farmWarehouseDelivery.js');
  return catalogFarmList(getService());
}

async function opCatalogFarmStockAdjust(body, user) {
  const grant = await assertCatalogScreenViewUser(user, 'warehouse_farm_1');
  if (
    !isCatalogLocationStockIncreaseAllowed(grant, 'warehouse_farm_1', user?.email)
    && !canManageCatalog(user)
    && !isLoginAccessAdmin(user?.email)
  ) {
    const err = new Error('Farm warehouse stock adjustment is disabled for your account in User Access.');
    err.status = 403;
    throw err;
  }
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  const delta = body.delta ?? body.quantity_delta;
  const quantity = body.quantity;
  const { adjustFarmStock } = await import('../lib/farmWarehouseDelivery.js');
  return adjustFarmStock(getService(), { assemblyId, delta, quantity });
}

async function assertFarmDeliveryAccess(user) {
  if (canManageCatalog(user) || isLoginAccessAdmin(user?.email)) return;
  const grant = await mobileAccessGrantForUser(user);
  if (
    isWorkshopOrDeliveryScreenAllowed(grant, 'delivery_send_farm', 'warehouse_delivery_app')
  ) {
    return;
  }
  const err = new Error('Send to Farm is not enabled for your account in User Access.');
  err.status = 403;
  throw err;
}

async function assertFarmReturnAccess(user) {
  if (canManageCatalog(user) || isLoginAccessAdmin(user?.email)) return;
  const grant = await mobileAccessGrantForUser(user);
  if (
    isWorkshopOrDeliveryScreenAllowed(grant, 'delivery_send_warehouse', 'warehouse_delivery_app')
  ) {
    return;
  }
  const err = new Error('Send to Warehouse is not enabled for your account in User Access.');
  err.status = 403;
  throw err;
}

async function opFarmSendCatalog(user) {
  await assertFarmDeliveryAccess(user);
  const { farmSendCatalog } = await import('../lib/farmWarehouseDelivery.js');
  return farmSendCatalog(getService());
}

async function opFarmDeliverySessionOpen(user, body) {
  await assertFarmDeliveryAccess(user);
  const email = String(user?.email || '').trim().toLowerCase();
  const { openFarmDeliverySession } = await import('../lib/farmWarehouseDelivery.js');
  return openFarmDeliverySession(getService(), user, email);
}

async function opFarmDeliveryCatalog(user) {
  await assertFarmDeliveryAccess(user);
  const { fetchCatalogForFarmDelivery } = await import('../lib/farmWarehouseDelivery.js');
  return fetchCatalogForFarmDelivery(getService());
}

async function opFarmDeliverySubmit(body, user) {
  await assertFarmDeliveryAccess(user);
  const groups = Array.isArray(body.groups) ? body.groups : [];
  if (groups.length) {
    return opDeliverySubmit(
      {
        ...body,
        document_kind: 'farm_delivery',
      },
      user,
      { skipAccessCheck: true },
    );
  }
  const { submitFarmDeliverySimple } = await import('../lib/farmWarehouseDelivery.js');
  return submitFarmDeliverySimple(getService(), body, user);
}

async function opFarmReturnCatalog(user) {
  await assertFarmReturnAccess(user);
  const { farmReturnCatalog } = await import('../lib/farmWarehouseDelivery.js');
  return farmReturnCatalog(getService());
}

async function opFarmReturnSessionOpen(user, body) {
  await assertFarmReturnAccess(user);
  const email = String(user?.email || '').trim().toLowerCase();
  const { openFarmReturnSession } = await import('../lib/farmWarehouseDelivery.js');
  return openFarmReturnSession(getService(), user, email);
}

async function opFarmReturnSubmit(body, user) {
  await assertFarmReturnAccess(user);
  const { submitFarmReturnDelivery } = await import('../lib/farmWarehouseDelivery.js');
  return submitFarmReturnDelivery(getService(), body, user);
}

async function opCatalogFloor2PhotoRemove(body, user, { carpentryWorkshop = false } = {}) {
  if (carpentryWorkshop) {
    await assertCarpentryWorkshopUser(user);
  } else {
    const grant = await assertCatalogScreenViewUser(user, 'warehouse_floor_2');
    if (
      !isCatalogLocationPhotoUploadAllowed(grant, 'warehouse_floor_2', user?.email)
      && !canManageCatalog(user)
      && !isLoginAccessAdmin(user?.email)
    ) {
      const err = new Error('Floor 2 image upload is disabled for your account in User Access.');
      err.status = 403;
      throw err;
    }
  }
  const assemblyId = String(
    body.assembly_id || body.assemblyId || body.raw_assembly_id || body.rawAssemblyId || '',
  ).trim();
  if (!assemblyId) throw new Error('assembly_id is required.');

  const sb = getService();
  const { data: existing, error: loadErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, metadata, image_url')
    .eq('id', assemblyId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load product');
  if (!existing) throw new Error('Product not found.');

  await purgeFloor2WipStorageObjects(assemblyId);

  const { mergeWarehouseFloor2WipImageMetadata } = await import('../../src/utils/warehouseFloor2WipImage.js');
  const metadata = mergeWarehouseFloor2WipImageMetadata(existing.metadata, '');
  const now = new Date().toISOString();
  const { error: updErr } = await sb
    .from('warehouse_assemblies')
    .update({ metadata, updated_at: now })
    .eq('id', assemblyId);
  if (updErr) throw new Error(updErr.message || 'Failed to remove Floor 2 photo');

  return {
    assembly_id: assemblyId,
    image_url: '',
    floor2_image_url: '',
  };
}

async function opCatalogStoreroomList(body, user) {
  const storeroomIndex = Math.floor(Number(body.storeroom_index ?? body.storeroomIndex ?? 0));
  const screenId = storeroomScreenIdForIndex(storeroomIndex);
  if (!screenId) throw new Error('storeroom_index must be 1, 2, or 3.');
  await assertCatalogScreenViewUser(user, screenId);

  const { CARPENTRY_WAREHOUSE_NAMES, storeroomLabelForWarehouseIndex } = await import('../../src/constants/carpentryWarehouses.js');
  const { parseStoreroomMaterialMeta } = await import('../../src/utils/productionPortalCatalog.js');
  const { readWarehouseFloor2WipImageUrl } = await import('../../src/utils/warehouseFloor2WipImage.js');
  const { assemblyImageUrlFromRow } = await import('../../src/utils/warehouseSeaterSetCoverImage.js');

  const locationName = CARPENTRY_WAREHOUSE_NAMES[storeroomIndex - 1];
  const sb = getService();
  const [{ data: locs, error: locErr }, { data: assemblies, error: aErr }] = await Promise.all([
    sb.from('locations').select('id, name'),
    sb.from('warehouse_assemblies').select('id, name, family_sku, metadata, image_url, thumbnail_url, cover_image_url, photo_url'),
  ]);
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  if (aErr) throw new Error(aErr.message || 'Failed to load materials');

  const loc = (locs || []).find((l) => String(l.name || '').trim() === locationName);
  if (!loc?.id) {
    return {
      storeroom_index: storeroomIndex,
      storeroom_label: storeroomLabelForWarehouseIndex(storeroomIndex),
      location_id: null,
      materials: [],
    };
  }
  const locationId = String(loc.id);
  const { data: invRows, error: invErr } = await sb
    .from('warehouse_assembly_inventory')
    .select('assembly_id, quantity')
    .eq('location_id', locationId);
  if (invErr) throw new Error(invErr.message || 'Failed to load storeroom stock');

  const qtyByAssembly = new Map();
  (invRows || []).forEach((r) => {
    qtyByAssembly.set(String(r.assembly_id), Math.max(0, Number(r.quantity) || 0));
  });

  const materials = [];
  for (const asm of assemblies || []) {
    if (!asm?.id) continue;
    const isMaterial = asm?.metadata?.storeroom?.is_storeroom_material === true;
    const qtyHere = qtyByAssembly.get(String(asm.id)) || 0;
    if (!isMaterial && qtyHere <= 0) continue;
    const uom = parseStoreroomMaterialMeta(asm).default_uom || '';
    const storeroomImage = String(asm?.metadata?.storeroom?.image_url || '').trim()
      || readWarehouseFloor2WipImageUrl(asm)
      || assemblyImageUrlFromRow(asm)
      || '';
    materials.push({
      id: String(asm.id),
      assembly_id: String(asm.id),
      name: String(asm.name || asm.id).trim(),
      family_sku: String(asm.family_sku || '').trim(),
      uom,
      quantity: qtyHere,
      image_url: storeroomImage,
    });
  }
  materials.sort((a, b) => a.name.localeCompare(b.name));
  return {
    storeroom_index: storeroomIndex,
    storeroom_label: storeroomLabelForWarehouseIndex(storeroomIndex),
    location_id: locationId,
    materials,
  };
}

async function opCatalogStoreroomStockIncrease(body, user) {
  const storeroomIndex = Math.floor(Number(body.storeroom_index ?? body.storeroomIndex ?? 0));
  const screenId = storeroomScreenIdForIndex(storeroomIndex);
  if (!screenId) throw new Error('storeroom_index must be 1, 2, or 3.');
  const grant = await assertCatalogScreenViewUser(user, screenId);
  if (
    !isCatalogLocationStockIncreaseAllowed(grant, screenId, user?.email)
    && !canManageCatalog(user)
    && !isLoginAccessAdmin(user?.email)
  ) {
    const err = new Error('Storeroom stock qty adjustment is disabled for your account in User Access.');
    err.status = 403;
    throw err;
  }

  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  const delta = Number(body.delta ?? body.quantity ?? 0);
  if (!assemblyId) throw new Error('assembly_id is required.');
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Enter a non-zero quantity to add or decrease.');
  }

  const { CARPENTRY_WAREHOUSE_NAMES } = await import('../../src/constants/carpentryWarehouses.js');
  const { receiveStoreroomMaterial, setStoreroomMaterialStockQty } = await import('../../src/utils/storeroomStockMutations.js');
  const locationName = CARPENTRY_WAREHOUSE_NAMES[storeroomIndex - 1];
  const sb = getService();
  const { data: locs, error: locErr } = await sb.from('locations').select('id, name');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  const loc = (locs || []).find((l) => String(l.name || '').trim() === locationName);
  if (!loc?.id) throw new Error(`Location "${locationName}" not found.`);
  const locId = String(loc.id);

  if (delta > 0) {
    return receiveStoreroomMaterial(sb, {
      assembly_id: assemblyId,
      location_id: locId,
      quantity: delta,
    });
  }

  const { data: existing } = await sb
    .from('warehouse_assembly_inventory')
    .select('quantity')
    .eq('assembly_id', assemblyId)
    .eq('location_id', locId)
    .maybeSingle();
  const currentQty = Math.max(0, Number(existing?.quantity) || 0);
  const nextQty = Math.max(0, currentQty + delta);
  return setStoreroomMaterialStockQty(sb, {
    assembly_id: assemblyId,
    location_id: locId,
    quantity: nextQty,
  });
}

async function opCatalogStoreroomPhotoUpload(body, user) {
  const storeroomIndex = Math.floor(Number(body.storeroom_index ?? body.storeroomIndex ?? 0));
  const screenId = storeroomScreenIdForIndex(storeroomIndex);
  if (!screenId) throw new Error('storeroom_index must be 1, 2, or 3.');
  const grant = await assertCatalogScreenViewUser(user, screenId);
  if (
    !isCatalogLocationPhotoUploadAllowed(grant, screenId, user?.email)
    && !canManageCatalog(user)
    && !isLoginAccessAdmin(user?.email)
  ) {
    const err = new Error('Storeroom image upload is disabled for your account in User Access.');
    err.status = 403;
    throw err;
  }

  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  const imageBase64 = String(body.image_base64 || body.imageBase64 || '').trim();
  if (!assemblyId) throw new Error('assembly_id is required.');
  if (!imageBase64) throw new Error('Photo is required.');
  if (imageBase64.length > 3_200_000) {
    throw new Error('Photo is too large. Try selecting a smaller image.');
  }

  const sb = getService();
  const { data: existing, error: loadErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, metadata')
    .eq('id', assemblyId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load material');
  if (!existing) throw new Error('Material not found.');

  const { jpegBufferFromCatalogDirectUpload } = await import('../lib/catalogDirectPhotoUpload.js');
  const jpeg = await jpegBufferFromCatalogDirectUpload(imageBase64);
  const objectPath = `warehouse-assemblies/${assemblyId}/storeroom/main-${Date.now()}.jpg`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: 'productimages',
    objectPath,
    buffer: jpeg,
    contentType: 'image/jpeg',
    cacheControl: '86400',
  });
  const publicUrl = firebaseStoragePublicUrl('productimages', objectPath);
  if (!publicUrl) throw new Error('Failed to resolve public image URL.');

  const now = new Date().toISOString();
  const prevMeta = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
  const prevStoreroom = prevMeta.storeroom && typeof prevMeta.storeroom === 'object' ? prevMeta.storeroom : {};
  const metadata = {
    ...prevMeta,
    storeroom: {
      ...prevStoreroom,
      image_url: publicUrl,
    },
  };
  const { error: updErr } = await sb
    .from('warehouse_assemblies')
    .update({ metadata, image_url: publicUrl, updated_at: now })
    .eq('id', assemblyId);
  if (updErr) throw new Error(updErr.message || 'Failed to save material photo');

  return {
    assembly_id: assemblyId,
    image_url: publicUrl,
  };
}

async function opUpholsteryJobStart(body, user) {
  await assertProductionKioskUser(user);
  const rawAssemblyId = String(body.raw_assembly_id || body.rawAssemblyId || '').trim();
  if (!rawAssemblyId) throw new Error('raw_assembly_id required');
  const sb = getService();
  const { startUpholsteryProductionJob } = await import('../lib/upholsteryProductionJobs.js');
  return startUpholsteryProductionJob(sb, {
    rawAssemblyId,
    productQty: 1,
    userId: user?.id || user?.uid,
    user,
  });
}

async function opUpholsteryJobList(body, user) {
  try {
    await assertProductionKioskUser(user);
  } catch (prodErr) {
    if (!canManageCatalog(user) && !isLoginAccessAdmin(user?.email)) {
      throw prodErr;
    }
  }
  const sb = getService();
  const activeOnly = body.active_only !== false && body.activeOnly !== false;
  const { listUpholsteryProductionJobs } = await import('../lib/upholsteryProductionJobs.js');
  return listUpholsteryProductionJobs(sb, { activeOnly });
}

async function opUpholsteryJobPause(body, user) {
  await assertProductionKioskUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) throw new Error('job_id required');
  const sb = getService();
  const { pauseUpholsteryProductionJob } = await import('../lib/upholsteryProductionJobs.js');
  return pauseUpholsteryProductionJob(sb, { jobId, userId: user?.id || user?.uid });
}

async function opUpholsteryJobResume(body, user) {
  await assertProductionKioskUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) throw new Error('job_id required');
  const sb = getService();
  const { resumeUpholsteryProductionJob } = await import('../lib/upholsteryProductionJobs.js');
  return resumeUpholsteryProductionJob(sb, { jobId, userId: user?.id || user?.uid });
}

async function opUpholsteryJobCheckUnit(body, user) {
  await assertProductionKioskUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  const unitIndex = body.unit_index ?? body.unitIndex;
  if (!jobId) throw new Error('job_id required');
  const sb = getService();
  const { toggleUpholsteryProductionJobUnit } = await import('../lib/upholsteryProductionJobs.js');
  return toggleUpholsteryProductionJobUnit(sb, {
    jobId,
    unitIndex,
    userId: user?.id || user?.uid,
  });
}

async function opUpholsteryJobFinish(body, user) {
  await assertProductionKioskUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) throw new Error('job_id required');
  const sb = getService();
  const printedBy = (await productionWhatsappProducerName(user)) || 'Upholstery production';
  const { finishUpholsteryProductionJob } = await import('../lib/upholsteryProductionJobs.js');
  return finishUpholsteryProductionJob(sb, {
    jobId,
    userId: user?.id || user?.uid,
    user,
    labelPrintedBy: printedBy,
  });
}

async function opCarpentryManufacture(body, user) {
  await assertCarpentryWorkshopUser(user);
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  if (!assemblyId) throw new Error('assembly_id required');
  const productQty = Math.max(1, Math.floor(Number(body.product_qty ?? body.productQty) || 1));
  const sb = createFirestoreServerClient();
  const { executeCarpentryFloorManufacture } = await import('../lib/carpentryManufacture.js');
  const result = await executeCarpentryFloorManufacture(sb, {
    assemblyId,
    productQty,
    userId: user?.id || user?.uid,
  });
  try {
    const { notifyProductionManufactureJob } = await import('../lib/productionExpoPush.js');
    await notifyProductionManufactureJob({ channel: 'carpentry', job: result?.job });
  } catch (pushErr) {
    console.warn('[warehouse-mobile] carpentry manufacture job push notify failed:', pushErr?.message || pushErr);
  }
  return result;
}

async function opCarpentryManufactureList(user) {
  await assertCarpentryWorkshopUser(user);
  const sb = createFirestoreServerClient();
  const { listCarpentryManufactureCandidates } = await import('../lib/carpentryProductionJobs.js');
  return listCarpentryManufactureCandidates(sb);
}

async function opCarpentryJobStart(body, user) {
  await assertCarpentryWorkshopUser(user);
  const assemblyId = String(body.assembly_id || body.assemblyId || body.raw_assembly_id || '').trim();
  if (!assemblyId) throw new Error('assembly_id required');
  const sb = createFirestoreServerClient();
  const { startCarpentryProductionJob } = await import('../lib/carpentryProductionJobs.js');
  return startCarpentryProductionJob(sb, {
    assemblyId,
    productQty: 1,
    userId: user?.id || user?.uid,
  });
}

async function opCarpentryJobList(body, user) {
  try {
    await assertCarpentryWorkshopUser(user);
  } catch (workshopErr) {
    if (!canManageCatalog(user) && !isLoginAccessAdmin(user?.email)) {
      throw workshopErr;
    }
  }
  const sb = createFirestoreServerClient();
  const activeOnly = body.active_only !== false && body.activeOnly !== false;
  const limit = body.limit ?? body.max;
  const { listCarpentryProductionJobs } = await import('../lib/carpentryProductionJobs.js');
  return listCarpentryProductionJobs(sb, { activeOnly, limit });
}

async function opCarpentryJobPause(body, user) {
  await assertCarpentryWorkshopUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) throw new Error('job_id required');
  const sb = createFirestoreServerClient();
  const { pauseCarpentryProductionJob } = await import('../lib/carpentryProductionJobs.js');
  return pauseCarpentryProductionJob(sb, { jobId, userId: user?.id || user?.uid });
}

async function opCarpentryJobResume(body, user) {
  await assertCarpentryWorkshopUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) throw new Error('job_id required');
  const sb = createFirestoreServerClient();
  const { resumeCarpentryProductionJob } = await import('../lib/carpentryProductionJobs.js');
  return resumeCarpentryProductionJob(sb, { jobId, userId: user?.id || user?.uid });
}

async function opCarpentryJobFinish(body, user) {
  await assertCarpentryWorkshopUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) throw new Error('job_id required');
  const sb = createFirestoreServerClient();
  const { finishCarpentryProductionJob } = await import('../lib/carpentryProductionJobs.js');
  const preferredStoreroomLocationId = String(
    body.preferred_storeroom_location_id || body.preferredStoreroomLocationId || '',
  ).trim() || null;
  return finishCarpentryProductionJob(sb, {
    jobId,
    userId: user?.id || user?.uid,
    preferredStoreroomLocationId,
  });
}

async function opPaintingSendFromFloor2(body, user) {
  await assertCarpentryWorkshopUser(user);
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  if (!assemblyId) throw new Error('assembly_id required');
  const productQty = Math.max(1, Math.floor(Number(body.product_qty ?? body.productQty ?? body.quantity) || 1));
  const sb = createFirestoreServerClient();
  const { sendAssemblyToPaintingDepartment } = await import('../lib/paintingProductionJobs.js');
  return sendAssemblyToPaintingDepartment(sb, {
    assemblyId,
    productQty,
    userId: user?.id || user?.uid,
  });
}

async function opPaintingFromCarpentryQuote(body, user) {
  await assertCarpentryWorkshopUser(user);
  const quoteId = String(body.quote_id || body.quoteId || '').trim();
  if (!quoteId) throw new Error('quote_id required');
  const productQty = Math.max(1, Math.floor(Number(body.product_qty ?? body.productQty ?? body.quantity) || 1));
  const sb = createFirestoreServerClient();
  const { sendCarpentryQuoteToPaintingDepartment } = await import('../lib/paintingProductionJobs.js');
  return sendCarpentryQuoteToPaintingDepartment(sb, {
    quoteId,
    productQty,
    userId: user?.id || user?.uid,
  });
}

async function opPaintingJobList(body, user) {
  try {
    await assertPaintingWorkshopUser(user);
  } catch (paintErr) {
    if (!canManageCatalog(user) && !isLoginAccessAdmin(user?.email)) {
      throw paintErr;
    }
  }
  const sb = createFirestoreServerClient();
  const activeOnly = body.active_only !== false && body.activeOnly !== false;
  const limit = body.limit ?? body.max;
  const { listPaintingProductionJobs } = await import('../lib/paintingProductionJobs.js');
  return listPaintingProductionJobs(sb, { activeOnly, limit });
}

async function opPaintingJobPause(body, user) {
  await assertPaintingWorkshopUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) throw new Error('job_id required');
  const sb = createFirestoreServerClient();
  const { pausePaintingProductionJob } = await import('../lib/paintingProductionJobs.js');
  return pausePaintingProductionJob(sb, { jobId, userId: user?.id || user?.uid });
}

async function opPaintingJobResume(body, user) {
  await assertPaintingWorkshopUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) throw new Error('job_id required');
  const sb = createFirestoreServerClient();
  const { resumePaintingProductionJob } = await import('../lib/paintingProductionJobs.js');
  return resumePaintingProductionJob(sb, { jobId, userId: user?.id || user?.uid });
}

async function opPaintingJobFinish(body, user) {
  await assertPaintingWorkshopUser(user);
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) throw new Error('job_id required');
  const sb = createFirestoreServerClient();
  const { finishPaintingProductionJob } = await import('../lib/paintingProductionJobs.js');
  const destinationRaw = String(body.destination || body.finish_destination || body.finishDestination || 'delivery')
    .trim()
    .toLowerCase();
  const destination = destinationRaw === 'floor1' ? 'floor1' : 'delivery';
  const printedBy = (await productionWhatsappProducerName(user)) || 'Painting workshop';
  return finishPaintingProductionJob(sb, {
    jobId,
    userId: user?.id || user?.uid,
    destination,
    printedBy,
  });
}

async function assertQuoteRouteUser(user, route) {
  const normalized = String(route || '').trim().toLowerCase();
  if (normalized === 'carpentry') {
    try {
      await assertCarpentryWorkshopUser(user);
    } catch (workshopErr) {
      if (!canManageCatalog(user) && !isLoginAccessAdmin(user?.email)) {
        throw workshopErr;
      }
    }
    return 'carpentry';
  }
  try {
    await assertProductionKioskUser(user);
  } catch (prodErr) {
    if (!canManageCatalog(user) && !isLoginAccessAdmin(user?.email)) {
      throw prodErr;
    }
  }
  return 'upholstery';
}

async function opProductionQuotesList(body, user) {
  const route = await assertQuoteRouteUser(user, body.route);
  const sb = getService();
  const { listProductionQuotesForRoute } = await import('../lib/quoteProductionRouting.js');
  return listProductionQuotesForRoute(sb, route, { limit: body.limit });
}

async function opProductionQuoteAccept(body, user) {
  const route = await assertQuoteRouteUser(user, body.route);
  const quoteId = String(body.quote_id || body.quoteId || '').trim();
  if (!quoteId) throw new Error('quote_id required');
  const sb = getService();
  const { acceptQuoteProductionOrder } = await import('../lib/quoteProductionRouting.js');
  return acceptQuoteProductionOrder(sb, {
    quoteId,
    route,
    userId: user?.id || user?.uid,
  });
}

async function opProductionQuoteComplete(body, user) {
  const route = await assertQuoteRouteUser(user, body.route);
  const quoteId = String(body.quote_id || body.quoteId || '').trim();
  if (!quoteId) throw new Error('quote_id required');
  const sb = getService();
  const { completeQuoteProductionOrder } = await import('../lib/quoteProductionRouting.js');
  const deferDeliveryQueue = body.defer_delivery_queue === true
    || body.deferDeliveryQueue === true
    || body.send_to_painting === true
    || body.sendToPainting === true;
  return completeQuoteProductionOrder(sb, {
    quoteId,
    route,
    userId: user?.id || user?.uid,
    deferDeliveryQueue,
  });
}

async function opProductionQuotePause(body, user) {
  const route = await assertQuoteRouteUser(user, body.route);
  const quoteId = String(body.quote_id || body.quoteId || '').trim();
  if (!quoteId) throw new Error('quote_id required');
  const sb = getService();
  const { pauseQuoteProductionOrder } = await import('../lib/quoteProductionRouting.js');
  return pauseQuoteProductionOrder(sb, {
    quoteId,
    route,
    userId: user?.id || user?.uid,
  });
}

async function opProductionQuoteResume(body, user) {
  const route = await assertQuoteRouteUser(user, body.route);
  const quoteId = String(body.quote_id || body.quoteId || '').trim();
  if (!quoteId) throw new Error('quote_id required');
  const sb = getService();
  const { resumeQuoteProductionOrder } = await import('../lib/quoteProductionRouting.js');
  return resumeQuoteProductionOrder(sb, {
    quoteId,
    route,
    userId: user?.id || user?.uid,
  });
}

async function opProductionQuoteMaterialScan(body, user) {
  const route = await assertQuoteRouteUser(user, body.route);
  const quoteId = String(body.quote_id || body.quoteId || '').trim();
  const scan = String(body.scan || '').trim();
  if (!quoteId || !scan) throw new Error('quote_id and scan required');
  const quantity = Math.max(0.0001, Number(body.quantity) || 1);
  const sb = getService();
  const { scanQuoteProductionMaterial } = await import('../lib/quoteProductionRouting.js');
  return scanQuoteProductionMaterial(sb, {
    quoteId,
    route,
    scan,
    quantity,
    userId: user?.id || user?.uid,
  });
}

async function opProductionQuoteTranslateArabic(body, user) {
  await assertProductionKioskUser(user);
  const texts = Array.isArray(body.texts) ? body.texts : [];
  const list = texts
    .map((t) => String(t ?? '').trim())
    .filter(Boolean)
    .slice(0, 120);
  const { translateStringsToArabicServer } = await import('../lib/quoteArabicTranslate.js');
  const translations = await translateStringsToArabicServer(list);
  return { translations };
}

async function opProductionFloor2List(user) {
  await assertProductionKioskUser(user);
  return opCatalogFloor2List(user, { productionKiosk: true });
}

async function opProductionFloor2ManufacturePush(body, user) {
  await assertProductionKioskUser(user);
  const assemblyId = String(
    body.assembly_id || body.assemblyId || body.raw_assembly_id || body.rawAssemblyId || '',
  ).trim();
  const productQty = Math.max(1, Math.floor(Number(body.product_qty ?? body.productQty ?? body.quantity) || 1));
  const channel = String(body.channel || body.route || 'upholstery').trim().toLowerCase();
  if (!assemblyId) throw new Error('assembly_id required');
  const sb = getService();
  const { pushFloor2ToProductionJob } = await import('../lib/productionManufactureFloor2.js');
  const result = await pushFloor2ToProductionJob(sb, {
    assemblyId,
    productQty,
    channel,
    userId: user?.id || user?.uid,
  });
  try {
    const { notifyProductionManufactureJob } = await import('../lib/productionExpoPush.js');
    await notifyProductionManufactureJob({ channel, job: result?.job });
  } catch (pushErr) {
    console.warn('[warehouse-mobile] manufacture job push notify failed:', pushErr?.message || pushErr);
  }
  return result;
}

async function opProductionStoreroomMaterialsList(user) {
  await assertProductionKioskUser(user);
  const sb = getService();
  const { listProductionStoreroomMaterials } = await import('../lib/productionJobMaterials.js');
  return listProductionStoreroomMaterials(sb);
}

async function opProductionJobMaterialsSave(body, user) {
  await assertProductionKioskUser(user);
  const jobKind = String(body.job_kind || body.jobKind || '').trim().toLowerCase();
  const jobId = String(body.job_id || body.jobId || '').trim();
  const returnOrderId = String(body.return_order_id || body.returnOrderId || '').trim();
  const productionRoute = String(
    body.production_route || body.productionRoute || body.quote_route || body.quoteRoute || '',
  ).trim().toLowerCase();
  const materialLines = Array.isArray(body.material_lines)
    ? body.material_lines
    : (Array.isArray(body.materials) ? body.materials : []);
  if (!jobKind) throw new Error('job_kind required (upholstery|carpentry|painting|repair|quote)');
  const sb = getService();
  const { saveProductionJobMaterials } = await import('../lib/productionJobMaterials.js');
  const preferredStoreroomLocationId = String(
    body.preferred_storeroom_location_id || body.preferredStoreroomLocationId || '',
  ).trim() || null;
  return saveProductionJobMaterials(sb, {
    jobKind,
    jobId: jobId || returnOrderId,
    returnOrderId: jobKind === 'repair' ? (returnOrderId || jobId) : null,
    productionRoute: jobKind === 'quote' ? productionRoute : null,
    materialLines,
    preferredStoreroomLocationId,
  });
}

async function removeProductionPacketDraft(sb, packetId) {
  const id = String(packetId || '').trim();
  if (!id) return;
  try {
    await sb.from('warehouse_packet_inventory').delete().eq('packet_id', id);
    await sb.from('warehouse_packets').delete().eq('id', id);
  } catch (err) {
    console.warn('[warehouse-mobile] rollback packet draft failed:', err?.message || err);
  }
}

async function promiseWithTimeout(promise, ms, timeoutMessage) {
  const cap = Math.max(1000, Number(ms) || 10000);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage || 'Timed out')), cap);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function removeProductionAssemblyDraft(sb, assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) return;
  try {
    const { purgeWarehouseAssemblyInventoryAndFloorRuns } = await import('../../src/utils/warehouseAssemblyDelete.js');
    await purgeWarehouseAssemblyInventoryAndFloorRuns(sb, id);
    await sb.from('warehouse_assembly_locations').delete().eq('assembly_id', id);
    await sb.from('warehouse_assembly_packets').delete().eq('assembly_id', id);
    await sb.from('warehouse_assembly_colors').delete().eq('assembly_id', id);
    await sb.from('warehouse_assemblies').delete().eq('id', id);
  } catch (err) {
    console.warn('[warehouse-mobile] rollback assembly draft failed:', err?.message || err);
  }
}

async function opProductionPacketCreate(body, user) {
  const grant = await assertProductionKioskUser(user);
  const sb = getService();
  let familySku = normalizeWarehouseProductSku(body.sku || body.family_sku);
  if (!familySku) {
    const generated = await opGenerateUniqueSku(body);
    familySku = normalizeWarehouseProductSku(generated.sku);
  }
  const name = titleCaseWords(String(body.name || '').trim());
  const warehouseLocationId = body.warehouse_location_id;
  const initialQty = Math.max(0, Number(body.initial_quantity) || 0);
  if (!familySku || !name) throw new Error('SKU and name are required.');
  if (!warehouseLocationId) throw new Error('warehouse_location_id is required.');
  const nameClash = await findProductionNameClash(sb, name);
  if (nameClash) {
    const scope = nameClash.kind === 'catalog' ? 'product catalog' : 'warehouse';
    throw new Error(`"${nameClash.name}" is already in your ${scope}. Choose a different name.`);
  }
  await assertUniqueSku(sb, familySku);

  const presetLabel = String(body.preset || body.product_preset || '').trim();
  const categoryId = presetLabel
    ? await ensureCategoryIdForProductionPreset(sb, presetLabel)
    : null;

  const isCarpentryOnlyUser = evaluateCarpentryWorkshopAppAccess(grant, user?.email)
    && !evaluateWarehouseProductionAppAccess(grant, user?.email);
  const { PRODUCTION_CARPENTRY_PRESETS } = await import('../../src/utils/productionItemName.js');
  const isCarpentryPreset = Boolean(
    presetLabel
    && PRODUCTION_CARPENTRY_PRESETS.some((p) => p.toLowerCase() === presetLabel.toLowerCase()),
  );
  const rawClientSource = String(body.client_source || '').trim() || 'warehouse_production_kiosk';
  const clientSource = (isCarpentryOnlyUser || isCarpentryPreset) && rawClientSource === 'warehouse_production_app'
    ? 'carpentry_workshop_app'
    : rawClientSource;
  const deferProductPhoto = body.defer_product_photo === true
    || body.deferProductPhoto === true;
  const portalExplicit = (isCarpentryOnlyUser || isCarpentryPreset) && String(body.portal_catalog || '').toLowerCase() === 'upholstery'
    ? 'carpentry'
    : (body.portal_catalog || body.auto_portal_catalog);
  const {
    resolveProductionPortalChannel,
    resolveFloor2SeedQuantity,
  } = await import('../lib/productionPortalAutoSelect.js');
  const portalChannel = resolveProductionPortalChannel(clientSource, portalExplicit);
  const floor2SeedQty = resolveFloor2SeedQuantity(body, initialQty);
  const deferPortalCatalog = deferProductPhoto === true
    && (portalChannel === 'upholstery' || portalChannel === 'carpentry');
  /** Carpentry raw WIP lives on Floor 2. Upholstery Create New Item is Floor 1 — persist the entered qty there too. */
  const openingFloor1Qty = portalChannel === 'carpentry'
    ? 0
    : Math.max(0, initialQty);
  let assemblyInserted = false;
  let assemblyId = '';
  try {
    const assembly = await saveAssemblyForMobile(sb, {
      name,
      family_sku: familySku,
      category_id: categoryId,
      warehouse_location_id: warehouseLocationId,
      inventory_mode: 'finished',
      packet_count: null,
      packet_links: [],
      location_ids: [],
      units_per_carton: 1,
      dim_length: body.dim_length ?? body.dimLength,
      dim_width: body.dim_width ?? body.dimWidth,
      dim_height: body.dim_height ?? body.dimHeight,
    });
    assemblyId = String(assembly.id || '');
    assemblyInserted = Boolean(assemblyId);

    const now = new Date().toISOString();
    const { error: invErr } = await sb.from('warehouse_assembly_inventory').upsert({
      assembly_id: assemblyId,
      location_id: warehouseLocationId,
      quantity: openingFloor1Qty,
      updated_at: now,
    }, { onConflict: 'assembly_id,location_id' });
    if (invErr) throw new Error(invErr.message || 'Failed to set opening stock');
    recomputeWarehouseLocationStockServer(sb, warehouseLocationId).catch((reErr) => {
      console.warn('[warehouse-mobile] warehouse stock recompute deferred:', reErr?.message || reErr);
    });

    const mattressProduct = isMattressCatalogProductName(name);
    const imageBase64 = deferProductPhoto
      ? ''
      : String(body.image_base64 || body.imageBase64 || '').trim();
    const requiresPhoto = !deferProductPhoto && !mattressProduct && (
      clientSource === 'warehouse_production_app'
      || body.require_product_photo === true
      || body.requireProductPhoto === true
    );

    let catalogImageUrl = null;
    const fastMobileCreate = clientSource === 'warehouse_production_app';
    if (imageBase64 && mattressProduct) {
      throw new Error('AI catalog photos are not used for mattresses. Save without a photo from the Production app.');
    }
    if (imageBase64) {
      const requireAiOnCreate = clientSource === 'warehouse_production_app'
        || body.require_ai_retouch === true
        || body.requireAiRetouch === true;
      catalogImageUrl = await attachProductionAssemblyCatalogPhoto(sb, {
        assembly,
        imageBase64,
        productName: name,
        preset: presetLabel,
        skipAiRetouch: false,
        requireAiRetouch: requireAiOnCreate,
        directCatalogUpload: false,
      });
    } else if (requiresPhoto) {
      throw new Error('Take a product photo before saving (camera required).');
    }

    try {
      await logWarehouseProductionCreate({
        user,
        assembly,
        initialQuantity: initialQty,
        warehouseLocationId,
        source: clientSource,
      });
    } catch (logErr) {
      console.warn('[warehouse-mobile] production create log failed:', logErr?.message || logErr);
    }

    let portalCatalog = null;
    if (!deferPortalCatalog) {
      try {
        const { autoSelectProductionPortalCatalog } = await import('../lib/productionPortalAutoSelect.js');
        portalCatalog = await autoSelectProductionPortalCatalog(sb, assemblyId, {
          clientSource,
          portal_catalog: body.portal_catalog,
          auto_portal_catalog: body.auto_portal_catalog,
          initialQuantity: floor2SeedQty,
          floor2_product_qty: floor2SeedQty,
          userId: user?.id || user?.uid || null,
        });
      } catch (portalErr) {
        console.warn('[warehouse-mobile] portal catalog auto-select failed:', portalErr?.message || portalErr);
        portalCatalog = {
          applied: null,
          error: portalErr?.message || String(portalErr),
        };
      }
    }

    const labelSku = normalizeWarehousePacketScan(familySku) || familySku;
    const labelCopies = Math.max(0, Math.floor(Number(initialQty) || 0));
    const deferLabels = deferProductPhoto && labelCopies > 0;
    const printedAt = new Date();
    const labelPrintedBy = (await productionWhatsappProducerName(user)) || 'Production kiosk';
    let labelJobId = null;
    let labelPrintWarning = null;
    if (labelCopies > 0 && !deferLabels) {
      try {
        labelJobId = await promiseWithTimeout(
          enqueueWarehouseProductionLabelJob(sb, {
            name: assembly.name,
            sku: labelSku,
            qty: labelCopies,
            printedBy: labelPrintedBy,
            source: clientSource,
            printedAt,
          }),
          fastMobileCreate ? 12000 : 25000,
          'Label print timed out',
        );
        if (!labelJobId) {
          labelPrintWarning = 'Item saved but labels were not sent to the printer (Zebra Weblink is not configured on the server).';
        }
      } catch (printErr) {
        const { formatZebraPrintError } = await import('../lib/formatZebraPrintError.js');
        const timedOut = String(printErr?.message || '').toLowerCase().includes('timed out');
        labelPrintWarning = timedOut
          ? 'Item saved. Labels may still print — if not, add stock again to reprint.'
          : formatZebraPrintError(printErr);
        console.warn('[warehouse-mobile] production label print failed:', printErr?.message || printErr);
      }
    }

    const preview = labelCopies > 0
      ? await buildProductionLabelPreviewPayload({
        name: assembly.name,
        sku: labelSku,
        printedAt,
        skipPng: deferLabels,
      })
      : { label: null, label_preview_png_base64: null };

    const packetCompat = {
      id: assemblyId,
      sku: labelSku,
      name: assembly.name,
      assembly_id: assemblyId,
    };

    if (!deferProductPhoto && catalogImageUrl) {
      const producedBy = await productionWhatsappProducerName(user);
      queueProductionWhatsAppNotifyForProduct(sb, {
        variant: 'new',
        producedBy,
        sku: labelSku,
        name: assembly.name,
        qtyAdded: initialQty,
        qtyBefore: 0,
        preset: presetLabel || inferPresetFromCreateBody(body, name),
        imageUrl: catalogImageUrl,
      });
    }

    return {
      assembly,
      packet: packetCompat,
      defer_product_photo: deferProductPhoto,
      created_by: user?.email || null,
      catalog_image_url: catalogImageUrl,
      portal_catalog: portalCatalog,
      label_copies: labelCopies,
      label_job_id: labelJobId,
      label_print_warning: labelPrintWarning,
      pending_label_print: deferLabels
        ? {
          name: assembly.name,
          sku: labelSku,
          qty: labelCopies,
          client_source: clientSource,
        }
        : null,
      pending_portal_setup: deferPortalCatalog
        ? {
          initial_quantity: initialQty,
          floor2_product_qty: floor2SeedQty,
          portal_catalog: portalChannel || body.portal_catalog || 'upholstery',
          client_source: clientSource,
          warehouse_location_id: warehouseLocationId,
        }
        : null,
      label: preview.label,
      label_preview_png_base64: preview.label_preview_png_base64,
    };
  } catch (err) {
    if (assemblyInserted) {
      await removeProductionAssemblyDraft(sb, assemblyId);
    }
    throw err;
  }
}

async function opProductionPacketCancelDraft(body, user) {
  await assertProductionKioskUser(user);
  const sb = getService();
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  if (!assemblyId) throw new Error('assembly_id is required.');
  const { data: assembly, error: loadErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, image_url, inventory_mode')
    .eq('id', assemblyId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load product');
  if (!assembly?.id) throw new Error('Product not found.');
  if (String(assembly.image_url || '').trim()) {
    throw new Error('This product already has a catalog photo and cannot be discarded.');
  }
  await removeProductionAssemblyDraft(sb, assemblyId);
  return { assembly_id: assemblyId, cancelled: true };
}

async function opProductionAssemblyPhoto(body, user) {
  return runProductionAssemblyPhotoAttach(body, user);
}

async function opProductionStockIncrease(body, user) {
  const grant = await assertProductionKioskUser(user);
  const sb = getService();
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  const packetId = String(body.packet_id || '').trim();
  const warehouseLocationId = String(body.warehouse_location_id || body.location_id || '').trim();
  const delta = Math.max(0, Math.floor(Number(body.delta) || 0));
  if (!assemblyId && !packetId) throw new Error('assembly_id or packet_id is required.');
  if (!warehouseLocationId) throw new Error('warehouse_location_id is required.');
  if (delta < 1) throw new Error('Increase quantity must be at least 1.');

  const isCarpentryOnlyUser = evaluateCarpentryWorkshopAppAccess(grant, user?.email)
    && !evaluateWarehouseProductionAppAccess(grant, user?.email);
  const rawPrintSource = String(body.client_source || '').trim() || 'warehouse_production_kiosk';
  const printSource = isCarpentryOnlyUser && rawPrintSource === 'warehouse_production_app'
    ? 'carpentry_workshop_app'
    : rawPrintSource;
  let labelName = '';
  let labelSku = '';
  let qtyBefore = 0;
  let qtyAfter = 0;
  let packet = null;
  let assembly = null;

  if (assemblyId) {
    if (printSource === 'warehouse_production_app') {
      const { assertUpholsteryCatalogAssembly } = await import('../lib/upholsteryCatalog.js');
      await assertUpholsteryCatalogAssembly(sb, assemblyId);
    }
    const { data: asmRow, error: aErr } = await sb
      .from('warehouse_assemblies')
      .select('id, name, family_sku, inventory_mode, image_url')
      .eq('id', assemblyId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message || 'Failed to load product');
    if (!asmRow) throw new Error('Product not found.');
    if (String(asmRow.inventory_mode || '').toLowerCase() !== 'finished') {
      throw new Error('Stock can only be added to finished products (no packet BOM).');
    }
    assembly = asmRow;

    const { data: invRow } = await sb
      .from('warehouse_assembly_inventory')
      .select('quantity')
      .eq('assembly_id', assemblyId)
      .eq('location_id', warehouseLocationId)
      .maybeSingle();
    qtyBefore = Math.max(0, Number(invRow?.quantity) || 0);
    qtyAfter = qtyBefore + delta;

    await upsertFinishedAssemblyInventoryQuantity(sb, {
      assemblyId,
      locationId: warehouseLocationId,
      quantity: qtyAfter,
    });
    void recomputeWarehouseLocationStockServer(sb, warehouseLocationId).catch((reErr) => {
      console.warn('[warehouse-mobile] warehouse stock recompute deferred:', reErr?.message || reErr);
    });

    labelName = assembly.name;
    labelSku = normalizeWarehousePacketScan(assembly.family_sku) || assembly.family_sku;

    await logWarehouseProductionStockIncrease({
      user,
      assembly,
      delta,
      qtyBefore,
      qtyAfter,
      warehouseLocationId,
      source: printSource,
    });
  } else {
    const { data: pktRow, error: pErr } = await sb
      .from('warehouse_packets')
      .select('id, sku, name')
      .eq('id', packetId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message || 'Failed to load packet');
    if (!pktRow) throw new Error('Packet not found.');
    packet = pktRow;

    const { data: invRow } = await sb
      .from('warehouse_packet_inventory')
      .select('quantity')
      .eq('packet_id', packetId)
      .eq('location_id', warehouseLocationId)
      .maybeSingle();
    qtyBefore = Math.max(0, Number(invRow?.quantity) || 0);
    qtyAfter = qtyBefore + delta;

    await setWarehousePacketQuantityServer(sb, packetId, warehouseLocationId, qtyAfter, { mobileFast: true });

    await logWarehouseProductionStockIncrease({
      user,
      packet,
      delta,
      qtyBefore,
      qtyAfter,
      warehouseLocationId,
      source: printSource,
    });

    labelName = packet.name;
    labelSku = packet.sku;
  }

  const printedAt = new Date();
  const fastMobile = printSource === 'warehouse_production_app';
  const labelPrintedBy = (await productionWhatsappProducerName(user)) || 'Production kiosk';
  let labelJobId = null;
  let labelPrintWarning = null;
  try {
    labelJobId = await promiseWithTimeout(
      enqueueWarehouseProductionLabelJob(sb, {
        name: labelName,
        sku: labelSku,
        qty: delta,
        printedBy: labelPrintedBy,
        source: printSource,
        printedAt,
      }),
      fastMobile ? 12000 : 25000,
      'Label print timed out',
    );
    if (!labelJobId) {
      labelPrintWarning = 'Stock updated but labels were not sent to the printer (Zebra Weblink is not configured on the server).';
    }
  } catch (printErr) {
    const { formatZebraPrintError } = await import('../lib/formatZebraPrintError.js');
    const timedOut = String(printErr?.message || '').toLowerCase().includes('timed out');
    labelPrintWarning = timedOut
      ? 'Stock saved. Labels may still print — if not, try adding stock again to reprint.'
      : formatZebraPrintError(printErr);
    console.warn('[warehouse-mobile] production stock label print failed:', printErr?.message || printErr);
  }

  const preview = await buildProductionLabelPreviewPayload({
    name: labelName,
    sku: labelSku,
    printedAt,
    skipPng: fastMobile,
  });

  const packetCompat = assembly
    ? { id: assembly.id, sku: labelSku, name: assembly.name, assembly_id: assembly.id }
    : packet;

  if (assembly) {
    const producedBy = await productionWhatsappProducerName(user);
    queueProductionWhatsAppNotifyForProduct(sb, {
      variant: 'existing',
      producedBy,
      sku: labelSku,
      name: labelName,
      qtyAdded: delta,
      qtyBefore,
      qtyOnHand: qtyAfter,
      preset: body.preset || body.product_preset,
      imageUrl: assembly.image_url || '',
    });
  }

  return {
    assembly,
    packet: packetCompat,
    delta,
    qty_before: qtyBefore,
    qty_after: qtyAfter,
    warehouse_location_id: warehouseLocationId,
    label_copies: delta,
    label_job_id: labelJobId,
    label_print_warning: labelPrintWarning,
    label: preview.label,
    label_preview_png_base64: preview.label_preview_png_base64,
  };
}

async function assertProductionHistoryAdmin(user) {
  if (!canManageCatalog(user) && !isLoginAccessAdmin(user?.email)) {
    const err = new Error('You do not have permission to manage production history.');
    err.status = 403;
    throw err;
  }
}

async function loadPacketInventoryQty(sb, packetId, locationId) {
  const { data, error } = await sb
    .from('warehouse_packet_inventory')
    .select('quantity')
    .eq('packet_id', packetId)
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load packet stock');
  return Math.max(0, Number(data?.quantity) || 0);
}

async function applyWarehouseQtyOverride(sb, packetId, locationId, oldAmount, newAmount) {
  const oldQty = Math.max(0, Number(oldAmount) || 0);
  const newQty = Math.max(0, Number(newAmount) || 0);
  const current = await loadPacketInventoryQty(sb, packetId, locationId);
  const next = Math.max(0, current - oldQty + newQty);
  await setWarehousePacketQuantityServer(sb, packetId, locationId, next, { mobileFast: true });
  await recomputeWarehouseLocationStockServer(sb, locationId);
  return { previous: current, quantity: next };
}

function parseProductionReportDateRange(body) {
  const startDate = String(body?.start_date || body?.startDate || '').trim();
  const endDate = String(body?.end_date || body?.endDate || '').trim();
  if (!startDate && !endDate) {
    return { startISO: null, endISO: null, startDate: '', endDate: '' };
  }
  if (!startDate || !endDate) {
    throw new Error('start_date and end_date are required together.');
  }
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('Choose a valid date range.');
  }
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    startDate,
    endDate,
  };
}

async function opProductionEventsList(user, body) {
  await assertProductionHistoryAdmin(user);
  const limit = Math.min(5000, Math.max(1, Number(body?.limit) || 500));
  const { startISO, endISO } = parseProductionReportDateRange(body);
  const rows = await listWarehouseProductionLog({
    limit,
    startAt: startISO,
    endAt: endISO,
  });
  return {
    creates: rows.filter((r) => r.event_type === 'create'),
    stock_increases: rows.filter((r) => r.event_type === 'stock_increase'),
    start_date: startISO ? body?.start_date || body?.startDate : null,
    end_date: startISO ? body?.end_date || body?.endDate : null,
  };
}

async function opProductionEditCreate(body, user) {
  await assertProductionHistoryAdmin(user);
  const logId = String(body.log_id || body.logId || '').trim();
  const log = await getWarehouseProductionLogEntry(logId);
  if (!log || log.event_type !== 'create') {
    throw new Error('Create log entry not found.');
  }

  const packetId = String(log.packet_id || '').trim();
  const locationId = String(log.warehouse_location_id || '').trim();
  if (!packetId || !locationId) throw new Error('Log entry is missing packet or warehouse location.');

  const sb = getService();
  const { data: packet, error: pErr } = await sb
    .from('warehouse_packets')
    .select('*')
    .eq('id', packetId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message || 'Failed to load packet');
  if (!packet) throw new Error('Packet not found.');

  const now = new Date().toISOString();
  const logPatch = {
    edited_at: now,
    edited_by_email: String(user?.email || '').trim().toLowerCase() || null,
    edited_by_display_name: String(user?.full_name || user?.display_name || user?.email || '').trim() || null,
    warehouse_location_id: locationId,
  };

  let warehouseQty = null;

  if (body.name !== undefined) {
    const name = titleCaseWords(String(body.name || '').trim());
    if (!name) throw new Error('Name is required.');
    await assertUniquePacketName(sb, name, { excludePacketId: packetId });
    await savePacketForMobile(sb, {
      packet_id: packetId,
      sku: packet.sku,
      name,
      packet_number: packet.packet_number || 1,
      qty_per_unit: packet.qty_per_unit || 1,
      warehouse_location_id: locationId,
    });
    await syncWarehouseProductionLogPacketName(packetId, name);
    logPatch.name = name;
  }

  const qtyRaw = body.qty_added ?? body.initial_quantity ?? body.quantity;
  if (qtyRaw !== undefined) {
    const newQty = Math.max(0, Math.floor(Number(qtyRaw) || 0));
    const oldQty = Math.max(0, Number(log.qty_added ?? log.qty_after) || 0);
    warehouseQty = await applyWarehouseQtyOverride(sb, packetId, locationId, oldQty, newQty);
    logPatch.qty_added = newQty;
    logPatch.qty_after = newQty;
    logPatch.qty_before = 0;
    logPatch.warehouse_qty_applied = warehouseQty.quantity;
  }

  const updated = await updateWarehouseProductionLogEntry(logId, logPatch);
  return { log: updated, packet_id: packetId, warehouse_qty: warehouseQty };
}

async function opProductionEditStockIncrease(body, user) {
  await assertProductionHistoryAdmin(user);
  const logId = String(body.log_id || body.logId || '').trim();
  const log = await getWarehouseProductionLogEntry(logId);
  if (!log || log.event_type !== 'stock_increase') {
    throw new Error('Stock increase log entry not found.');
  }

  const packetId = String(log.packet_id || '').trim();
  const locationId = String(log.warehouse_location_id || '').trim();
  if (!packetId || !locationId) throw new Error('Log entry is missing packet or warehouse location.');

  const newDelta = Math.max(0, Math.floor(Number(body.qty_added ?? body.delta) || 0));
  if (newDelta < 1) throw new Error('Quantity added must be at least 1.');

  const oldDelta = Math.max(0, Number(log.qty_added) || 0);
  const qtyBefore = Math.max(0, Number(log.qty_before) || 0);

  const sb = getService();
  const warehouseQty = await applyWarehouseQtyOverride(sb, packetId, locationId, oldDelta, newDelta);

  const now = new Date().toISOString();
  const updated = await updateWarehouseProductionLogEntry(logId, {
    qty_added: newDelta,
    qty_after: qtyBefore + newDelta,
    warehouse_qty_applied: warehouseQty.quantity,
    edited_at: now,
    edited_by_email: String(user?.email || '').trim().toLowerCase() || null,
    edited_by_display_name: String(user?.full_name || user?.display_name || user?.email || '').trim() || null,
    admin_qty_override: true,
  });

  return { log: updated, packet_id: packetId, warehouse_location_id: locationId };
}

async function isProductionBaseNameTaken(sb, baseName, options = {}) {
  const probe = String(baseName || '').trim();
  if (!probe) return false;
  const clash = await findProductionNameClash(sb, probe, options);
  return Boolean(clash);
}

async function opPacketNameCheck(body) {
  const name = titleCaseWords(String(body.name || '').trim());
  if (!name) return { taken: false, name: '' };
  const sb = getService();
  const excludePacketId = body.exclude_packet_id || body.excludePacketId || '';
  const excludeAssemblyId = body.exclude_assembly_id || body.excludeAssemblyId || '';
  const clash = await findProductionNameClash(sb, name, {
    excludePacketId,
    excludeAssemblyId,
  });
  if (!clash) {
    return { taken: false, name };
  }
  const sameFullName = normalizeWarehousePacketNameKey(clash.name) === normalizeWarehousePacketNameKey(name);
  const lookupHint = clash.kind === 'catalog'
    ? 'Search Products List (shop catalog), not Warehouse → Products.'
    : clash.kind === 'packet'
      ? 'Search Warehouse → Products (packet name on a product).'
      : 'Search Warehouse → Products.';
  return {
    taken: true,
    name,
    existing: clash.name,
    existing_id: clash.id,
    existing_kind: clash.kind,
    reason: sameFullName ? 'exact_name' : 'base_name_in_use',
    lookup_hint: lookupHint,
  };
}

function productionLabelDimArgs(body = {}) {
  return {
    dimLength: body.dim_length ?? body.dimLength,
    dimWidth: body.dim_width ?? body.dimWidth,
    dimHeight: body.dim_height ?? body.dimHeight,
    dimensionsLine: body.dimensions_line ?? body.dimensionsLine ?? '',
  };
}

function productionLabelPhotoFloorArgs(body = {}) {
  const photoFloor = resolveLabelPhotoFloor({
    explicit: body.photo_floor ?? body.photoFloor ?? body.label_photo_floor,
    clientSource: body.client_source || body.clientSource || body.source,
  });
  return { photoFloor };
}

async function buildProductionLabelPreviewPayload({
  name, sku, printedAt, color, boxUnitsPerCarton, skipPng = false,
  dimLength, dimWidth, dimHeight, dimensionsLine, photoFloor,
}) {
  const at = printedAt ? new Date(printedAt) : new Date();
  const label = buildProductionLabelMeta({
    name, sku, printedAt: at, color, boxUnitsPerCarton,
    dimLength, dimWidth, dimHeight, dimensionsLine, photoFloor,
  });
  let label_preview_png_base64 = null;
  if (!skipPng) {
    try {
      label_preview_png_base64 = await buildWarehouseProductionLabelPngBase64({
        name: label.name,
        sku: label.sku,
        printedAt: at,
        color: label.color,
        boxUnitsPerCarton,
        dimLength,
        dimWidth,
        dimHeight,
        dimensionsLine,
        photoFloor,
      });
    } catch (err) {
      console.warn('[warehouse-mobile] label preview png failed:', err?.message || err);
    }
  }
  return { label, label_preview_png_base64, printed_at: label.printed_at };
}

async function opProductionLabelPreview(body, user) {
  await assertWarehouseLabelPrintUser(user);
  const sb = getService();
  const name = titleCaseWords(String(body.name || '').trim());
  const sku = normalizeWarehousePacketScan(body.sku) || normalizeWarehouseProductSku(body.sku);
  if (!name || !sku) throw new Error('name and sku are required.');
  const printedAt = body.printed_at || body.printedAt || new Date().toISOString();
  const color = await resolveWarehouseProductionLabelColorForPrint(sb, {
    sku,
    color: body.color || body.color_name || body.colorName || '',
  });
  const boxUnitsPerCarton = Math.max(
    0,
    Math.floor(Number(body.box_units_per_carton ?? body.boxUnitsPerCarton) || 0),
  );
  return buildProductionLabelPreviewPayload({
    name, sku, printedAt, color, boxUnitsPerCarton,
    ...productionLabelDimArgs(body),
    ...productionLabelPhotoFloorArgs(body),
  });
}

async function opProductionLabelPrint(body, user) {
  await assertWarehouseLabelPrintUser(user);
  const sb = getService();
  const name = titleCaseWords(String(body.name || '').trim());
  const sku = normalizeWarehousePacketScan(body.sku) || normalizeWarehouseProductSku(body.sku);
  const qty = Math.max(1, Math.floor(Number(body.qty ?? body.copies) || 1));
  if (!name || !sku) throw new Error('name and sku are required.');
  const printSource = String(body.client_source || '').trim() || 'warehouse_catalog_portal';
  const printedAt = new Date();
  const labelPrintedBy = (await productionWhatsappProducerName(user)) || 'Production kiosk';
  const color = await resolveWarehouseProductionLabelColorForPrint(sb, {
    sku,
    color: body.color || body.color_name || body.colorName || '',
  });
  const boxUnitsPerCarton = Math.max(
    0,
    Math.floor(Number(body.box_units_per_carton ?? body.boxUnitsPerCarton) || 0),
  );
  let labelJobId = null;
  let labelPrintWarning = null;
  try {
    labelJobId = await enqueueWarehouseProductionLabelJob(sb, {
      name,
      sku,
      qty,
      printedBy: labelPrintedBy,
      source: printSource,
      printedAt,
      color,
      boxUnitsPerCarton,
      ...productionLabelDimArgs(body),
      ...productionLabelPhotoFloorArgs({ ...body, client_source: printSource }),
    });
    if (!labelJobId) {
      labelPrintWarning = 'Labels were not sent to the printer (Zebra Weblink is not configured on the server).';
    }
  } catch (printErr) {
    const { formatZebraPrintError } = await import('../lib/formatZebraPrintError.js');
    labelPrintWarning = formatZebraPrintError(printErr);
    console.warn('[warehouse-mobile] production label print failed:', printErr?.message || printErr);
  }
  const preview = await buildProductionLabelPreviewPayload({
    name, sku, printedAt, color, boxUnitsPerCarton, skipPng: false,
    ...productionLabelDimArgs(body),
    ...productionLabelPhotoFloorArgs({ ...body, client_source: printSource }),
  });
  return {
    label_copies: qty,
    label_job_id: labelJobId,
    label_print_warning: labelPrintWarning,
    label: preview.label,
    label_preview_png_base64: preview.label_preview_png_base64,
  };
}

async function opProductionSuggestBaseName(body, user) {
  await assertProductionKioskUser(user);
  const sb = getService();
  const preset = String(body.preset || body.seater_preset || '').trim();
  const baseName = await suggestUniqueProductionBaseName(async (fullName) => {
    const check = await opPacketNameCheck({ name: fullName });
    return Boolean(check.taken);
  }, preset, async (base) => isProductionBaseNameTaken(sb, base));
  const safeBase = matchProductionGirlNameFromPool(baseName);
  if (!safeBase) {
    throw new Error('Could not find an unused name. Enter one manually.');
  }
  const productName = preset ? buildProductionItemName(safeBase, preset) : safeBase;
  return { base_name: safeBase, product_name: productName, preset: preset || null };
}

async function opProductionRecentBaseNames(user) {
  await assertProductionKioskUser(user);
  const base_names = await listRecentProductionBaseNames(2);
  return { base_names };
}

async function opPacketCreate(body, user) {
  const sb = getService();
  const sku = normalizeWarehousePacketScan(body.sku);
  const name = titleCaseWords(String(body.name || '').trim());
  const packetNumber = Number(body.packet_number);
  const qtyPerUnit = Math.max(1, Math.floor(Number(body.qty_per_unit) || 1));
  const warehouseLocationId = body.warehouse_location_id;
  const initialQty = Math.max(0, Number(body.initial_quantity) || 0);
  if (!sku || !name) throw new Error('SKU and name are required.');
  if (!warehouseLocationId) throw new Error('warehouse_location_id is required.');
  if (!Number.isFinite(packetNumber) || packetNumber < 1) {
    throw new Error('packet_number must be at least 1.');
  }
  await assertUniqueSku(sb, sku, { excludePacketId: body.id });
  await assertUniquePacketName(sb, name);

  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    assembly_id: null,
    sku,
    name,
    category_id: null,
    location_id: warehouseLocationId,
    packet_number: packetNumber,
    qty_per_unit: qtyPerUnit,
    item_kind: 'packet',
    created_at: now,
    updated_at: now,
  };
  const { error } = await sb.from('warehouse_packets').insert(row);
  if (error) throw new Error(error.message || 'Failed to create packet');

  await sb.from('warehouse_packet_inventory').upsert({
    packet_id: id,
    location_id: warehouseLocationId,
    quantity: initialQty,
    updated_at: now,
  }, { onConflict: 'packet_id,location_id' });

  return { packet: row, created_by: user?.email || null };
}

async function opAssemblyCreate(body, user) {
  const sb = getService();
  const familySku = normalizeWarehouseSku(body.family_sku);
  const name = String(body.name || '').trim();
  const packetCount = Number(body.packet_count);
  const warehouseLocationId = body.warehouse_location_id;
  if (!familySku || !name) throw new Error('SKU and name are required.');
  if (!warehouseLocationId) throw new Error('warehouse_location_id is required.');
  if (!Number.isFinite(packetCount) || packetCount < 1) {
    throw new Error('packet_count is required.');
  }
  await assertUniqueSku(sb, familySku);

  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    name,
    family_sku: familySku,
    packet_count: packetCount,
    category_id: body.category_id || null,
    inventory_mode: 'packets',
    has_color_variants: false,
    created_at: now,
    updated_at: now,
  };
  const { error } = await sb.from('warehouse_assemblies').insert(row);
  if (error) throw new Error(error.message || 'Failed to create product');

  return { assembly: row, created_by: user?.email || null };
}

async function opAssemblySave(body, user) {
  const updateId = String(body?.id || body?.assembly_id || '').trim();
  if (!updateId) {
    const grant = await mobileAccessGrantForUser(user);
    const allowed = canManageCatalog(user)
      || isLoginAccessAdmin(user?.email)
      || isWarehouseCatalogAddProductAllowed(grant);
    if (!allowed) {
      const err = new Error('You do not have permission to add products.');
      err.status = 403;
      throw err;
    }
  }
  const assembly = await saveAssemblyForMobile(getService(), body);
  return { assembly, created_by: user?.email || null };
}

async function opAssemblyDelete(body, user) {
  const allowed = canManageCatalog(user) || isLoginAccessAdmin(user?.email);
  if (!allowed) {
    const err = new Error('You do not have permission to delete warehouse products.');
    err.status = 403;
    throw err;
  }
  const id = String(body?.id || body?.assembly_id || '').trim();
  if (!id) throw new Error('Assembly ID is required.');

  const sb = getService();

  const [, , , , , , , { error }] = await Promise.all([
    purgeWarehouseAssemblyInventoryAndFloorRuns(sb, id, { skipRecompute: true }),
    sb.from('warehouse_set_items').delete().eq('set_assembly_id', id),
    sb.from('warehouse_set_items').delete().eq('component_assembly_id', id),
    sb.from('warehouse_assembly_packets').delete().eq('assembly_id', id),
    sb.from('warehouse_assembly_locations').delete().eq('assembly_id', id),
    sb.from('warehouse_assembly_colors').delete().eq('assembly_id', id),
    sb.from('warehouse_packets').update({ assembly_id: null }).eq('assembly_id', id),
    sb.from('warehouse_assemblies').delete().eq('id', id),
  ]);
  if (error) throw new Error(error.message || 'Failed to delete warehouse product.');

  sb.storage.from('warehouse-packet-images').remove([
    `assemblies/${id}/product.jpg`,
    `assemblies/${id}/product.jpeg`,
    `assemblies/${id}/product.png`,
    `assemblies/${id}/product.webp`,
    `floor2-wip/${id}/wip.jpg`,
    `floor2-wip/${id}/wip.jpeg`,
    `floor2-wip/${id}/wip.png`,
    `floor2-wip/${id}/wip.webp`,
  ]).catch(() => {});

  return { deleted: true, id, deleted_by: user?.email || null };
}

async function opProductTurkishNamesSync(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  const allowed = isLoginAccessAdmin(user?.email)
    || isWarehouseProductTurkishSyncAllowed(grant);
  if (!allowed) {
    const err = new Error('You do not have permission to sync Turkish names.');
    err.status = 403;
    throw err;
  }
  const entries = body.entries || body.items || [];
  const fillEmptyOnly = body.mode === 'fill_empty' || body.fill_empty_only === true;
  return bulkSyncProductTurkishNames(getService(), entries, { fillEmptyOnly });
}

async function opAssemblyProductQuantitySet(body, user) {
  const sb = getService();
  const grant = await mobileAccessGrantForUser(user);
  const allowed = isLoginAccessAdmin(user?.email)
    || isWarehouseProductStockQtyEditAllowed(grant);
  if (!allowed) {
    const err = new Error('You do not have permission to set warehouse product quantity.');
    err.status = 403;
    throw err;
  }
  const result = await setAssemblyProductQuantityForMobile(sb, body);
  return { ...result, updated_by: user?.email || null };
}

async function opBomValidate(body) {
  const assemblyId = String(body.assembly_id || '');
  const units = Math.max(1, Number(body.units) || 1);
  const scans = Array.isArray(body.scans) ? body.scans : [];
  if (!assemblyId) throw new Error('assembly_id is required.');

  const sb = getService();
  const [{ data: assembly }, { data: packets }, { data: links }] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, packet_count').eq('id', assemblyId).maybeSingle(),
    sb.from('warehouse_packets').select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
    sb.from('warehouse_assembly_packets').select('*'),
  ]);
  if (!assembly) throw new Error('Product not found.');

  const byAssembly = buildPacketsByAssembly(links || [], packets || []);
  const packetRows = byAssembly.get(assemblyId) || [];
  const scanned = new Map();
  scans.forEach((line) => {
    const pid = String(line.packet_id || '');
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (!pid || qty < 1) return;
    scanned.set(pid, (scanned.get(pid) || 0) + qty);
  });

  return validateAssemblyShipmentBom(assembly, packetRows, scanned, units);
}

async function assertMobileDeliverySubmitAccess(user) {
  if (canManageCatalog(user) || isLoginAccessAdmin(user?.email)) return;
  const grant = await mobileAccessGrantForUser(user);
  if (evaluateWarehouseDeliveryDriverAppAccess(grant, user?.email)) return;
  if (evaluateWarehouseProductionAppAccess(grant, user?.email)) return;
  if (evaluateCarpentryWorkshopAppAccess(grant, user?.email)) return;
  if (evaluatePaintingWorkshopAppAccess(grant, user?.email)) return;
  const err = new Error('Warehouse delivery app access is not enabled for your account.');
  err.status = 403;
  throw err;
}

async function deliveryMobileSourceForUser(user) {
  const grant = await mobileAccessGrantForUser(user);
  if (
    isWarehouseProductionAppAllowed(grant)
    || evaluateWarehouseDeliveryDriverAppAccess(grant, user?.email)
  ) {
    return 'warehouse_production_mobile';
  }
  return 'warehouse_catalog_mobile';
}

async function opDeliverySessionOpen(body, user) {
  await assertMobileDeliverySubmitAccess(user);
  const sb = getService();
  const email = String(user?.email || '').trim().toLowerCase();
  const clientSessionId = String(body?.session_id || body?.sessionId || '').trim();
  let replacedStaleSession = false;

  if (clientSessionId && email) {
    const { data: clientRow } = await sb
      .from('warehouse_delivery_sessions')
      .select('id, delivery_number, status, created_by_email')
      .eq('id', clientSessionId)
      .maybeSingle();
    const rowEmail = String(clientRow?.created_by_email || '').trim().toLowerCase();
    if (
      clientRow?.id
      && rowEmail === email
      && String(clientRow.status) === 'draft'
    ) {
      return {
        session_id: clientRow.id,
        delivery_number: clientRow.delivery_number,
        reused: true,
      };
    }
    if (clientRow?.id && rowEmail === email && String(clientRow.status) !== 'draft') {
      replacedStaleSession = true;
    }
  }

  if (email) {
    const { data: existing } = await sb
      .from('warehouse_delivery_sessions')
      .select('id, delivery_number')
      .eq('status', 'draft')
      .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
      .eq('to_location', WAREHOUSE_TO_LOCATION_ID)
      .eq('created_by_email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return {
        session_id: existing.id,
        delivery_number: existing.delivery_number,
        reused: true,
        ...(replacedStaleSession ? { replaced_stale_session: true } : {}),
      };
    }
  }

  const deliveryNumber = await allocateWarehouseDeliveryNumber();
  const now = new Date().toISOString();
  const sessionId = newUuid();
  const mobileSource = await deliveryMobileSourceForUser(user);
  const creatorName = await productionWhatsappProducerName(user);
  const row = {
    id: sessionId,
    delivery_number: deliveryNumber,
    from_location: WAREHOUSE_FROM_LOCATION_ID,
    to_location: WAREHOUSE_TO_LOCATION_ID,
    status: 'draft',
    created_at: now,
    transfer_datetime: now,
    total_qty: 0,
    created_by_email: email || user?.email || null,
    created_by_name: creatorName || null,
    metadata: {
      source: mobileSource,
      hassan_alert_pending: false,
    },
  };
  const { error } = await sb.from('warehouse_delivery_sessions').insert(row);
  if (error) throw new Error(error.message || 'Failed to open delivery session');
  return {
    session_id: sessionId,
    delivery_number: deliveryNumber,
    reused: false,
    ...(replacedStaleSession ? { replaced_stale_session: true } : {}),
  };
}

function isHassanDeliveryUser(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (HASSAN_AWAD.emails.some((e) => e.toLowerCase() === email)) return true;
  const uid = String(user?.id || user?.uid || '').toLowerCase();
  return uid === String(HASSAN_AWAD.id).toLowerCase() || uid === String(WAREHOUSE_ACCEPT_USER_ID).toLowerCase();
}

/** Kitwe receiver UI + accept API (Hassan, or catalog admin on mirror test page). */
function canWarehouseDeliveryReceiverActions(user) {
  if (isHassanDeliveryUser(user)) return true;
  if (isLoginAccessAdmin(user?.email)) return true;
  if (canManageCatalog(user)) return true;
  return false;
}

function scanLineDriverChecked(line) {
  return line?.driver_checked === true || Boolean(line?.driver_checked_at);
}

async function uploadWarehouseDeliverySignaturePng(sessionId, b64Input) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('session_id is required.');
  let b64 = String(b64Input || '').trim();
  b64 = b64.replace(/^data:image\/png;base64,/, '');
  if (!b64) throw new Error('Missing signature image.');

  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new Error('Invalid signature image.');

  const objectPath = `${sid}.png`;
  await uploadBufferToFirebaseStorage({
    bucketFolder: 'warehouse-delivery-signatures',
    objectPath,
    buffer,
    contentType: 'image/png',
    cacheControl: '31536000',
  });

  const signatureUrl = firebaseStoragePublicUrl('warehouse-delivery-signatures', objectPath);
  if (!signatureUrl) throw new Error('Could not resolve signature URL.');
  return signatureUrl;
}

async function opDeliverySignatureUpload(body, user) {
  await assertMobileDeliverySubmitAccess(user);
  const sessionId = String(body.session_id || '').trim();
  if (!sessionId) throw new Error('session_id is required.');

  const sb = getService();
  const { data: session } = await sb
    .from('warehouse_delivery_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) throw new Error('Delivery session not found.');
  if (String(session.status) !== 'draft') {
    throw new Error('Delivery session is not open for editing.');
  }

  const signatureUrl = await uploadWarehouseDeliverySignaturePng(
    sessionId,
    body.signature_png_base64 || body.image_base64 || body.png_base64,
  );
  return { session_id: sessionId, signature_url: signatureUrl };
}

function buildDeliverySubmitResponse(session, extras = {}) {
  const meta = session.metadata || {};
  return {
    session_id: session.id,
    delivery_number: session.delivery_number,
    total_cartons: Number(session.total_qty) || 0,
    entry_count: extras.entry_count ?? null,
    whatsapp_sent: extras.whatsapp_sent ?? Boolean(meta.whatsapp_sent_at),
    submitted_at: session.submitted_at || extras.submitted_at || null,
    driver_signature_url: meta.driver_signature_url || extras.driver_signature_url || null,
    already_submitted: Boolean(extras.already_submitted),
  };
}

async function repairReturnCustomerFields(sb, { returnOrderId, entries }) {
  let rid = String(returnOrderId || '').trim();
  if (!rid && entries?.length) {
    for (const entry of entries) {
      const candidate = String(entry?.metadata?.return_order_id || '').trim();
      if (candidate) {
        rid = candidate;
        break;
      }
    }
  }
  if (!rid) return null;
  const { data: row } = await sb
    .from('warehouse_return_orders')
    .select('id, customer_name, customer_phone, return_number')
    .eq('id', rid)
    .maybeSingle();
  if (!row) return null;
  return {
    return_order_id: String(row.id),
    return_number: row.return_number || null,
    customer_name: String(row.customer_name || '').trim() || null,
    customer_phone: String(row.customer_phone || '').trim() || null,
  };
}

function warehouseDeliveryWhatsAppRoute(session) {
  const meta = session?.metadata || {};
  const dk = String(meta.document_kind || '').toLowerCase();
  const customerName = String(meta.customer_name || '').trim();
  if (dk === 'repair_delivery') {
    return {
      title: 'Repair delivery',
      fromName: 'Warehouse',
      toName: customerName || 'Customer',
      extraLines: [
        meta.return_number ? `Repair: ${meta.return_number}` : '',
        String(meta.driver_name || '').trim() ? `Driver: ${meta.driver_name}` : '',
      ].filter(Boolean),
    };
  }
  if (dk === 'order_delivery') {
    return {
      title: 'Order delivery',
      fromName: 'Warehouse',
      toName: customerName || 'Customer',
      extraLines: [
        meta.quote_number ? `Order: ${meta.quote_number}` : '',
        String(meta.driver_name || '').trim() ? `Driver: ${meta.driver_name}` : '',
      ].filter(Boolean),
    };
  }
  return {
    title: '',
    fromName: 'Warehouse',
    toName: 'Kitwe',
    extraLines: [],
  };
}

async function sendWarehouseDeliverySubmitWhatsApp({
  sb,
  sessionId,
  session,
  user,
  groups,
  driverName,
  totalCartons,
  byAssembly,
  assemblyById,
  submittedAt,
  entries: entriesArg,
  clientPdfBase64 = '',
}) {
  if (session?.metadata?.whatsapp_sent_at) {
    return { ok: true, skipped: 'already_sent' };
  }

  const accessRecord = await getLoginAccessRecord(user?.id);
  const userAlias = accessRecord?.mobile_display_name
    || accessRecord?.display_name
    || user?.user_metadata?.full_name
    || user?.full_name
    || user?.email
    || '—';

  const totalProducts = groups.reduce(
    (sum, group) => sum + Math.max(1, Number(group.units) || 1),
    0,
  );

  let entries = entriesArg;
  if (!entries?.length) {
    const { data: entryRows } = await sb
      .from('warehouse_delivery_entries')
      .select('*')
      .eq('session_id', sessionId);
    entries = entryRows || [];
  }

  const documentKind = String(session?.metadata?.document_kind || 'delivery').trim().toLowerCase();
  const adminQueueKind = documentKind === 'order_delivery' || documentKind === 'repair_delivery';
  const printGroups = adminQueueKind
    ? await resolveAdminQueuePrintGroups(sb, session)
    : sanitizeDeliveryNotePrintGroups(session?.metadata?.print_groups);

  let productGroups;
  let assemblyColorContext = null;
  if (adminQueueKind) {
    productGroups = whatsAppProductGroupsFromPrintGroups(printGroups);
  } else if (entries?.length) {
    assemblyColorContext = await loadWarehouseDeliveryColorContext(sb);
    productGroups = buildWarehouseDeliveryWhatsAppProductGroups(entries, assemblyColorContext);
  } else {
    productGroups = groups.map((group) => {
      const assemblyId = String(group.assembly_id || group.set_assembly_id || '');
      const assembly = assemblyById.get(assemblyId);
      const units = Math.max(1, Number(group.units) || 1);
      const packetRows = byAssembly.get(assemblyId) || [];
      return {
        assemblyName: assembly?.name || group.set_name || 'Product',
        units,
        packetLines: isAssemblyDeliveryFinishedUnits(assembly, packetRows)
          ? [{ name: assembly?.name || 'Product', quantity: units }]
          : packetRows.map((packet) => ({
            name: packet.name,
            quantity: units * Math.max(1, Number(packet.qty_per_unit) || 1),
          })),
      };
    });
  }

  const totalWhatsAppProducts = productGroups.reduce(
    (sum, group) => sum + Math.max(1, Number(group.units ?? group.quantity) || 1),
    0,
  );

  const route = warehouseDeliveryWhatsAppRoute({
    ...session,
    metadata: {
      ...(session?.metadata || {}),
      driver_name: String(driverName || session?.metadata?.driver_name || '').trim(),
    },
  });
  const whatsappMessage = buildWarehouseDeliveryWhatsAppMessage({
    title: route.title,
    extraLines: route.extraLines,
    fromName: route.fromName,
    toName: route.toName,
    sentBy: userAlias,
    userAlias,
    submittedAt: submittedAt || session?.submitted_at || new Date().toISOString(),
    driverName: String(driverName || session?.metadata?.driver_name || '').trim() || '—',
    routeLabel: route.title || 'Warehouse To Showroom',
    productGroups,
    totalPackets: Number(totalCartons) || Number(session?.total_qty) || 0,
    totalProducts: totalWhatsAppProducts || totalProducts,
  });

  const deliveryNumber = String(session?.delivery_number || sessionId || '').trim();
  const pdfFilename = `${deliveryNumber || 'delivery'}-delivery-note.pdf`;
  let pdfBase64 = String(clientPdfBase64 || '')
    .replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '')
    .replace(/\s+/g, '');
  if (adminQueueKind) pdfBase64 = '';

  if (!pdfBase64) {
    try {
      if (!entries?.length) {
        const { data: entryRows } = await sb
          .from('warehouse_delivery_entries')
          .select('*')
          .eq('session_id', sessionId);
        entries = entryRows || [];
      }
      if (printGroups.length || entries.length) {
        if (!assemblyColorContext && !adminQueueKind) {
          assemblyColorContext = await loadWarehouseDeliveryColorContext(sb);
        }
        const customerName = String(session?.metadata?.customer_name || '').trim();
        const customerPhone = String(session?.metadata?.customer_phone || '').trim();
        pdfBase64 = buildWarehouseDeliveryNotePdfBase64({
          session,
          entries,
          copies: 1,
          printGroups: adminQueueKind ? printGroups : (printGroups.length ? printGroups : undefined),
          assemblyColorContext: adminQueueKind ? null : assemblyColorContext,
          documentKind,
          customerName,
          customerPhone,
        });
      }
    } catch (pdfErr) {
      console.warn('[delivery-submit] delivery note PDF for WhatsApp failed:', pdfErr?.message || pdfErr);
    }
  }

  const whatsappResult = await sendWarehouseDeliveryWhatsApp({
    message: whatsappMessage,
    pdfBase64: pdfBase64 || undefined,
    pdfFilename,
  });
  if (whatsappResult?.ok) {
    const sentAt = new Date().toISOString();
    await sb.from('warehouse_delivery_sessions').update({
      metadata: {
        ...(session?.metadata || {}),
        whatsapp_sent_at: sentAt,
      },
    }).eq('id', sessionId);
  } else {
    console.warn('[delivery-submit] WhatsApp notify failed:', whatsappResult);
  }
  return whatsappResult;
}

function deliveryShipmentUnits(assembly, packetRows, truckBoxes) {
  const boxes = Math.max(1, Math.floor(Number(truckBoxes) || 0));
  if (!assemblyUsesWarehouseBoxLabels(assembly, packetRows)) {
    return {
      truckBoxes: boxes,
      finishedUnits: boxes,
      unitsPerCarton: null,
    };
  }
  const unitsPerCarton = assemblyUnitsPerCarton(assembly);
  return {
    truckBoxes: boxes,
    finishedUnits: deliveryTruckBoxesToFinishedUnits(assembly, packetRows, boxes),
    unitsPerCarton,
  };
}

/** Firestore rejects undefined field values — omit box keys when not units-per-box. */
function deliveryEntryBoxMetadata(shipment) {
  const per = shipment?.unitsPerCarton;
  if (!per || per <= 1) return {};
  return {
    truck_boxes: shipment.truckBoxes,
    units_per_carton: per,
  };
}

function stripUndefinedMetadata(metadata) {
  const out = {};
  Object.entries(metadata || {}).forEach(([key, val]) => {
    if (val !== undefined) out[key] = val;
  });
  return out;
}

async function discardFailedDeliverySubmitDraft(sb, sessionId) {
  try {
    await deleteWarehouseDeliverySessionHard(sb, sessionId);
  } catch (err) {
    console.warn('[delivery-submit] discard draft after failure:', err?.message || err);
  }
}

async function processSetDeliveryGroup({
  sb,
  sessionId,
  group,
  assemblyById,
  byAssembly,
  setItems,
  now,
  stockSourceLocationId = WAREHOUSE_FROM_LOCATION_ID,
}) {
  const setId = String(group.set_assembly_id || '');
  const setAssembly = assemblyById.get(setId);
  if (!setAssembly || !isWarehouseSetAssembly(setAssembly)) {
    throw new Error('Unknown set in shipment.');
  }

  const setItemsForRecipe = setItems || [];

  const units = Math.max(1, Number(group.units) || 1);
  const groupId = String(group.group_id || newUuid());
  const recipeComponents = resolveSetComponentsForDelivery(
    setId,
    units,
    setItemsForRecipe,
    [...assemblyById.values()],
  );
  const clientComponents = Array.isArray(group.components) ? group.components : [];
  if (!recipeComponents.length) {
    throw new Error(
      `Set ${setAssembly.name} has no products configured at Kitwe or Warehouse (factory). Add the set recipe in Warehouse catalog first.`,
    );
  }

  const entries = [];
  let totalCartons = 0;

  entries.push({
    id: newUuid(),
    session_id: sessionId,
    kind: 'set-parent',
    name: setAssembly.name,
    sku: setAssembly.family_sku,
    quantity: units,
    combo_id: groupId,
    metadata: stripUndefinedMetadata({
      delivery_set_group_id: groupId,
      set_assembly_id: setId,
      assembly_name: setAssembly.name,
      units,
    }),
  });

  for (const recipe of recipeComponents) {
    const comp = clientComponents.find((c) => String(c.assembly_id) === String(recipe.assembly_id));
    if (!comp) {
      throw new Error(`Confirm all products for set ${setAssembly.name} (${recipe.assembly_name}).`);
    }
    const assemblyId = String(recipe.assembly_id);
    const assembly = assemblyById.get(assemblyId);
    if (!assembly) throw new Error(`Unknown product in set ${setAssembly.name}.`);
    const packetRows = byAssembly.get(assemblyId) || [];
    const productQty = recipe.product_qty;

    const scanned = new Map();
    (comp.scans || []).forEach((line) => {
      const pid = String(line.packet_id || '');
      const qty = Math.max(0, Number(line.quantity) || 0);
      if (!pid || qty < 1) return;
      scanned.set(pid, (scanned.get(pid) || 0) + qty);
    });

    if (isAssemblyDeliveryFinishedUnits(assembly, packetRows)) {
      const finishedChecked = comp.finished_driver_checked === true
        || scanLineDriverChecked({
          driver_checked: comp.product_driver_checked,
          driver_checked_at: comp.product_driver_checked_at,
        });
      const validation = validateAssemblyShipmentBom(assembly, packetRows, scanned, productQty, {
        finishedDriverChecked: finishedChecked,
      });
      if (!validation.ok) {
        throw new Error(validation.message || `Set product ${assembly.name} not confirmed`);
      }
      const shipment = deliveryShipmentUnits(assembly, packetRows, productQty);
      await assertAssemblyStockAvailable(
        sb,
        assemblyId,
        stockSourceLocationId,
        shipment.finishedUnits,
      );
      totalCartons += shipment.finishedUnits;
      entries.push({
        id: newUuid(),
        session_id: sessionId,
        kind: 'set-component',
        name: assembly.name,
        sku: assembly.family_sku,
        quantity: shipment.finishedUnits,
        parent_combo_id: groupId,
        metadata: stripUndefinedMetadata({
          delivery_set_group_id: groupId,
          assembly_id: assemblyId,
          assembly_name: assembly.name,
          finished_unit: true,
          units: shipment.finishedUnits,
          stock_deduct_location_id: stockSourceLocationId,
          ...deliveryEntryBoxMetadata(shipment),
        }),
      });
      continue;
    }

    const validation = validateAssemblyShipmentBom(assembly, packetRows, scanned, productQty);
    if (!validation.ok) {
      throw new Error(validation.message || `Set product ${assembly.name} incomplete`);
    }

    const shipment = deliveryShipmentUnits(assembly, packetRows, productQty);
    const truckMultiplier = shipment.unitsPerCarton ? shipment.truckBoxes : productQty;

    entries.push({
      id: newUuid(),
      session_id: sessionId,
      kind: 'set-component',
      name: assembly.name,
      sku: assembly.family_sku,
      quantity: productQty,
      parent_combo_id: groupId,
      metadata: stripUndefinedMetadata({
        delivery_set_group_id: groupId,
        assembly_id: assemblyId,
        assembly_name: assembly.name,
        units: productQty,
      }),
    });

    for (const packet of packetRows) {
      const moveQty = truckMultiplier * Math.max(1, Number(packet.qty_per_unit) || 1);
      const scanLine = (comp.scans || []).find((s) => String(s.packet_id) === String(packet.id));
      const have = scanned.get(String(packet.id)) || 0;
      if (have < moveQty) {
        throw new Error(`Check all cartons for ${setAssembly.name} → ${assembly.name}.`);
      }
      if (!scanLineDriverChecked(scanLine || {})) {
        throw new Error(`Driver must confirm every packet for ${setAssembly.name} → ${assembly.name}.`);
      }
      await assertPacketStockAvailable(sb, packet.id, stockSourceLocationId, moveQty);
      totalCartons += moveQty;
      entries.push({
        id: newUuid(),
        session_id: sessionId,
        kind: 'packet',
        name: packet.name,
        sku: packet.sku,
        quantity: moveQty,
        metadata: stripUndefinedMetadata({
          delivery_set_group_id: groupId,
          set_assembly_id: setId,
          packet_id: packet.id,
          assembly_id: assemblyId,
          assembly_name: assembly.name,
          packet_number: packet.packet_number,
          units: shipment.finishedUnits,
          stock_deduct_location_id: stockSourceLocationId,
          ...deliveryEntryBoxMetadata(shipment),
          driver_checked_at: scanLine?.driver_checked_at || now,
          receiver_checked_at: null,
        }),
      });
    }
  }

  return { entries, totalCartons };
}

async function opDeliveryProductionQueueList(user) {
  await assertMobileDeliverySubmitAccess(user);
  const sb = getService();
  const { listRepairDeliveriesForMobile, listOrderDeliveriesForMobile } = await import('../lib/warehouseDeliveryAdminQueue.js');
  const repairs = await listRepairDeliveriesForMobile(sb);
  const orders = await listOrderDeliveriesForMobile(sb);
  return { repairs, orders };
}

async function opDeliverySubmit(body, user, { skipAccessCheck = false } = {}) {
  if (!skipAccessCheck) await assertMobileDeliverySubmitAccess(user);
  const sessionId = String(body.session_id || '');
  const groups = Array.isArray(body.groups) ? body.groups : [];
  let driverName = String(body.driver_name || body.driverName || '').trim();
  let driverId = String(body.driver_id || body.driverId || '').trim();
  const customerDriverNameRaw = String(body.customer_driver_name || body.customerDriverName || '').trim();
  const customerDriverPhone = String(body.customer_driver_phone || body.customerDriverPhone || '').trim();
  const { capitalizePersonName } = await import('../../src/utils/warehouseProductionDeliveryStaging.js');
  const clientPdfBase64 = String(
    body.delivery_note_pdf_base64 || body.deliveryNotePdfBase64 || '',
  ).trim();
  let driverSignatureUrl = String(body.driver_signature_url || body.driverSignatureUrl || '').trim();
  if (!sessionId) throw new Error('session_id is required.');
  if (!groups.length) throw new Error('Add at least one product group.');
  if (customerDriverNameRaw && driverId) {
    throw new Error('Choose either a fleet driver or a customer driver — not both.');
  }
  if (customerDriverNameRaw) {
    if (!customerDriverPhone) throw new Error('Customer driver phone is required.');
    driverName = capitalizePersonName(customerDriverNameRaw);
    driverId = '';
  }
  if (!driverName) throw new Error('Select a driver before submitting.');

  const sb = getService();
  const { data: session } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) throw new Error('Delivery session not found.');
  if (String(session.status) === 'submitted') {
    if (!session.metadata?.whatsapp_sent_at && groups.length) {
      const [{ data: packets }, { data: links }, { data: assemblies }, { data: setItems }] = await Promise.all([
        sb.from('warehouse_packets').select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
        sb.from('warehouse_assembly_packets').select('*'),
        sb.from('warehouse_assemblies').select('id, name, family_sku, packet_count, inventory_mode, units_per_carton, item_kind'),
        sb.from('warehouse_set_items').select('*'),
      ]);
      const byAssembly = buildPacketsByAssembly(links || [], packets || []);
      const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
      let whatsappResult = { ok: false };
      try {
        whatsappResult = await sendWarehouseDeliverySubmitWhatsApp({
          sb,
          sessionId,
          session,
          user,
          groups,
          driverName,
          totalCartons: session.total_qty,
          byAssembly,
          assemblyById,
          submittedAt: session.submitted_at,
          clientPdfBase64,
        });
      } catch (waErr) {
        console.warn('[delivery-submit] WhatsApp retry failed:', waErr?.message || waErr);
      }
      const { data: refreshed } = await sb
        .from('warehouse_delivery_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      return buildDeliverySubmitResponse(refreshed || session, {
        already_submitted: true,
        whatsapp_sent: Boolean(whatsappResult?.ok),
      });
    }
    return buildDeliverySubmitResponse(session, { already_submitted: true });
  }
  if (String(session.status) !== 'draft') {
    throw new Error('Delivery session is not open for editing.');
  }

  const deliveryFlowMeta = String(session.metadata?.delivery_flow || '').trim();
  const isFarmDelivery = deliveryFlowMeta === 'farm'
    || String(session.metadata?.document_kind || '').trim() === 'farm_delivery';
  let stockSourceLocationId = WAREHOUSE_FROM_LOCATION_ID;
  let farmCreditLocationId = '';
  if (isFarmDelivery) {
    const { resolveFarmWarehouseIds, creditFarmStockFromDeliveryEntries } = await import('../lib/farmWarehouseDelivery.js');
    const { floor2Id, farmId } = await resolveFarmWarehouseIds(sb);
    if (String(session.from_location) !== floor2Id || String(session.to_location) !== farmId) {
      throw new Error('Not a Farm Warehouse delivery session.');
    }
    stockSourceLocationId = floor2Id;
    farmCreditLocationId = farmId;
  }

  if (!driverSignatureUrl) {
    const inlineSig = body.signature_png_base64 || body.image_base64 || body.png_base64;
    if (inlineSig) {
      driverSignatureUrl = await uploadWarehouseDeliverySignaturePng(sessionId, inlineSig);
    }
  }

  const [{ data: packets }, { data: links }, { data: assemblies }, { data: setItems }] = await Promise.all([
    sb.from('warehouse_packets').select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
    sb.from('warehouse_assembly_packets').select('*'),
    sb.from('warehouse_assemblies').select('id, name, family_sku, packet_count, inventory_mode, units_per_carton, item_kind'),
    sb.from('warehouse_set_items').select('*'),
  ]);
  const byAssembly = buildPacketsByAssembly(links || [], packets || []);
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  const repairFloor2Map = isFarmDelivery ? new Map() : await repairFloor2DeliveryAssemblyMap(sb);
  const repairByReturnId = new Map(
    [...repairFloor2Map.values()].map((row) => [String(row.return_order_id), row]),
  );
  const submitReturnOrderId = isFarmDelivery
    ? ''
    : String(body.return_order_id || body.returnOrderId || '').trim();
  const { listOrderDeliveriesForMobile, assertAdminQueueDeliveryHold } = await import('../lib/warehouseDeliveryAdminQueue.js');
  const orderRows = isFarmDelivery ? [] : await listOrderDeliveriesForMobile(sb);
  const orderFloor2Map = new Map(orderRows.map((row) => [String(row.assembly_id), row]));

  const entries = [];
  let totalCartons = 0;
  const now = new Date().toISOString();

  for (const group of groups) {
    if (isWarehouseSetDeliveryGroup(group)) {
      const setResult = await processSetDeliveryGroup({
        sb,
        sessionId,
        group,
        assemblyById,
        byAssembly,
        setItems: setItems || [],
        now,
        stockSourceLocationId,
      });
      entries.push(...setResult.entries);
      totalCartons += setResult.totalCartons;
      continue;
    }

    const assemblyId = String(group.assembly_id || '');
    const units = Math.max(1, Number(group.units) || 1);
    const assembly = assemblyById.get(assemblyId);
    if (!assembly) throw new Error('Unknown product in shipment.');

    const packetRows = byAssembly.get(assemblyId) || [];
    const scanned = new Map();
    (group.scans || []).forEach((line) => {
      const pid = String(line.packet_id || '');
      const qty = Math.max(0, Number(line.quantity) || 0);
      if (!pid || qty < 1) return;
      scanned.set(pid, (scanned.get(pid) || 0) + qty);
    });

    if (isAssemblyDeliveryFinishedUnits(assembly, packetRows)) {
      const finishedChecked = group.finished_driver_checked === true
        || scanLineDriverChecked({
          driver_checked: group.finished_driver_checked,
          driver_checked_at: group.finished_driver_checked_at,
        });
      const validation = validateAssemblyShipmentBom(assembly, packetRows, scanned, units, {
        finishedDriverChecked: finishedChecked,
      });
      if (!validation.ok) {
        const err = new Error(validation.message || 'Finished product not confirmed');
        err.details = validation;
        throw err;
      }
      const shipment = deliveryShipmentUnits(assembly, packetRows, units);
      let repairStaging = null;
      if (submitReturnOrderId) {
        const pinned = repairByReturnId.get(submitReturnOrderId);
        if (pinned && String(pinned.assembly_id) === assemblyId) {
          repairStaging = pinned;
        }
      }
      if (!isFarmDelivery && !repairStaging) {
        repairStaging = repairFloor2Map.get(assemblyId) || null;
      }
      let orderStaging = null;
      if (!isFarmDelivery && !repairStaging) {
        const groupQuoteId = String(group.quote_id || group.quoteId || '').trim();
        if (groupQuoteId) {
          orderStaging = orderRows.find((row) => String(row.quote_id || '') === groupQuoteId) || null;
        }
        if (!orderStaging) {
          orderStaging = orderFloor2Map.get(assemblyId) || null;
        }
      }
      const adminQueue = isFarmDelivery ? null : (repairStaging || orderStaging);
      if (adminQueue) {
        await assertAdminQueueDeliveryHold(sb, {
          repairStaging,
          orderStaging,
          assemblyId,
          requiredQty: shipment.finishedUnits,
        });
      } else {
        await assertAssemblyStockAvailable(
          sb,
          assemblyId,
          stockSourceLocationId,
          shipment.finishedUnits,
        );
      }
      totalCartons += shipment.finishedUnits;
      const driverCheckedAt = group.finished_driver_checked_at || now;
      const orderDisplayName = String(
        group.assembly_name || orderStaging?.assembly_name || '',
      ).trim();
      const entryName = orderStaging && orderDisplayName ? orderDisplayName : assembly.name;
      entries.push({
        id: newUuid(),
        session_id: sessionId,
        kind: 'assembly',
        name: entryName,
        sku: assembly.family_sku,
        quantity: shipment.finishedUnits,
        metadata: stripUndefinedMetadata({
          assembly_id: assemblyId,
          assembly_name: entryName,
          finished_unit: true,
          units: shipment.finishedUnits,
          ...deliveryEntryBoxMetadata(shipment),
          driver_checked_at: driverCheckedAt,
          receiver_checked_at: null,
          ...(!adminQueue ? { stock_deduct_location_id: stockSourceLocationId } : {}),
          ...(adminQueue ? {
            admin_queue_delivery: true,
            delivery_admin_hold: true,
            ...(repairStaging ? { floor2_repair_delivery: true } : {}),
            return_order_id: repairStaging?.return_order_id || null,
            return_number: repairStaging?.return_number || null,
            return_has_customer: Boolean(repairStaging?.has_customer),
            return_customer_name: repairStaging?.customer_name || null,
            return_customer_phone: repairStaging?.customer_phone || null,
            production_job_id: orderStaging?.production_job_id || null,
            quote_id: orderStaging?.quote_id || null,
            quote_number: orderStaging?.quote_number || null,
            customer_name: orderStaging?.customer_name || null,
            customer_phone: orderStaging?.customer_phone || null,
          } : {}),
        }),
      });
      continue;
    }

    const validation = validateAssemblyShipmentBom(assembly, packetRows, scanned, units);
    if (!validation.ok) {
      const err = new Error(validation.message || 'BOM incomplete');
      err.details = validation;
      throw err;
    }

    const shipment = deliveryShipmentUnits(assembly, packetRows, units);
    const truckMultiplier = shipment.unitsPerCarton ? shipment.truckBoxes : units;

    for (const packet of packetRows) {
      const moveQty = truckMultiplier * Math.max(1, Number(packet.qty_per_unit) || 1);
      const scanLine = (group.scans || []).find((s) => String(s.packet_id) === String(packet.id));
      const have = scanned.get(String(packet.id)) || 0;
      if (have < moveQty) {
        throw new Error(`Check all cartons for ${assembly.name} (packet #${packet.packet_number || '?'}) before submit.`);
      }
      if (!scanLineDriverChecked(scanLine || {})) {
        throw new Error(`Driver must confirm every packet carton for ${assembly.name}.`);
      }
      await assertPacketStockAvailable(sb, packet.id, stockSourceLocationId, moveQty);
      totalCartons += moveQty;
      const driverCheckedAt = scanLine?.driver_checked_at || now;
      entries.push({
        id: newUuid(),
        session_id: sessionId,
        kind: 'packet',
        name: packet.name,
        sku: packet.sku,
        quantity: moveQty,
        metadata: stripUndefinedMetadata({
          packet_id: packet.id,
          assembly_id: assemblyId,
          assembly_name: assembly.name,
          packet_number: packet.packet_number,
          units: shipment.finishedUnits,
          ...deliveryEntryBoxMetadata(shipment),
          driver_checked_at: driverCheckedAt,
          receiver_checked_at: null,
          stock_deduct_location_id: stockSourceLocationId,
        }),
      });
    }
  }

  try {
  const { deductSourceStockOnDeliverySubmit } = await import('../lib/warehouseDeliveryAcceptStock.js');
  await deductSourceStockOnDeliverySubmit(sb, entries, { now, fromLocationId: stockSourceLocationId });
  if (farmCreditLocationId) {
    const { creditFarmStockFromDeliveryEntries } = await import('../lib/farmWarehouseDelivery.js');
    await creditFarmStockFromDeliveryEntries(sb, entries, farmCreditLocationId);
  }

  for (const entry of entries) {
    const { error } = await sb.from('warehouse_delivery_entries').insert({
      ...entry,
      created_at: now,
    });
    if (error) throw new Error(error.message || 'Failed to save delivery lines');
  }

  const mobileSource = await deliveryMobileSourceForUser(user);
  const userAlias = (await productionWhatsappProducerName(user)) || '—';

  const repairContext = await repairReturnCustomerFields(sb, {
    returnOrderId: body.return_order_id || body.returnOrderId,
    entries,
  });
  const clientDocumentKind = String(body.document_kind || body.documentKind || '').trim().toLowerCase();
  const repairSessionMeta = repairContext
    ? {
      document_kind: 'repair_delivery',
      return_order_id: repairContext.return_order_id,
      return_number: repairContext.return_number,
      customer_name: repairContext.customer_name,
      customer_phone: repairContext.customer_phone,
    }
    : {};

  const orderEntry = entries.find(
    (e) => e?.metadata?.admin_queue_delivery === true
      && !e?.metadata?.return_order_id
      && (e.metadata?.production_job_id || e.metadata?.quote_id),
  );
  const orderSessionMeta = orderEntry
    ? {
      document_kind: 'order_delivery',
      production_job_id: orderEntry.metadata?.production_job_id || null,
      quote_id: orderEntry.metadata?.quote_id || null,
      quote_number: orderEntry.metadata?.quote_number || null,
      customer_name: orderEntry.metadata?.customer_name || null,
      customer_phone: orderEntry.metadata?.customer_phone || null,
    }
    : (clientDocumentKind === 'order_delivery' ? { document_kind: 'order_delivery' } : {});

  let clientPrintGroups = sanitizeDeliveryNotePrintGroups(body.print_groups || body.printGroups);
  if (String(orderSessionMeta.document_kind || clientDocumentKind) === 'order_delivery') {
    try {
      const quoteLines = await loadQuoteLinesForDeliveryNote(sb, {
        quoteId: orderSessionMeta.quote_id || groups?.[0]?.quote_id,
        quoteNumber: orderSessionMeta.quote_number || groups?.[0]?.quote_number,
      });
      const fromQuote = printGroupsFromQuoteLines(quoteLines);
      if (fromQuote.length) clientPrintGroups = fromQuote;
    } catch (quotePrintErr) {
      console.warn('[delivery-submit] quote print groups:', quotePrintErr?.message || quotePrintErr);
    }
  }

  const dispatchedByForFarm = String(
    body.dispatched_by_name || body.dispatchedByName || userAlias || '',
  ).trim();

  const { error: updErr } = await sb.from('warehouse_delivery_sessions').update({
    status: 'submitted',
    submitted_at: now,
    total_qty: totalCartons,
    created_by_name: session.created_by_name || userAlias || null,
    metadata: {
      ...(session.metadata || {}),
      ...(isFarmDelivery ? {} : repairSessionMeta),
      ...(isFarmDelivery ? {} : orderSessionMeta),
      ...(clientPrintGroups.length ? { print_groups: clientPrintGroups } : {}),
      source: mobileSource,
      document_kind: isFarmDelivery ? 'farm_delivery' : (session.metadata?.document_kind || undefined),
      hassan_alert_pending: isFarmDelivery ? false : true,
      ...(isFarmDelivery ? {} : { hassan_alert_at: now }),
      submitted_by_email: user?.email || null,
      dispatched_by_name: isFarmDelivery ? dispatchedByForFarm : userAlias,
      driver_id: driverId || null,
      driver_name: driverName,
      driver_signature_url: driverSignatureUrl || null,
      ...(customerDriverNameRaw && !isFarmDelivery ? {
        customer_driver_name: capitalizePersonName(customerDriverNameRaw),
        customer_driver_phone: customerDriverPhone,
        customer_driver_signed: true,
      } : {}),
    },
  }).eq('id', sessionId);
  if (updErr) throw new Error(updErr.message || 'Failed to submit delivery');

  if (!isFarmDelivery) {
    try {
      const { advanceAdminQueueOnDeliverySubmit } = await import('../lib/warehouseDeliveryAdminQueue.js');
      await advanceAdminQueueOnDeliverySubmit(sb, entries, {
        submittedAt: now,
        driverName,
        customerDriverName: customerDriverNameRaw ? capitalizePersonName(customerDriverNameRaw) : '',
        customerDriverPhone,
      });
    } catch (markErr) {
      console.warn('[delivery-submit] admin queue mark:', markErr?.message || markErr);
    }
  }

  let whatsappResult = { ok: false };
  if (!isFarmDelivery) try {
    whatsappResult = await sendWarehouseDeliverySubmitWhatsApp({
      sb,
      sessionId,
      session: {
        ...session,
        submitted_at: now,
        total_qty: totalCartons,
        metadata: {
          ...(session.metadata || {}),
          ...repairSessionMeta,
          ...orderSessionMeta,
          ...(clientPrintGroups.length ? { print_groups: clientPrintGroups } : {}),
          source: mobileSource,
          hassan_alert_pending: true,
          hassan_alert_at: now,
          submitted_by_email: user?.email || null,
          dispatched_by_name: userAlias,
          driver_id: driverId || null,
          driver_name: driverName,
          driver_signature_url: driverSignatureUrl || null,
        },
      },
      user,
      groups,
      driverName,
      totalCartons,
      byAssembly,
      assemblyById,
      submittedAt: now,
      entries,
      clientPdfBase64,
    });
  } catch (waErr) {
    console.warn('[delivery-submit] WhatsApp notify failed:', waErr?.message || waErr);
  }

  const { data: refreshedSession } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  return buildDeliverySubmitResponse(refreshedSession || session, {
    entry_count: entries.length,
    whatsapp_sent: Boolean(whatsappResult?.ok),
    submitted_at: now,
    driver_signature_url: driverSignatureUrl || null,
  });
  } catch (submitErr) {
    await discardFailedDeliverySubmitDraft(sb, sessionId);
    throw submitErr;
  }
}

const WAREHOUSE_PRODUCTION_MOBILE_SOURCE = 'warehouse_production_mobile';
const WAREHOUSE_CATALOG_MOBILE_SOURCE = 'warehouse_catalog_mobile';
const WAREHOUSE_MOBILE_DELIVERY_SOURCES = new Set([
  WAREHOUSE_PRODUCTION_MOBILE_SOURCE,
  WAREHOUSE_CATALOG_MOBILE_SOURCE,
]);

function mobileSentDeliverySessionEligible(session) {
  const meta = session?.metadata || {};
  const src = String(meta.source || '');
  if (WAREHOUSE_MOBILE_DELIVERY_SOURCES.has(src)) return true;
  const dk = String(meta.document_kind || '').toLowerCase();
  if (dk === 'repair_delivery' || dk === 'order_delivery' || dk === 'sold_delivery') return true;
  if (meta.return_order_id || meta.return_number) return true;
  if (meta.production_job_id || meta.quote_id || meta.quote_number) return true;
  if (meta.storage_send_id || meta.storage_number) return true;
  return false;
}

function sentDeliveryDisplayNumber(session) {
  const meta = session?.metadata || {};
  const ro = String(meta.return_number || '').trim();
  if (ro) return ro;
  const quote = String(meta.quote_number || '').trim();
  if (quote) return quote;
  const storageNo = String(meta.storage_number || '').trim();
  if (storageNo) return storageNo;
  if (String(meta.document_kind || '').toLowerCase() === 'order_delivery' && meta.production_job_id) {
    return `Job ${String(meta.production_job_id).slice(0, 8)}`;
  }
  return session.delivery_number;
}

function canViewWarehouseSentDeliverySession(session, user) {
  if (canManageCatalog(user) || isLoginAccessAdmin(user?.email)) return true;
  const email = String(user?.email || '').trim().toLowerCase();
  const creator = String(session?.created_by_email || '').trim().toLowerCase();
  return Boolean(email && creator && creator === email);
}

function formatSentDriverLabel(meta = {}) {
  const name = String(meta.driver_name || meta.customer_driver_name || '').trim();
  const phone = String(meta.customer_driver_phone || '').trim();
  if (name && phone && !name.includes(phone)) return `${name} · ${phone}`;
  return name;
}

function mapSentDeliveryListRow(row) {
  const meta = row?.metadata || {};
  const documentKind = String(meta.document_kind || 'delivery').trim() || 'delivery';
  return {
    session_id: row.id,
    delivery_number: row.delivery_number,
    display_number: sentDeliveryDisplayNumber(row),
    document_kind: documentKind,
    status: row.status,
    submitted_at: row.submitted_at || row.created_at,
    driver_name: formatSentDriverLabel(meta),
    dispatched_by_name: meta.dispatched_by_name || row.created_by_name || '',
    customer_name: String(meta.customer_name || '').trim(),
    customer_phone: String(meta.customer_phone || '').trim(),
    total_qty: row.total_qty,
    storage_send_id: String(meta.storage_send_id || '').trim() || null,
  };
}

async function opDeliverySentList(body, user) {
  await assertMobileDeliverySubmitAccess(user);
  const sb = getService();
  const limit = Math.min(80, Math.max(1, Number(body.limit) || 40));
  const email = String(user?.email || '').trim().toLowerCase();
  const admin = canManageCatalog(user) || isLoginAccessAdmin(user?.email);

  let query = sb
    .from('warehouse_delivery_sessions')
    .select('id, delivery_number, status, submitted_at, created_at, total_qty, metadata, created_by_email, created_by_name')
    .eq('from_location', WAREHOUSE_FROM_LOCATION_ID)
    .eq('to_location', WAREHOUSE_TO_LOCATION_ID)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(limit * 2);

  if (!admin && email) {
    query = query.eq('created_by_email', email);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to load deliveries');

  const sessions = (data || [])
    .filter((row) => mobileSentDeliverySessionEligible(row))
    .map(mapSentDeliveryListRow);

  const storageRows = await listStorageSendsForSentDeliveries(sb, { limit, email, admin });
  const sessionIds = new Set(sessions.map((s) => s.session_id));
  const storageSendIds = new Set(
    sessions
      .map((s) => String(s.storage_send_id || '').trim())
      .filter(Boolean),
  );
  for (const row of storageRows) {
    const sid = String(row.session_id || '').trim();
    const sendId = String(row.storage_send_id || '').trim();
    if (sid && sessionIds.has(sid)) continue;
    if (sendId && storageSendIds.has(sendId)) continue;
    if (row.delivery_session_id && sessionIds.has(row.delivery_session_id)) continue;
    sessions.push(row);
    if (sid) sessionIds.add(sid);
    if (sendId) storageSendIds.add(sendId);
  }

  sessions.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));

  return { sessions: sessions.slice(0, limit) };
}

async function loadQuoteRoutingMeta(sb, { quoteId, quoteNumber } = {}) {
  const qid = String(quoteId || '').trim();
  if (qid) {
    const { data } = await sb
      .from('quote_production_routing')
      .select('metadata')
      .eq('quote_id', qid)
      .maybeSingle();
    if (data?.metadata) return data.metadata;
  }
  const qn = String(quoteNumber || '').trim();
  if (!qn) return {};
  const { data: quote } = await sb
    .from('quotations')
    .select('id')
    .eq('quote_number', qn)
    .maybeSingle();
  if (!quote?.id) return {};
  const { data } = await sb
    .from('quote_production_routing')
    .select('metadata')
    .eq('quote_id', quote.id)
    .maybeSingle();
  return data?.metadata || {};
}

async function resolveAdminQueuePrintGroups(sb, session) {
  const meta = session?.metadata || {};
  const kind = String(meta.document_kind || '').toLowerCase();
  const saved = sanitizeDeliveryNotePrintGroups(meta.print_groups);
  if (kind === 'order_delivery' || meta.quote_id || meta.quote_number) {
    const routingMeta = await loadQuoteRoutingMeta(sb, {
      quoteId: meta.quote_id,
      quoteNumber: meta.quote_number || sentDeliveryDisplayNumber(session),
    });
    const quoteLines = await loadQuoteLinesForDeliveryNote(sb, {
      quoteId: meta.quote_id,
      quoteNumber: meta.quote_number || sentDeliveryDisplayNumber(session),
      fallbackLines: routingMeta.lines,
    });
    const fromQuote = printGroupsFromQuoteLines(quoteLines);
    if (fromQuote.length) return fromQuote;
  }
  if (kind === 'repair_delivery') {
    if (saved.length) return saved;
    const rid = String(meta.return_order_id || '').trim();
    if (rid) {
      const { data: row } = await sb
        .from('warehouse_return_orders')
        .select('assembly_name, quantity')
        .eq('id', rid)
        .maybeSingle();
      const name = String(row?.assembly_name || '').trim();
      if (name) {
        return sanitizeDeliveryNotePrintGroups([{
          assembly_name: name,
          units: row?.quantity,
          lines: [],
        }]);
      }
    }
  }
  return saved;
}

async function loadQuoteLinesForDeliveryNote(sb, { quoteId, quoteNumber, fallbackLines } = {}) {
  let qid = String(quoteId || '').trim();
  if (!qid) {
    const qn = String(quoteNumber || '').trim();
    if (qn) {
      const { data: quote } = await sb
        .from('quotations')
        .select('id')
        .eq('quote_number', qn)
        .maybeSingle();
      qid = String(quote?.id || '').trim();
    }
  }
  if (qid) {
    const { data: items } = await sb
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', qid)
      .order('sort_order');
    if (items?.length) return items.map((it) => buildProductionLineSummaryRow(it));
  }
  return Array.isArray(fallbackLines) ? fallbackLines : [];
}

async function resolveSentDeliveryPrintGroups(sb, session, entries, nameFormatter) {
  const adminGroups = await resolveAdminQueuePrintGroups(sb, session);
  if (adminGroups.length) return adminGroups;
  const saved = sanitizeDeliveryNotePrintGroups(session?.metadata?.print_groups);
  if (saved.length) return saved;
  return sanitizeDeliveryNotePrintGroups(
    buildDeliveryPrintGroupsFromEntries(entries || [], nameFormatter),
  );
}

async function opDeliverySentDetail(body, user) {
  await assertMobileDeliverySubmitAccess(user);
  const sessionId = String(body.session_id || body.sessionId || '').trim();
  if (!sessionId) throw new Error('session_id is required.');

  const sb = getService();
  let { data: session, error: sessErr } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessErr) throw new Error(sessErr.message || 'Failed to load delivery');
  if (!session) {
    try {
      const { storage_send: storageRow } = await getWarehouseStorageSend(sb, sessionId);
      if (!canManageCatalog(user) && !isLoginAccessAdmin(user?.email)) {
        const email = String(user?.email || '').trim().toLowerCase();
        const creator = String(storageRow?.created_by_email || '').trim().toLowerCase();
        if (!email || creator !== email) {
          const err = new Error('You can only view your own sent deliveries.');
          err.status = 403;
          throw err;
        }
      }
      return buildSoldDeliverySentDetail(sb, sessionId);
    } catch (err) {
      if (err?.status === 403) throw err;
      throw new Error('Delivery not found.');
    }
  }
  if (!mobileSentDeliverySessionEligible(session)) {
    throw new Error('Delivery was not sent from the Delivery app.');
  }
  if (!canViewWarehouseSentDeliverySession(session, user)) {
    const err = new Error('You can only view your own sent deliveries.');
    err.status = 403;
    throw err;
  }

  const { data: entries, error: entErr } = await sb
    .from('warehouse_delivery_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (entErr) throw new Error(entErr.message || 'Failed to load delivery lines');

  const assemblyColorContext = await loadWarehouseDeliveryColorContext(sb);
  const nameFormatter = createWarehouseDeliveryNameFormatter(assemblyColorContext);

  const meta = session.metadata || {};
  const signatureUrl = meta.driver_signature_url || '';
  const { fetchDeliverySignatureAsDataUri } = await import('../lib/deliverySignatureInline.js');
  const driverSignatureDataUri = signatureUrl
    ? await fetchDeliverySignatureAsDataUri(signatureUrl)
    : '';
  const documentKind = String(meta.document_kind || 'delivery').trim() || 'delivery';
  const routingMeta = (documentKind === 'order_delivery' || meta.quote_id || meta.quote_number)
    ? await loadQuoteRoutingMeta(sb, { quoteId: meta.quote_id, quoteNumber: meta.quote_number })
    : {};
  const customerSentLines = deliveryCustomerSentLines(entries || []).map((line) => ({
    id: line.id,
    label: warehousePacketDisplayLabel(line),
    sent_at: line.metadata?.sent_to_customer_at || null,
  }));
  const printGroups = await resolveSentDeliveryPrintGroups(sb, session, entries, nameFormatter);
  return {
    session: {
      id: session.id,
      delivery_number: session.delivery_number,
      display_number: sentDeliveryDisplayNumber(session),
      document_kind: documentKind,
      status: session.status,
      submitted_at: session.submitted_at || session.created_at,
      driver_name: String(meta.driver_name || meta.customer_driver_name || '').trim(),
      driver_phone: String(meta.customer_driver_phone || '').trim(),
      dispatched_by_name: meta.dispatched_by_name || session.created_by_name || '',
      driver_signature_url: signatureUrl,
      customer_name: String(meta.customer_name || routingMeta.customer_name || '').trim(),
      customer_phone: String(meta.customer_phone || routingMeta.customer_phone || '').trim(),
    },
    print_groups: printGroups,
    customer_sent_lines: customerSentLines,
    driver_signature_data_uri: driverSignatureDataUri,
  };
}

async function opDeliveryNumberReset(user) {
  if (!isLoginAccessAdmin(user?.email) && !canManageCatalog(user)) {
    const err = new Error('Admin catalog access required.');
    err.status = 403;
    throw err;
  }
  const confirm = String(user?.email || '').trim().toLowerCase();
  const result = await resetWarehouseDeliveryNumberSequence();
  console.info('[delivery-number-reset]', confirm || 'unknown', result?.next_delivery_number);
  return result;
}

async function opDeliveryCancel(body, user) {
  const sessionId = String(body.session_id || body.sessionId || '').trim();
  const deliveryNumber = String(body.delivery_number || body.deliveryNumber || '').trim();
  if (!sessionId && !deliveryNumber) throw new Error('session_id or delivery_number is required.');

  const sb = getService();
  let sid = sessionId;
  if (!sid && deliveryNumber) {
    const { data: row } = await sb
      .from('warehouse_delivery_sessions')
      .select('id, created_by_email, status')
      .eq('delivery_number', deliveryNumber)
      .maybeSingle();
    if (!row?.id) throw new Error('Delivery not found.');
    sid = row.id;
  }

  const { data: session } = await sb
    .from('warehouse_delivery_sessions')
    .select('id, created_by_email, status')
    .eq('id', sid)
    .maybeSingle();
  if (!session) throw new Error('Delivery not found.');

  const email = String(user?.email || '').trim().toLowerCase();
  const creator = String(session.created_by_email || '').trim().toLowerCase();
  const isAdmin = isLoginAccessAdmin(user?.email) || canManageCatalog(user);
  const isCreator = creator && creator === email;
  if (!isAdmin && !isCreator) {
    const err = new Error('Only catalog admin or the person who sent this delivery can cancel it.');
    err.status = 403;
    throw err;
  }

  const reason = String(body.reason || '').trim();
  return cancelWarehouseDeliveryServer(sb, sid, {
    cancelledByEmail: user?.email || null,
    reason,
  });
}

async function opDeliveryDraftDiscard(body, user) {
  const isAdmin = isLoginAccessAdmin(user?.email) || canManageCatalog(user);
  if (!isAdmin) {
    await assertMobileDeliverySubmitAccess(user);
  }
  const sessionId = String(body.session_id || body.sessionId || '').trim();
  const deliveryNumber = String(body.delivery_number || body.deliveryNumber || '').trim();
  if (!sessionId && !deliveryNumber) throw new Error('session_id or delivery_number is required.');

  const sb = getService();
  let sid = sessionId;
  if (!sid && deliveryNumber) {
    const { data: row } = await sb
      .from('warehouse_delivery_sessions')
      .select('id, created_by_email, status')
      .eq('delivery_number', deliveryNumber)
      .maybeSingle();
    if (!row?.id) return { ok: true, already_gone: true };
    sid = row.id;
  }

  const { data: session } = await sb
    .from('warehouse_delivery_sessions')
    .select('id, created_by_email, status')
    .eq('id', sid)
    .maybeSingle();
  if (!session) return { ok: true, already_gone: true };

  const email = String(user?.email || '').trim().toLowerCase();
  const creator = String(session.created_by_email || '').trim().toLowerCase();
  const isCreator = creator && creator === email;
  if (!isAdmin && !isCreator) {
    const err = new Error('Only catalog admin or the delivery sender can discard this draft.');
    err.status = 403;
    throw err;
  }

  return deleteWarehouseDeliverySessionHard(sb, sid);
}

async function opDeliveryDriversList() {
  const sb = getService();
  const drivers = await listWarehouseDeliveryDrivers(sb, { activeOnly: true });
  return { drivers };
}

async function opDeliveryDriversSave(body, user) {
  const { isLoginAccessAdmin } = await import('../lib/loginAccess.js');
  if (!isLoginAccessAdmin(user?.email) && !canManageCatalog(user)) {
    const err = new Error('Admin access required.');
    err.status = 403;
    throw err;
  }
  const names = Array.isArray(body.names) ? body.names : [];
  const sb = getService();
  const drivers = await saveWarehouseDeliveryDrivers(sb, names);
  return { drivers };
}

async function opProductionPresetsList() {
  const sb = getService();
  return listProductionPresetsGrouped(sb);
}

async function opProductionPresetsSave(body, user) {
  const { isLoginAccessAdmin } = await import('../lib/loginAccess.js');
  if (!isLoginAccessAdmin(user?.email) && !canManageCatalog(user)) {
    const err = new Error('Admin access required.');
    err.status = 403;
    throw err;
  }
  const sb = getService();
  return saveProductionPresetsGrouped(sb, {
    seater: body.seater || body.seater_presets,
    carpentry: body.carpentry || body.carpentry_presets,
  });
}

async function opDeliveryReceiverCheck(body, user) {
  if (!canWarehouseDeliveryReceiverActions(user)) {
    const err = new Error('Only the Kitwe receiver can confirm packets.');
    err.status = 403;
    throw err;
  }
  const entryId = String(body.entry_id || '');
  const checked = body.checked !== false;
  if (!entryId) throw new Error('entry_id is required.');
  const sb = getService();
  const { data: entry } = await sb.from('warehouse_delivery_entries').select('*').eq('id', entryId).maybeSingle();
  if (!entry) throw new Error('Delivery line not found.');
  const now = new Date().toISOString();
  const metadata = {
    ...(entry.metadata || {}),
    receiver_checked_at: checked ? now : null,
  };
  if (checked) {
    metadata.sent_to_customer = false;
    metadata.sent_to_customer_at = null;
    metadata.sent_to_customer_by_email = null;
  }
  const { error } = await sb.from('warehouse_delivery_entries').update({ metadata }).eq('id', entryId);
  if (error) throw new Error(error.message || 'Failed to update line');
  return { entry_id: entryId, receiver_checked: checked, metadata };
}

async function opDeliveryReceiverSendToCustomer(body, user) {
  void body;
  void user;
  throw new Error('Send to customer is disabled. Tick lines to receive into Kitwe stock only.');
}

async function opDeliveryAccept(body, user) {
  if (!canWarehouseDeliveryReceiverActions(user)) {
    const err = new Error('Only the Kitwe receiver can accept deliveries.');
    err.status = 403;
    throw err;
  }
  const sessionId = String(body.session_id || '');
  const result = await acceptWarehouseDeliveryServer(getService(), sessionId, {
    acceptedBy: user?.id || WAREHOUSE_ACCEPT_USER_ID,
    acceptedByEmail: user?.email || null,
  });
  return result;
}

async function opReturnKitweProductsList(user) {
  await assertWarehouseReturnCreator(user);
  return listKitweReturnProductOptions(getService());
}

async function opReturnQuoteCustomersList(user) {
  return listReturnQuoteCustomers(getService(), user);
}

async function opReturnOrderCreate(body, user) {
  return createWarehouseReturnOrder(getService(), body, user);
}

async function opReturnOrderList(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  const trackageOnly = body.trackage_only === true;
  const forProduction = body.for_production === true;
  const adminRegistry = body.admin_registry === true;
  const repairDepartment = String(body.repair_department || body.repairDepartment || '').trim().toLowerCase() || null;
  const hassanOnly = trackageOnly
    ? body.hassan_only !== false && body.hassanOnly !== false
    : forProduction && repairDepartment
      ? body.hassan_only === true || body.hassanOnly === true
      : body.hassan_only === true || body.hassanOnly === true;
  if (adminRegistry) {
    if (!canManageCatalog(user)) {
      const err = new Error('Catalog admin access required.');
      err.status = 403;
      throw err;
    }
    return listWarehouseReturnOrders(getService(), {
      hassanOnly: body.hassan_only === true || body.hassanOnly === true,
      limit: body.limit ?? body.max ?? 500,
    });
  }
  if (trackageOnly) {
    await assertWarehouseReturnCreator(user);
  } else if (forProduction || repairDepartment) {
    await assertWarehouseReturnProductionAccess(user, grant);
  } else {
    await assertWarehouseReturnCreator(user);
  }
  return listWarehouseReturnOrders(getService(), {
    forProduction: repairDepartment ? true : forProduction,
    trackageOnly,
    repairDepartment,
    hassanOnly: trackageOnly
      ? body.hassan_only !== false && body.hassanOnly !== false
      : hassanOnly,
  });
}

async function opReturnOrderPause(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseReturnProductionAccess(user, grant);
  return pauseWarehouseReturnOrder(getService(), body, user);
}

async function opReturnOrderResume(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseReturnProductionAccess(user, grant);
  return resumeWarehouseReturnOrder(getService(), body, user);
}

async function opReturnOrderAccept(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseReturnProductionAccess(user, grant);
  return acceptWarehouseReturnOrder(getService(), body, user);
}

async function opReturnOrderComplete(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseReturnProductionAccess(user, grant);
  return completeWarehouseReturnOrder(getService(), body, user);
}

async function opReturnOrderCustomerDeliveryPrepare(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseReturnProductionAccess(user, grant);
  return prepareReturnCustomerDeliverySession(getService(), body, user);
}

async function opReturnOrderCustomerDeliverySubmit(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseReturnProductionAccess(user, grant);
  return submitReturnCustomerDelivery(
    getService(),
    body,
    user,
    (id, b64) => uploadWarehouseDeliverySignaturePng(id, b64),
  );
}

async function opReturnOrderShipPrepare(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseReturnProductionAccess(user, grant);
  return prepareReturnShipmentSession(getService(), body, user);
}

async function opReturnOrderShipSubmit(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseReturnProductionAccess(user, grant);
  return submitReturnShipment(
    getService(),
    body,
    user,
    (id, b64) => uploadWarehouseDeliverySignaturePng(id, b64),
  );
}

async function opReturnOrderCustomerLabelPrint(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseReturnProductionAccess(user, grant);
  return printReturnCustomerPickupLabel(getService(), body, user);
}

async function opStoragePosSalesList(user) {
  return listPosSalesForStorage(getService(), user);
}

async function opStoragePosSaleDetail(body, user) {
  return getPosSaleDetailForStorage(getService(), user, body);
}

async function opStorageSendSubmit(body, user) {
  return submitWarehouseStorageSend(getService(), body, user);
}

async function opStorageManualCreate(body, user) {
  return createManualWarehouseStorageSend(getService(), body, user);
}

async function opStorageReprintLabels(body, user) {
  return reprintWarehouseStorageLabels(getService(), body, user);
}

async function opStorageSendList(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  const forProduction = body.for_production === true;
  const adminRegistry = body.admin_registry === true;
  if (adminRegistry) {
    if (!canManageCatalog(user)) {
      const err = new Error('Catalog admin access required.');
      err.status = 403;
      throw err;
    }
    return listWarehouseStorageSends(getService(), { forProduction: false });
  }
  if (forProduction) {
    await assertWarehouseStorageProductionAccess(user, grant);
  } else {
    await assertWarehouseStorageCreator(user);
  }
  return listWarehouseStorageSends(getService(), { forProduction });
}

async function opStorageSendDetail(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseStorageProductionAccess(user, grant);
  return getWarehouseStorageSend(getService(), body.storage_send_id || body.id);
}

async function opStorageDeliverPrepare(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseStorageProductionAccess(user, grant);
  return prepareWarehouseStorageDelivery(getService(), body, user, grant);
}

async function opStorageDeliverSubmit(body, user) {
  const grant = await mobileAccessGrantForUser(user);
  await assertWarehouseStorageProductionAccess(user, grant);
  let signatureUrl = '';
  if (body.signature_png_base64) {
    const sid = String(body.session_id || body.storage_send_id || newUuid()).trim();
    signatureUrl = await uploadWarehouseDeliverySignaturePng(sid, body.signature_png_base64);
  }
  return submitWarehouseStorageDelivery(getService(), {
    ...body,
    driver_signature_url: signatureUrl,
  }, user, grant);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const user = await requireUser(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const op = String(body.op || body.operation || '').trim();

    let result;
    switch (op) {
      case 'scan-resolve':
        result = await opScanResolve(body);
        break;
      case 'packet-create':
        result = await opPacketCreate(body, user);
        break;
      case 'packet-update':
        result = {
          ...(await savePacketForMobile(getService(), body)),
          updated_by: user?.email || null,
        };
        break;
      case 'packet-quantity-set':
        result = await setPacketQuantityForMobile(getService(), body);
        break;
      case 'assembly-create':
        result = await opAssemblyCreate(body, user);
        break;
      case 'catalog-list': {
        const packetLoad = String(body.packet_load || body.packetLoad || '').trim().toLowerCase() === 'all'
          ? 'all'
          : 'linked';
        const includeColors = body.include_colors !== false;
        result = await fetchCatalogForMobile(getService(), { packetLoad, includeColors });
        result.repair_floor2_deliveries = await listRepairFloor2DeliveriesForCatalog(getService());
        {
          const { listOrderDeliveriesForMobile } = await import('../lib/warehouseDeliveryAdminQueue.js');
          result.order_floor2_deliveries = await listOrderDeliveriesForMobile(getService());
        }
        break;
      }
      case 'generate-unique-sku':
        result = await opGenerateUniqueSku(body);
        break;
      case 'category-create':
        result = { category: await createCategoryForMobile(getService(), body.name) };
        break;
      case 'color-find-or-create':
        result = { color: await findOrCreateWarehouseColorServer(getService(), body.name) };
        break;
      case 'assembly-save':
        result = await opAssemblySave(body, user);
        break;
      case 'assembly-delete':
        result = await opAssemblyDelete(body, user);
        break;
      case 'assembly-product-quantity-set':
        result = await opAssemblyProductQuantitySet(body, user);
        break;
      case 'product-turkish-names-sync':
        result = await opProductTurkishNamesSync(body, user);
        break;
      case 'bom-validate':
        result = await opBomValidate(body);
        break;
      case 'delivery-session-open':
        result = await opDeliverySessionOpen(body, user);
        break;
      case 'delivery-number-reset':
        result = await opDeliveryNumberReset(user);
        break;
      case 'delivery-cancel':
        result = await opDeliveryCancel(body, user);
        break;
      case 'delivery-draft-discard':
        result = await opDeliveryDraftDiscard(body, user);
        break;
      case 'delivery-sent-list':
        result = await opDeliverySentList(body, user);
        break;
      case 'delivery-sent-detail':
        result = await opDeliverySentDetail(body, user);
        break;
      case 'delivery-signature-upload':
        result = await opDeliverySignatureUpload(body, user);
        break;
      case 'delivery-production-queue-list':
        result = await opDeliveryProductionQueueList(user);
        break;
      case 'delivery-submit':
        result = await opDeliverySubmit(body, user);
        break;
      case 'delivery-drivers-list':
        result = await opDeliveryDriversList();
        break;
      case 'delivery-drivers-save':
        result = await opDeliveryDriversSave(body, user);
        break;
      case 'production-presets-list':
        result = await opProductionPresetsList();
        break;
      case 'production-presets-save':
        result = await opProductionPresetsSave(body, user);
        break;
      case 'delivery-receiver-check':
        result = await opDeliveryReceiverCheck(body, user);
        break;
      case 'delivery-receiver-send-to-customer':
        result = await opDeliveryReceiverSendToCustomer(body, user);
        break;
      case 'delivery-accept':
        result = await opDeliveryAccept(body, user);
        break;
      case 'return-kitwe-products-list':
        result = await opReturnKitweProductsList(user);
        break;
      case 'return-quote-customers-list':
        result = await opReturnQuoteCustomersList(user);
        break;
      case 'return-order-create':
        result = await opReturnOrderCreate(body, user);
        break;
      case 'return-order-list':
        result = await opReturnOrderList(body, user);
        break;
      case 'return-order-accept':
        result = await opReturnOrderAccept(body, user);
        break;
      case 'return-order-pause':
        result = await opReturnOrderPause(body, user);
        break;
      case 'return-order-resume':
        result = await opReturnOrderResume(body, user);
        break;
      case 'return-order-complete':
        result = await opReturnOrderComplete(body, user);
        break;
      case 'return-order-customer-delivery-prepare':
        result = await opReturnOrderCustomerDeliveryPrepare(body, user);
        break;
      case 'return-order-customer-delivery-submit':
        result = await opReturnOrderCustomerDeliverySubmit(body, user);
        break;
      case 'return-order-ship-prepare':
        result = await opReturnOrderShipPrepare(body, user);
        break;
      case 'return-order-ship-submit':
        result = await opReturnOrderShipSubmit(body, user);
        break;
      case 'return-order-customer-label-print':
        result = await opReturnOrderCustomerLabelPrint(body, user);
        break;
      case 'storage-pos-sales-list':
        result = await opStoragePosSalesList(user);
        break;
      case 'storage-pos-sale-detail':
        result = await opStoragePosSaleDetail(body, user);
        break;
      case 'storage-send-submit':
        result = await opStorageSendSubmit(body, user);
        break;
      case 'storage-manual-create':
        result = await opStorageManualCreate(body, user);
        break;
      case 'storage-reprint-labels':
        result = await opStorageReprintLabels(body, user);
        break;
      case 'storage-send-list':
        result = await opStorageSendList(body, user);
        break;
      case 'storage-send-detail':
        result = await opStorageSendDetail(body, user);
        break;
      case 'storage-deliver-prepare':
        result = await opStorageDeliverPrepare(body, user);
        break;
      case 'storage-deliver-submit':
        result = await opStorageDeliverSubmit(body, user);
        break;
      case 'production-push-register':
        result = await opProductionPushRegister(body, user);
        break;
      case 'production-access-self':
        result = await opProductionAccessSelf(user);
        break;
      case 'carpentry-access-self':
        result = await opCarpentryAccessSelf(user);
        break;
      case 'painting-access-self':
        result = await opPaintingAccessSelf(user);
        break;
      case 'delivery-access-self':
        result = await opDeliveryAccessSelf(user);
        break;
      case 'orders-access-self':
        result = await opOrdersAccessSelf(user);
        break;
      case 'orders-customers-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersCustomersList } = await import('../lib/ordersAppMobile.js');
          return opOrdersCustomersList(sb);
        });
        break;
      case 'orders-customer-save':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersCustomerSave } = await import('../lib/ordersAppMobile.js');
          return opOrdersCustomerSave(sb, body);
        });
        break;
      case 'orders-products-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersProductsList } = await import('../lib/ordersAppMobile.js');
          return opOrdersProductsList(sb);
        });
        break;
      case 'orders-product-save':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersProductSave } = await import('../lib/ordersAppMobile.js');
          return opOrdersProductSave(sb, body);
        });
        break;
      case 'orders-quotes-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersQuotesList } = await import('../lib/ordersAppMobile.js');
          return opOrdersQuotesList(sb);
        });
        break;
      case 'orders-quote-get':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersQuoteGet } = await import('../lib/ordersAppMobile.js');
          return opOrdersQuoteGet(sb, body);
        });
        break;
      case 'orders-quote-pdf':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersQuotePdf } = await import('../lib/ordersAppMobile.js');
          return opOrdersQuotePdf(sb, body);
        });
        break;
      case 'orders-quote-save':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersQuoteSave } = await import('../lib/ordersAppMobile.js');
          return opOrdersQuoteSave(sb, body, user);
        });
        break;
      case 'orders-quote-set-route':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersQuoteSetRoute } = await import('../lib/ordersAppMobile.js');
          return opOrdersQuoteSetRoute(sb, body);
        });
        break;
      case 'orders-quote-send-production':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersQuoteSendProduction } = await import('../lib/ordersAppMobile.js');
          return opOrdersQuoteSendProduction(sb, body, user);
        });
        break;
      case 'orders-deliveries-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersDeliveriesList } = await import('../lib/ordersAppMobile.js');
          return opOrdersDeliveriesList(sb);
        });
        break;
      case 'orders-repairs-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersRepairsList } = await import('../lib/ordersAppMobile.js');
          return opOrdersRepairsList(sb);
        });
        break;
      case 'orders-tracking-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersTrackingList } = await import('../lib/ordersAppMobile.js');
          return opOrdersTrackingList(sb);
        });
        break;
      case 'orders-storage-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersStorageList } = await import('../lib/ordersAppMobile.js');
          return opOrdersStorageList(sb);
        });
        break;
      case 'orders-units-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersUnitsList } = await import('../lib/ordersAppMobile.js');
          return opOrdersUnitsList(sb);
        });
        break;
      case 'orders-quote-delete':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersQuoteDelete } = await import('../lib/ordersAppMobile.js');
          return opOrdersQuoteDelete(sb, body);
        });
        break;
      case 'orders-delivery-get':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersDeliveryGet } = await import('../lib/ordersAppMobile.js');
          return opOrdersDeliveryGet(sb, body);
        });
        break;
      case 'orders-delivery-receiver-check':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersDeliveryReceiverCheck } = await import('../lib/ordersAppMobile.js');
          return opOrdersDeliveryReceiverCheck(sb, body, user);
        });
        break;
      case 'orders-delivery-send-to-customer':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersDeliverySendToCustomer } = await import('../lib/ordersAppMobile.js');
          return opOrdersDeliverySendToCustomer(sb, body, user);
        });
        break;
      case 'orders-delivery-accept':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersDeliveryAccept } = await import('../lib/ordersAppMobile.js');
          return opOrdersDeliveryAccept(sb, body, user);
        });
        break;
      case 'orders-return-products-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersReturnProductsList } = await import('../lib/ordersAppMobile.js');
          return opOrdersReturnProductsList(sb);
        });
        break;
      case 'orders-return-create':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersReturnCreate } = await import('../lib/ordersAppMobile.js');
          return opOrdersReturnCreate(sb, body, user);
        });
        break;
      case 'orders-storage-pos-list':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersStoragePosList } = await import('../lib/ordersAppMobile.js');
          return opOrdersStoragePosList(sb, user);
        });
        break;
      case 'orders-storage-pos-detail':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersStoragePosDetail } = await import('../lib/ordersAppMobile.js');
          return opOrdersStoragePosDetail(sb, body, user);
        });
        break;
      case 'orders-storage-submit':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersStorageSubmit } = await import('../lib/ordersAppMobile.js');
          return opOrdersStorageSubmit(sb, body, user);
        });
        break;
      case 'orders-storage-label-test':
        result = await withOrdersApp(user, async (sb) => {
          const { opOrdersStorageLabelTest } = await import('../lib/ordersAppMobile.js');
          return opOrdersStorageLabelTest(sb, body, user);
        });
        break;
      case 'orders-kitwe-hassan-inbound': {
        const grant = await mobileAccessGrantForUser(user);
        const { evaluateOrdersAppAccess, opOrdersKitweHassanInbound } = await import('../lib/ordersAppMobile.js');
        if (!canWarehouseDeliveryReceiverActions(user) && !evaluateOrdersAppAccess(grant, user?.email)) {
          const err = new Error('You do not have access to Hassan quote stock in Kitwe.');
          err.status = 403;
          throw err;
        }
        result = await opOrdersKitweHassanInbound(getService());
        break;
      }
      case 'carpentry-catalog-list':
        result = await opCarpentryCatalogList(user);
        break;
      case 'upholstery-catalog-list':
        result = await opUpholsteryCatalogList(user);
        break;
      case 'upholstery-manufacture-list':
        result = await opUpholsteryManufactureList(user);
        break;
      case 'upholstery-manufacture':
        result = await opUpholsteryManufacture(body, user);
        break;
      case 'upholstery-floor2-wip-photo':
        result = await opUpholsteryFloor2WipPhotoUpload(body, user);
        break;
      case 'catalog-floor2-list':
        result = await opCatalogFloor2List(user);
        break;
      case 'catalog-floor2-stock-increase':
        result = await opCatalogFloor2StockIncrease(body, user);
        break;
      case 'catalog-floor2-update-dimensions':
        result = await opCatalogFloor2UpdateDimensions(body, user);
        break;
      case 'catalog-floor2-create-product':
        result = await opCatalogFloor2CreateProduct(body, user);
        break;
      case 'catalog-floor2-create-set':
        result = await opCatalogFloor2CreateSet(body, user);
        break;
      case 'catalog-floor2-photo-upload':
        result = await opCatalogFloor2PhotoUpload(body, user);
        break;
      case 'catalog-floor2-photo-remove':
        result = await opCatalogFloor2PhotoRemove(body, user);
        break;
      case 'catalog-farm-list':
        result = await opCatalogFarmList(user);
        break;
      case 'catalog-farm-stock-adjust':
        result = await opCatalogFarmStockAdjust(body, user);
        break;
      case 'farm-send-catalog':
      case 'farm-delivery-catalog':
        result = await opFarmDeliveryCatalog(user);
        break;
      case 'farm-delivery-session-open':
        result = await opFarmDeliverySessionOpen(user, body);
        break;
      case 'farm-delivery-submit':
        result = await opFarmDeliverySubmit(body, user);
        break;
      case 'farm-return-catalog':
        result = await opFarmReturnCatalog(user);
        break;
      case 'farm-return-session-open':
        result = await opFarmReturnSessionOpen(user, body);
        break;
      case 'farm-return-submit':
        result = await opFarmReturnSubmit(body, user);
        break;
      case 'catalog-storeroom-list':
        result = await opCatalogStoreroomList(body, user);
        break;
      case 'catalog-storeroom-stock-increase':
        result = await opCatalogStoreroomStockIncrease(body, user);
        break;
      case 'catalog-storeroom-photo-upload':
        result = await opCatalogStoreroomPhotoUpload(body, user);
        break;
      case 'upholstery-job-start':
        result = await opUpholsteryJobStart(body, user);
        break;
      case 'upholstery-job-list':
        result = await opUpholsteryJobList(body, user);
        break;
      case 'upholstery-job-pause':
        result = await opUpholsteryJobPause(body, user);
        break;
      case 'upholstery-job-resume':
        result = await opUpholsteryJobResume(body, user);
        break;
      case 'upholstery-job-check-unit':
        result = await opUpholsteryJobCheckUnit(body, user);
        break;
      case 'upholstery-job-finish':
        result = await opUpholsteryJobFinish(body, user);
        break;
      case 'carpentry-manufacture':
        result = await opCarpentryManufacture(body, user);
        break;
      case 'carpentry-manufacture-list':
        result = await opCarpentryManufactureList(user);
        break;
      case 'carpentry-floor2-list':
        result = await opCatalogFloor2List(user, { carpentryWorkshop: true });
        break;
      case 'carpentry-floor2-stock-increase':
        result = await opCatalogFloor2StockIncrease(body, user, { carpentryWorkshop: true });
        break;
      case 'carpentry-floor2-create-product':
        result = await opCatalogFloor2CreateProduct(body, user, { carpentryWorkshop: true });
        break;
      case 'carpentry-floor2-photo-upload':
        result = await opCatalogFloor2PhotoUpload(body, user, { carpentryWorkshop: true });
        break;
      case 'carpentry-floor2-photo-remove':
        result = await opCatalogFloor2PhotoRemove(body, user, { carpentryWorkshop: true });
        break;
      case 'carpentry-job-start':
        result = await opCarpentryJobStart(body, user);
        break;
      case 'carpentry-job-list':
        result = await opCarpentryJobList(body, user);
        break;
      case 'carpentry-job-pause':
        result = await opCarpentryJobPause(body, user);
        break;
      case 'carpentry-job-resume':
        result = await opCarpentryJobResume(body, user);
        break;
      case 'carpentry-job-finish':
        result = await opCarpentryJobFinish(body, user);
        break;
      case 'painting-send-from-floor2':
        result = await opPaintingSendFromFloor2(body, user);
        break;
      case 'painting-from-carpentry-quote':
        result = await opPaintingFromCarpentryQuote(body, user);
        break;
      case 'painting-job-list':
        result = await opPaintingJobList(body, user);
        break;
      case 'painting-job-pause':
        result = await opPaintingJobPause(body, user);
        break;
      case 'painting-job-resume':
        result = await opPaintingJobResume(body, user);
        break;
      case 'painting-job-finish':
        result = await opPaintingJobFinish(body, user);
        break;
      case 'production-quotes-list':
        result = await opProductionQuotesList(body, user);
        break;
      case 'production-quote-accept':
        result = await opProductionQuoteAccept(body, user);
        break;
      case 'production-quote-complete':
        result = await opProductionQuoteComplete(body, user);
        break;
      case 'production-quote-pause':
        result = await opProductionQuotePause(body, user);
        break;
      case 'production-quote-resume':
        result = await opProductionQuoteResume(body, user);
        break;
      case 'production-quote-material-scan':
        result = await opProductionQuoteMaterialScan(body, user);
        break;
      case 'production-quote-translate-arabic':
        result = await opProductionQuoteTranslateArabic(body, user);
        break;
      case 'production-floor2-list':
        result = await opProductionFloor2List(user);
        break;
      case 'production-floor2-manufacture-push':
        result = await opProductionFloor2ManufacturePush(body, user);
        break;
      case 'production-storeroom-materials-list':
        result = await opProductionStoreroomMaterialsList(user);
        break;
      case 'production-job-materials-save':
        result = await opProductionJobMaterialsSave(body, user);
        break;
      case 'packet-name-check':
        result = await opPacketNameCheck(body);
        break;
      case 'production-suggest-base-name':
        result = await opProductionSuggestBaseName(body, user);
        break;
      case 'production-recent-base-names':
        result = await opProductionRecentBaseNames(user);
        break;
      case 'production-label-preview':
        result = await opProductionLabelPreview(body, user);
        break;
      case 'production-label-print':
        result = await opProductionLabelPrint(body, user);
        break;
      case 'production-packet-create':
        result = await opProductionPacketCreate(body, user);
        break;
      case 'production-packet-cancel-draft':
        result = await opProductionPacketCancelDraft(body, user);
        break;
      case 'production-assembly-photo':
        result = await opProductionAssemblyPhoto(body, user);
        break;
      case 'production-stock-increase':
        result = await opProductionStockIncrease(body, user);
        break;
      case 'production-events-list':
        result = await opProductionEventsList(user, body);
        break;
      case 'production-edit-create':
        result = await opProductionEditCreate(body, user);
        break;
      case 'production-edit-stock-increase':
        result = await opProductionEditStockIncrease(body, user);
        break;
      default:
        return res.status(400).json({ ok: false, error: 'Unknown op' });
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const status = err?.status || (err?.details ? 400 : 500);
    return res.status(status).json({
      ok: false,
      error: warehouseMobileErrorMessage(err),
      details: err?.details || null,
    });
  }
}
