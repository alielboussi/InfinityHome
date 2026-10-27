import { createFirestoreServerClient } from '../lib/firestoreServerClient.js';
import { allocateWarehouseDeliveryNumber } from '../lib/warehouseDeliveryNumber.js';
import { validateAssemblyShipmentBom } from '../lib/warehouseMobileBom.js';
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
} from '../lib/warehouseCatalogMobile.js';
import { getLoginAccessRecord, isLoginAccessAdmin } from '../lib/loginAccess.js';
import { buildWarehouseDeliveryWhatsAppMessage } from '../lib/buildWarehouseDeliveryWhatsAppMessage.js';
import { sendWarehouseDeliveryWhatsApp } from '../lib/sendWarehouseDeliveryWhatsApp.js';
import { normalizeMobileAccessGrant } from '../lib/mobileAccessDefaults.js';
import {
  evaluateWarehouseProductionAppAccess,
  isWarehouseProductionOperatorAllowed,
  isWarehouseProductStockQtyEditAllowed,
  isWarehouseProductTurkishSyncAllowed,
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
} from '../../src/utils/warehouseDelivery.js';
import { acceptWarehouseDeliveryServer } from '../lib/warehouseDeliveryAccept.js';
import { assertPacketStockAvailable } from '../lib/warehouseDeliveryStock.js';
import {
  listWarehouseDeliveryDrivers,
  saveWarehouseDeliveryDrivers,
} from '../lib/warehouseDeliveryDrivers.js';
import { HASSAN_AWAD } from '../../src/accessControl.js';
import { generateRandomWarehouseSku16 } from '../../src/utils/warehouseRandomSku.js';
import { enqueueWarehouseProductionLabelJob } from '../lib/productionLabelPrint.js';
import { findProductionNameClash } from '../lib/productionCatalogNameCheck.js';
import { runProductionAssemblyPhotoAttach } from '../lib/warehouseProductionPhotoAttach.js';
import {
  buildProductionLabelMeta,
  buildWarehouseProductionLabelPngBase64,
} from '../lib/warehouseProductionLabelImage.js';

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
  const record = await getLoginAccessRecord(user?.id);
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
  const productKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(scan));
  const assembly = (assemblies || []).find((a) => {
    const stored = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(a.family_sku));
    for (const k of productKeys) {
      if (k && stored.has(k)) return true;
    }
    return false;
  });
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
  const err = new Error('You do not have access to warehouse production.');
  err.status = 403;
  throw err;
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

async function opProductionAccessSelf(user) {
  const grant = await mobileAccessGrantForUser(user);
  const record = await getLoginAccessRecord(user?.id);
  return {
    allowed: evaluateWarehouseProductionAppAccess(grant, user?.email),
    display_name: record?.mobile_display_name || record?.display_name || user?.full_name || user?.email || null,
    grant,
  };
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
    await sb.from('warehouse_assembly_inventory').delete().eq('assembly_id', id);
    await sb.from('warehouse_assembly_locations').delete().eq('assembly_id', id);
    await sb.from('warehouse_assembly_packets').delete().eq('assembly_id', id);
    await sb.from('warehouse_assembly_colors').delete().eq('assembly_id', id);
    await sb.from('warehouse_assemblies').delete().eq('id', id);
  } catch (err) {
    console.warn('[warehouse-mobile] rollback assembly draft failed:', err?.message || err);
  }
}

async function opProductionPacketCreate(body, user) {
  await assertProductionKioskUser(user);
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

  const clientSource = String(body.client_source || '').trim() || 'warehouse_production_kiosk';
  let assemblyInserted = false;
  let assemblyId = '';
  try {
    const assembly = await saveAssemblyForMobile(sb, {
      name,
      family_sku: familySku,
      warehouse_location_id: warehouseLocationId,
      inventory_mode: 'finished',
      packet_count: null,
      packet_links: [],
      location_ids: [],
      units_per_carton: 1,
    });
    assemblyId = String(assembly.id || '');
    assemblyInserted = Boolean(assemblyId);

    const now = new Date().toISOString();
    const { error: invErr } = await sb.from('warehouse_assembly_inventory').upsert({
      assembly_id: assemblyId,
      location_id: warehouseLocationId,
      quantity: initialQty,
      updated_at: now,
    }, { onConflict: 'assembly_id,location_id' });
    if (invErr) throw new Error(invErr.message || 'Failed to set opening stock');
    recomputeWarehouseLocationStockServer(sb, warehouseLocationId).catch((reErr) => {
      console.warn('[warehouse-mobile] warehouse stock recompute deferred:', reErr?.message || reErr);
    });

    const deferProductPhoto = body.defer_product_photo === true
      || body.deferProductPhoto === true;
    const imageBase64 = deferProductPhoto
      ? ''
      : String(body.image_base64 || body.imageBase64 || '').trim();
    const requiresPhoto = !deferProductPhoto && (
      clientSource === 'warehouse_production_app'
      || body.require_product_photo === true
      || body.requireProductPhoto === true
    );

    let catalogImageUrl = null;
    const fastMobileCreate = clientSource === 'warehouse_production_app';
    if (imageBase64) {
      catalogImageUrl = await attachProductionAssemblyCatalogPhoto(sb, {
        assembly,
        imageBase64,
        productName: name,
        skipAiRetouch: false,
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

    const labelSku = normalizeWarehousePacketScan(familySku) || familySku;
    const labelCopies = Math.max(0, Math.floor(Number(initialQty) || 0));
    const deferLabels = deferProductPhoto && labelCopies > 0;
    const printedAt = new Date();
    let labelJobId = null;
    let labelPrintWarning = null;
    if (labelCopies > 0 && !deferLabels) {
      try {
        labelJobId = await promiseWithTimeout(
          enqueueWarehouseProductionLabelJob(sb, {
            name: assembly.name,
            sku: labelSku,
            qty: labelCopies,
            printedBy: user?.full_name || user?.display_name || user?.email,
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

    return {
      assembly,
      packet: packetCompat,
      defer_product_photo: deferProductPhoto,
      created_by: user?.email || null,
      catalog_image_url: catalogImageUrl,
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

async function opProductionAssemblyPhoto(body, user) {
  return runProductionAssemblyPhotoAttach(body, user);
}

async function opProductionStockIncrease(body, user) {
  await assertProductionKioskUser(user);
  const sb = getService();
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  const packetId = String(body.packet_id || '').trim();
  const warehouseLocationId = String(body.warehouse_location_id || body.location_id || '').trim();
  const delta = Math.max(0, Math.floor(Number(body.delta) || 0));
  if (!assemblyId && !packetId) throw new Error('assembly_id or packet_id is required.');
  if (!warehouseLocationId) throw new Error('warehouse_location_id is required.');
  if (delta < 1) throw new Error('Increase quantity must be at least 1.');

  const printSource = String(body.client_source || '').trim() || 'warehouse_production_kiosk';
  let labelName = '';
  let labelSku = '';
  let qtyBefore = 0;
  let qtyAfter = 0;
  let packet = null;
  let assembly = null;

  if (assemblyId) {
    const { data: asmRow, error: aErr } = await sb
      .from('warehouse_assemblies')
      .select('id, name, family_sku, inventory_mode')
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

    await setAssemblyProductQuantityForMobile(sb, {
      assembly_id: assemblyId,
      warehouse_location_id: warehouseLocationId,
      quantity: qtyAfter,
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
  let labelJobId = null;
  let labelPrintWarning = null;
  try {
    labelJobId = await promiseWithTimeout(
      enqueueWarehouseProductionLabelJob(sb, {
        name: labelName,
        sku: labelSku,
        qty: delta,
        printedBy: user?.full_name || user?.display_name || user?.email,
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
    skipPng: false,
  });

  const packetCompat = assembly
    ? { id: assembly.id, sku: labelSku, name: assembly.name, assembly_id: assembly.id }
    : packet;

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
  return {
    taken: true,
    name,
    existing: clash.name,
    existing_kind: clash.kind,
    reason: sameFullName ? 'exact_name' : 'base_name_in_use',
  };
}

async function buildProductionLabelPreviewPayload({ name, sku, printedAt, skipPng = false }) {
  const at = printedAt ? new Date(printedAt) : new Date();
  const label = buildProductionLabelMeta({ name, sku, printedAt: at });
  let label_preview_png_base64 = null;
  if (!skipPng) {
    try {
      label_preview_png_base64 = await buildWarehouseProductionLabelPngBase64({
        name: label.name,
        sku: label.sku,
        printedAt: at,
      });
    } catch (err) {
      console.warn('[warehouse-mobile] label preview png failed:', err?.message || err);
    }
  }
  return { label, label_preview_png_base64, printed_at: label.printed_at };
}

async function opProductionLabelPreview(body, user) {
  await assertProductionKioskUser(user);
  const name = titleCaseWords(String(body.name || '').trim());
  const sku = normalizeWarehousePacketScan(body.sku);
  if (!name || !sku) throw new Error('name and sku are required.');
  const printedAt = body.printed_at || body.printedAt || new Date().toISOString();
  return buildProductionLabelPreviewPayload({ name, sku, printedAt });
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

async function opDeliverySessionOpen(user) {
  const deliveryNumber = await allocateWarehouseDeliveryNumber();
  const sb = getService();
  const now = new Date().toISOString();
  const sessionId = newUuid();
  const row = {
    id: sessionId,
    delivery_number: deliveryNumber,
    from_location: WAREHOUSE_FROM_LOCATION_ID,
    to_location: WAREHOUSE_TO_LOCATION_ID,
    status: 'draft',
    created_at: now,
    transfer_datetime: now,
    total_qty: 0,
    created_by_email: user?.email || null,
    created_by_name: user?.user_metadata?.full_name || user?.full_name || null,
    metadata: {
      source: 'warehouse_catalog_mobile',
      hassan_alert_pending: false,
    },
  };
  const { error } = await sb.from('warehouse_delivery_sessions').insert(row);
  if (error) throw new Error(error.message || 'Failed to open delivery session');
  return { session_id: sessionId, delivery_number: deliveryNumber };
}

function isHassanDeliveryUser(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (HASSAN_AWAD.emails.some((e) => e.toLowerCase() === email)) return true;
  const uid = String(user?.id || user?.uid || '').toLowerCase();
  return uid === String(HASSAN_AWAD.id).toLowerCase() || uid === String(WAREHOUSE_ACCEPT_USER_ID).toLowerCase();
}

function scanLineDriverChecked(line) {
  return line?.driver_checked === true || Boolean(line?.driver_checked_at);
}

async function opDeliverySubmit(body, user) {
  const sessionId = String(body.session_id || '');
  const groups = Array.isArray(body.groups) ? body.groups : [];
  const driverName = String(body.driver_name || body.driverName || '').trim();
  const driverId = String(body.driver_id || body.driverId || '').trim();
  if (!sessionId) throw new Error('session_id is required.');
  if (!groups.length) throw new Error('Add at least one product group.');
  if (!driverName) throw new Error('Select a driver before submitting.');

  const sb = getService();
  const { data: session } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) throw new Error('Delivery session not found.');
  if (String(session.status) !== 'draft') {
    throw new Error('Delivery session is not open for editing.');
  }

  const [{ data: packets }, { data: links }, { data: assemblies }] = await Promise.all([
    sb.from('warehouse_packets').select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
    sb.from('warehouse_assembly_packets').select('*'),
    sb.from('warehouse_assemblies').select('id, name, family_sku, packet_count'),
  ]);
  const byAssembly = buildPacketsByAssembly(links || [], packets || []);
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));

  const entries = [];
  let totalCartons = 0;
  const now = new Date().toISOString();

  for (const group of groups) {
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

    const validation = validateAssemblyShipmentBom(assembly, packetRows, scanned, units);
    if (!validation.ok) {
      const err = new Error(validation.message || 'BOM incomplete');
      err.details = validation;
      throw err;
    }

    for (const packet of packetRows) {
      const moveQty = units * Math.max(1, Number(packet.qty_per_unit) || 1);
      const scanLine = (group.scans || []).find((s) => String(s.packet_id) === String(packet.id));
      const have = scanned.get(String(packet.id)) || 0;
      if (have < moveQty) {
        throw new Error(`Check all cartons for ${assembly.name} (packet #${packet.packet_number || '?'}) before submit.`);
      }
      if (!scanLineDriverChecked(scanLine || {})) {
        throw new Error(`Driver must confirm every packet carton for ${assembly.name}.`);
      }
      await assertPacketStockAvailable(sb, packet.id, WAREHOUSE_FROM_LOCATION_ID, moveQty);
      totalCartons += moveQty;
      const driverCheckedAt = scanLine?.driver_checked_at || now;
      entries.push({
        id: newUuid(),
        session_id: sessionId,
        kind: 'packet',
        name: packet.name,
        sku: packet.sku,
        quantity: moveQty,
        metadata: {
          packet_id: packet.id,
          assembly_id: assemblyId,
          assembly_name: assembly.name,
          packet_number: packet.packet_number,
          units,
          driver_checked_at: driverCheckedAt,
          receiver_checked_at: null,
        },
      });
    }
  }

  for (const entry of entries) {
    const { error } = await sb.from('warehouse_delivery_entries').insert({
      ...entry,
      created_at: now,
    });
    if (error) throw new Error(error.message || 'Failed to save delivery lines');
  }

  const { error: updErr } = await sb.from('warehouse_delivery_sessions').update({
    status: 'submitted',
    submitted_at: now,
    total_qty: totalCartons,
    metadata: {
      ...(session.metadata || {}),
      source: 'warehouse_catalog_mobile',
      hassan_alert_pending: true,
      hassan_alert_at: now,
      submitted_by_email: user?.email || null,
      driver_id: driverId || null,
      driver_name: driverName,
    },
  }).eq('id', sessionId);
  if (updErr) throw new Error(updErr.message || 'Failed to submit delivery');

  const totalProducts = groups.reduce(
    (sum, group) => sum + Math.max(1, Number(group.units) || 1),
    0,
  );
  const productGroups = groups.map((group) => {
    const assemblyId = String(group.assembly_id || '');
    const assembly = assemblyById.get(assemblyId);
    const units = Math.max(1, Number(group.units) || 1);
    const packetRows = byAssembly.get(assemblyId) || [];
    return {
      assemblyName: assembly?.name || 'Product',
      packetLines: packetRows.map((packet) => ({
        name: packet.name,
        quantity: units * Math.max(1, Number(packet.qty_per_unit) || 1),
      })),
    };
  });

  const accessRecord = await getLoginAccessRecord(user?.id);
  const userAlias = accessRecord?.mobile_display_name
    || accessRecord?.display_name
    || user?.user_metadata?.full_name
    || user?.full_name
    || user?.email
    || '—';

  const whatsappMessage = buildWarehouseDeliveryWhatsAppMessage({
    userAlias,
    submittedAt: now,
    driverName,
    routeLabel: 'Warehouse To Showroom',
    productGroups,
    totalPackets: totalCartons,
    totalProducts,
  });

  sendWarehouseDeliveryWhatsApp(whatsappMessage).catch((err) => {
    console.warn('[delivery-submit] WhatsApp notify failed:', err?.message || err);
  });

  return {
    session_id: sessionId,
    delivery_number: session.delivery_number,
    total_cartons: totalCartons,
    entry_count: entries.length,
  };
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

async function opDeliveryReceiverCheck(body, user) {
  if (!isHassanDeliveryUser(user)) {
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
  const { error } = await sb.from('warehouse_delivery_entries').update({ metadata }).eq('id', entryId);
  if (error) throw new Error(error.message || 'Failed to update line');
  return { entry_id: entryId, receiver_checked: checked, metadata };
}

async function opDeliveryAccept(body, user) {
  if (!isHassanDeliveryUser(user)) {
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
      case 'catalog-list':
        result = await fetchCatalogForMobile(getService());
        break;
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
        result = {
          assembly: await saveAssemblyForMobile(getService(), body),
          created_by: user?.email || null,
        };
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
        result = await opDeliverySessionOpen(user);
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
      case 'delivery-receiver-check':
        result = await opDeliveryReceiverCheck(body, user);
        break;
      case 'delivery-accept':
        result = await opDeliveryAccept(body, user);
        break;
      case 'production-access-self': {
        const { requireBearerUser } = await import('../lib/verifyBearerUser.js');
        const authedUser = await requireBearerUser(req);
        result = await opProductionAccessSelf(authedUser);
        break;
      }
      case 'packet-name-check':
        result = await opPacketNameCheck(body);
        break;
      case 'production-suggest-base-name':
        result = await opProductionSuggestBaseName(body, user);
        break;
      case 'production-label-preview':
        result = await opProductionLabelPreview(body, user);
        break;
      case 'production-packet-create':
        result = await opProductionPacketCreate(body, user);
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
