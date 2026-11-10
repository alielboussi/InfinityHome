import { newUuid } from './uuid.js';
import { allocateWarehouseStorageNumber } from './warehouseStorageNumber.js';
import { adjustAssemblyStock, getAssemblyStockQty } from './warehouseReturnStock.js';
import { printWarehouseStorageSaleLabel } from './warehouseStorageSaleLabelPrint.js';
import { getFirestore } from './firestoreDb.js';
import { HASSAN_AWAD, canManageCatalog } from '../../src/accessControl.js';
import { isLoginAccessAdmin } from './loginAccess.js';
import { KITWE_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import {
  WAREHOUSE_FROM_LOCATION_ID,
  WAREHOUSE_TO_LOCATION_ID,
} from '../../src/utils/warehouseDelivery.js';
import {
  isWarehouseDeliveryAppAllowed,
  isWarehouseProductionKitweDeliveryAllowed,
} from '../../src/mobile/mobileAccessManifest.js';
import { WAREHOUSE_STORAGE_SEND_STATUSES } from '../../src/utils/warehouseStorageSend.js';
import {
  assemblyDerivesWarehouseStockFromPackets,
  normalizeWarehouseSku,
} from '../../src/utils/warehouseAssemblyMath.js';
import { buildPacketsByAssembly } from '../../src/utils/warehouseAssemblyPacketPool.js';
import {
  assemblyUnitsPerCarton,
  assemblyUsesFinishedBoxReceiving,
  boxCountFromFinishedUnits,
} from '../../src/utils/warehouseUnitsPerCarton.js';
import { isWarehouseProductAssembly, isWarehouseSetAssembly } from '../../src/utils/warehouseCatalogHierarchy.js';
import { expandWarehouseSetItemsRows } from '../../src/utils/warehouseSetItems.js';
import { adjustPacketStock } from './warehouseDeliveryStock.js';
import { recomputeWarehouseLocationStockServer } from './warehouseLocationStockRecompute.js';

const TABLE = 'warehouse_storage_sends';
const FACTORY_ID = WAREHOUSE_FROM_LOCATION_ID;

function canWarehouseKitweStorageCreator(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (HASSAN_AWAD.emails.some((e) => e.toLowerCase() === email)) return true;
  const uid = String(user?.id || user?.uid || '').toLowerCase();
  if (uid === String(HASSAN_AWAD.id).toLowerCase()) return true;
  if (isLoginAccessAdmin(user?.email)) return true;
  if (canManageCatalog(user)) return true;
  return false;
}

export async function assertWarehouseStorageCreator(user) {
  if (!canWarehouseKitweStorageCreator(user)) {
    const err = new Error('Only Hassan Awad can send POS sales to warehouse storage.');
    err.status = 403;
    throw err;
  }
}

export async function assertWarehouseStorageProductionAccess(user, grant) {
  if (isWarehouseProductionKitweDeliveryAllowed(grant)) return;
  if (isWarehouseDeliveryAppAllowed(grant)) return;
  const err = new Error('Warehouse production access required.');
  err.status = 403;
  throw err;
}

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    quantity: Number(row.quantity) || 0,
  };
}

async function loadSaleCustomer(sb, sale) {
  const customerId = sale?.customer_id ? String(sale.customer_id).trim() : '';
  if (!customerId) {
    return { customer_id: null, customer_name: '', customer_phone: '' };
  }
  const { data: cust } = await sb
    .from('customers')
    .select('id, name, phone')
    .eq('id', customerId)
    .maybeSingle();
  if (cust) {
    return {
      customer_id: cust.id,
      customer_name: String(cust.name || '').trim(),
      customer_phone: String(cust.phone || '').trim(),
    };
  }
  const { data: qc } = await sb
    .from('quote_customers')
    .select('id, name, phone')
    .eq('id', customerId)
    .maybeSingle();
  if (qc) {
    return {
      customer_id: qc.id,
      customer_name: String(qc.name || '').trim(),
      customer_phone: String(qc.phone || '').trim(),
    };
  }
  return { customer_id: customerId, customer_name: '', customer_phone: '' };
}

async function findAssemblyForProduct(sb, productId, displayName) {
  if (productId) {
    const { data: product } = await sb
      .from('products')
      .select('id, sku, name')
      .eq('id', productId)
      .maybeSingle();
    if (product?.sku) {
      const skuKey = normalizeWarehouseSku(product.sku);
      const { data: bySku } = await sb
        .from('warehouse_assemblies')
        .select('id, name, family_sku, item_kind')
        .eq('family_sku', skuKey)
        .limit(5);
      const hit = (bySku || []).find((a) => isWarehouseProductAssembly(a));
      if (hit) return hit;
    }
    if (product?.name) {
      const { data: byName } = await sb
        .from('warehouse_assemblies')
        .select('id, name, family_sku, item_kind')
        .ilike('name', product.name.trim())
        .limit(5);
      const hit = (byName || []).find((a) => isWarehouseProductAssembly(a));
      if (hit) return hit;
    }
  }
  const name = String(displayName || '').trim();
  if (name) {
    const { data: byName } = await sb
      .from('warehouse_assemblies')
      .select('id, name, family_sku, item_kind')
      .ilike('name', name)
      .limit(5);
    const hit = (byName || []).find((a) => isWarehouseProductAssembly(a));
    if (hit) return hit;
  }
  return null;
}

async function createAssemblyFromSaleItem(sb, { productId, displayName }) {
  let sku = '';
  let name = String(displayName || '').trim() || 'POS Product';
  if (productId) {
    const { data: product } = await sb
      .from('products')
      .select('id, sku, name')
      .eq('id', productId)
      .maybeSingle();
    if (product?.sku) sku = normalizeWarehouseSku(product.sku);
    if (product?.name) name = String(product.name).trim() || name;
  }
  if (!sku) {
    sku = `POS-${String(productId || newUuid()).slice(0, 8).toUpperCase()}`;
  }
  const assemblyId = newUuid();
  const packetId = newUuid();
  const now = new Date().toISOString();
  const { error: asmErr } = await sb.from('warehouse_assemblies').insert({
    id: assemblyId,
    name,
    family_sku: sku,
    packet_count: 1,
    item_kind: 'product',
    inventory_mode: 'finished',
    created_at: now,
    updated_at: now,
  });
  if (asmErr) throw new Error(asmErr.message || 'Failed to create warehouse product.');

  const { error: pktErr } = await sb.from('warehouse_packets').insert({
    id: packetId,
    sku,
    name,
    packet_number: 1,
    assembly_id: assemblyId,
    qty_per_unit: 1,
    created_at: now,
    updated_at: now,
  });
  if (pktErr) throw new Error(pktErr.message || 'Failed to create warehouse packet.');

  await sb.from('warehouse_assembly_packets').insert({
    id: newUuid(),
    assembly_id: assemblyId,
    packet_id: packetId,
    qty_per_unit: 1,
    created_at: now,
  });

  return { id: assemblyId, name, family_sku: sku, item_kind: 'product' };
}

export async function resolveAssemblyForPosSaleLine(sb, line) {
  let assembly = await findAssemblyForProduct(sb, line.product_id, line.display_name);
  if (!assembly) {
    assembly = await createAssemblyFromSaleItem(sb, {
      productId: line.product_id,
      displayName: line.display_name,
    });
  }
  return assembly;
}

function isStorageEligibleSaleRow(row) {
  const receipt = String(row?.receipt_number || '').trim();
  if (!receipt) return false;
  const status = String(row?.status || '').toLowerCase();
  if (status === 'void' || status === 'cancelled' || status === 'canceled') return false;
  return String(row?.location_id || '') === String(KITWE_LOCATION_ID);
}

async function executeStorageSendLine(sb, user, detail, saleId, line, qty) {
  if (qty > line.quantity) {
    throw new Error(`Cannot send more than sold quantity (${line.quantity}).`);
  }

  const assembly = await resolveAssemblyForPosSaleLine(sb, line);

  const kitweQty = await getAssemblyStockQty(sb, assembly.id, KITWE_LOCATION_ID);
  if (kitweQty < qty) {
    throw new Error(`Insufficient Kitwe stock for ${line.display_name} (need ${qty}, have ${kitweQty}).`);
  }

  await adjustAssemblyStock(sb, assembly.id, KITWE_LOCATION_ID, -qty);
  await adjustAssemblyStock(sb, assembly.id, FACTORY_ID, qty);

  const storageNumber = await allocateWarehouseStorageNumber();
  const now = new Date().toISOString();
  const id = newUuid();
  const row = {
    id,
    storage_number: storageNumber,
    sale_id: saleId,
    sale_item_id: line.id,
    receipt_number: detail.sale.receipt_number,
    assembly_id: assembly.id,
    assembly_name: assembly.name,
    assembly_sku: assembly.family_sku || null,
    customer_id: detail.sale.customer_id || null,
    customer_name: detail.sale.customer_name || null,
    customer_phone: detail.sale.customer_phone || null,
    quantity: qty,
    status: WAREHOUSE_STORAGE_SEND_STATUSES.IN_STORAGE,
    created_at: now,
    updated_at: now,
    created_by_email: user?.email || null,
    created_by_name: user?.user_metadata?.full_name || user?.full_name || HASSAN_AWAD.displayName,
    metadata: { receipt_number: detail.sale.receipt_number, kitwe_deducted_at: now },
  };

  const { error } = await sb.from(TABLE).insert(row);
  if (error) {
    await adjustAssemblyStock(sb, assembly.id, KITWE_LOCATION_ID, qty);
    await adjustAssemblyStock(sb, assembly.id, FACTORY_ID, -qty);
    throw new Error(error.message || 'Failed to save storage send.');
  }

  await printWarehouseStorageSaleLabel(getFirestore(), {
    name: assembly.name,
    sku: assembly.family_sku || assembly.name,
    customerName: detail.sale.customer_name || 'Customer',
    customerPhone: detail.sale.customer_phone || '',
    qty,
    saleDate: detail.sale.sale_date || detail.sale.created_at,
    printedBy: row.created_by_name,
  });

  await sb.from(TABLE).update({
    labels_printed_at: now,
    updated_at: now,
  }).eq('id', id);

  const mapped = mapRow({ ...row, labels_printed_at: now });
  queueProductionStoragePush(mapped);
  return mapped;
}

/** Firestore equality is strict — HTML/API often pass sale_id as string while rows store numbers. */
function saleIdEqVariants(saleId) {
  const trimmed = String(saleId ?? '').trim();
  if (!trimmed) return [saleId];
  const variants = [saleId, trimmed];
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isSafeInteger(n)) variants.unshift(n);
  }
  return [...new Set(variants)];
}

function mapStorageSaleItems(rows) {
  return (rows || []).map((row) => ({
    id: row.id,
    product_id: row.product_id,
    display_name: String(row.display_name || row.name || '').trim() || 'Item',
    quantity: Math.max(0, Number(row.quantity) || 0),
    unit_price: row.unit_price,
  })).filter((row) => row.quantity > 0);
}

async function querySaleItemsForStorage(sb, saleId) {
  let lastErr = null;
  for (const key of saleIdEqVariants(saleId)) {
    const { data, error } = await sb
      .from('sales_items')
      .select('id, sale_id, product_id, display_name, name, quantity, unit_price')
      .eq('sale_id', key);
    if (error) {
      lastErr = error;
      continue;
    }
    if ((data || []).length) return data;
  }
  if (lastErr) throw new Error(lastErr.message || 'Failed to load sale lines.');
  return [];
}

function mapPosSaleForStorage(row) {
  return {
    id: row.id,
    receipt_number: String(row.receipt_number || '').trim(),
    sale_date: row.sale_date || row.created_at,
    customer_id: row.customer_id,
    total_amount: row.total_amount,
    currency: row.currency,
    status: row.status,
    created_by_id: row.created_by_id ?? row.user_id ?? null,
    created_by_email: row.created_by_email ?? row.cashier_email ?? null,
  };
}

export async function listPosSalesForStorage(sb, user) {
  await assertWarehouseStorageCreator(user);
  const { data, error } = await sb
    .from('sales')
    .select('id, receipt_number, sale_date, created_at, customer_id, total_amount, currency, status, location_id, created_by_id, user_id, created_by_email, cashier_email')
    .eq('location_id', KITWE_LOCATION_ID)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message || 'Failed to load sales.');
  let sales = (data || []).filter(isStorageEligibleSaleRow);

  if (!sales.length) {
    const { data: recent, error: recentErr } = await sb
      .from('sales')
      .select('id, receipt_number, sale_date, created_at, customer_id, total_amount, currency, status, location_id, created_by_id, user_id, created_by_email, cashier_email')
      .order('created_at', { ascending: false })
      .limit(400);
    if (!recentErr) {
      sales = (recent || []).filter(isStorageEligibleSaleRow);
    }
  }

  return { sales: sales.map(mapPosSaleForStorage) };
}

export async function getPosSaleDetailForStorage(sb, user, body) {
  await assertWarehouseStorageCreator(user);
  const saleId = body.sale_id ?? body.id;
  if (saleId == null) throw new Error('Sale is required.');
  const { data: sale, error: saleErr } = await sb
    .from('sales')
    .select('id, receipt_number, sale_date, created_at, customer_id, location_id, status')
    .eq('id', saleId)
    .maybeSingle();
  if (saleErr) throw new Error(saleErr.message || 'Failed to load sale.');
  if (!sale) throw new Error('Sale not found.');
  if (String(sale.location_id) !== KITWE_LOCATION_ID) {
    throw new Error('Only Kitwe POS receipts can be sent to warehouse storage.');
  }
  const [itemsRaw, customer] = await Promise.all([
    querySaleItemsForStorage(sb, saleId),
    loadSaleCustomer(sb, sale),
  ]);
  const items = mapStorageSaleItems(itemsRaw);
  return {
    sale: {
      ...sale,
      receipt_number: String(sale.receipt_number || '').trim(),
      ...customer,
    },
    items,
  };
}

export async function submitWarehouseStorageSend(sb, body, user) {
  await assertWarehouseStorageCreator(user);
  const saleId = body.sale_id;
  if (saleId == null) throw new Error('Receipt is required.');

  const lineRequests = Array.isArray(body.lines) && body.lines.length
    ? body.lines
    : [{
      sale_item_id: body.sale_item_id,
      quantity: body.quantity,
    }];

  const detail = await getPosSaleDetailForStorage(sb, user, { sale_id: saleId });
  const sends = [];

  for (const req of lineRequests) {
    const saleItemId = req.sale_item_id ?? req.saleItemId;
    const qty = Math.max(1, Math.floor(Number(req.quantity) || 0));
    if (saleItemId == null) throw new Error('Receipt line is required.');
    const line = detail.items.find((i) => String(i.id) === String(saleItemId));
    if (!line) throw new Error('Sale line not found.');
    sends.push(await executeStorageSendLine(sb, user, detail, saleId, line, qty));
  }

  return { storage_sends: sends, storage_send: sends[0] || null };
}

async function queueProductionStoragePush(row) {
  try {
    const { notifyProductionNewStorageSend } = await import('./productionExpoPush.js');
    await notifyProductionNewStorageSend(row);
  } catch (err) {
    console.warn('[warehouseStorageSends] push notify failed:', err?.message || err);
  }
}

export async function listWarehouseStorageSends(sb, { forProduction = false } = {}) {
  let query = sb.from(TABLE).select('*').order('created_at', { ascending: false }).limit(200);
  if (forProduction) {
    query = query.eq('status', WAREHOUSE_STORAGE_SEND_STATUSES.IN_STORAGE);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to load storage sends.');
  const rows = (data || []).map(mapRow);
  if (forProduction) {
    rows.sort((a, b) => String(a.customer_name || '').localeCompare(String(b.customer_name || '')));
  }
  return { storage_sends: rows };
}

export async function getWarehouseStorageSend(sb, id) {
  const { data, error } = await sb.from(TABLE).select('*').eq('id', String(id).trim()).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load storage send.');
  if (!data) throw new Error('Storage send not found.');
  return { storage_send: mapRow(data) };
}

function soldDeliveryPrintGroups(row) {
  const qty = Math.max(0, Number(row.quantity) || 0);
  return [{
    assembly_name: row.assembly_name,
    units: qty,
    elapsed_display: '—',
    lines: [],
  }];
}

async function openSoldDeliverySession(sb, { row, sessionId, user }) {
  const sid = String(sessionId || newUuid()).trim();
  const storageNumber = String(row.storage_number || '').trim();
  if (!storageNumber) throw new Error('Storage number missing.');
  const now = new Date().toISOString();
  const qty = Math.max(1, Number(row.quantity) || 1);
  const email = String(user?.email || '').trim().toLowerCase();
  const creatorName = user?.user_metadata?.full_name || user?.full_name || user?.email || null;
  const { data: existing } = await sb
    .from('warehouse_delivery_sessions')
    .select('id, delivery_number, status')
    .eq('id', sid)
    .maybeSingle();
  if (existing?.id && String(existing.status) === 'draft') {
    return { session_id: existing.id, delivery_number: existing.delivery_number || storageNumber };
  }
  const sessionRow = {
    id: sid,
    delivery_number: storageNumber,
    from_location: WAREHOUSE_FROM_LOCATION_ID,
    to_location: WAREHOUSE_TO_LOCATION_ID,
    status: 'draft',
    created_at: now,
    transfer_datetime: now,
    total_qty: qty,
    created_by_email: email || null,
    created_by_name: creatorName,
    metadata: {
      source: 'warehouse_production_mobile',
      document_kind: 'sold_delivery',
      storage_send_id: String(row.id),
      storage_number: storageNumber,
      customer_name: row.customer_name || '',
      customer_phone: row.customer_phone || '',
    },
  };
  const { error } = await sb.from('warehouse_delivery_sessions').insert(sessionRow);
  if (error) throw new Error(error.message || 'Failed to open sold delivery session.');
  return { session_id: sid, delivery_number: storageNumber };
}

async function finalizeSoldDeliverySession(sb, {
  row,
  sessionId,
  user,
  now,
  driverId,
  driverName,
  customerDriverName,
  customerDriverPhone,
  customerDriverActive,
  driverSignatureUrl,
}) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  const storageNumber = String(row.storage_number || '').trim();
  const qty = Math.max(1, Number(row.quantity) || 1);
  const email = String(user?.email || '').trim().toLowerCase();
  const creatorName = user?.user_metadata?.full_name || user?.full_name || user?.email || null;
  const sessionMeta = {
    source: 'warehouse_production_mobile',
    document_kind: 'sold_delivery',
    storage_send_id: String(row.id),
    storage_number: storageNumber,
    customer_name: row.customer_name || '',
    customer_phone: row.customer_phone || '',
    driver_id: driverId || null,
    driver_name: driverName,
    driver_signature_url: driverSignatureUrl || null,
    dispatched_by_name: creatorName,
    submitted_by_email: email || null,
    customer_driver_name: customerDriverActive ? customerDriverName : null,
    customer_driver_phone: customerDriverActive ? customerDriverPhone : null,
    customer_driver_signed: customerDriverActive,
    sold_to_customer: true,
  };

  const { data: sess } = await sb
    .from('warehouse_delivery_sessions')
    .select('id')
    .eq('id', sid)
    .maybeSingle();

  if (sess?.id) {
    await sb.from('warehouse_delivery_sessions').update({
      status: 'completed',
      submitted_at: now,
      total_qty: qty,
      metadata: sessionMeta,
      created_by_name: creatorName,
    }).eq('id', sid);
    await sb.from('warehouse_delivery_entries').delete().eq('session_id', sid);
  } else {
    await sb.from('warehouse_delivery_sessions').insert({
      id: sid,
      delivery_number: storageNumber,
      from_location: WAREHOUSE_FROM_LOCATION_ID,
      to_location: WAREHOUSE_TO_LOCATION_ID,
      status: 'completed',
      created_at: now,
      submitted_at: now,
      transfer_datetime: now,
      total_qty: qty,
      created_by_email: email || null,
      created_by_name: creatorName,
      metadata: sessionMeta,
    });
  }

  const entryId = newUuid();
  await sb.from('warehouse_delivery_entries').insert({
    id: entryId,
    session_id: sid,
    kind: 'assembly',
    name: row.assembly_name,
    sku: row.assembly_sku || '',
    quantity: qty,
    metadata: {
      assembly_id: row.assembly_id,
      assembly_name: row.assembly_name,
      finished_unit: true,
      units: qty,
      sold_storage_send_id: String(row.id),
    },
    created_at: now,
  });
  return sid;
}

/** Delivered POS storage units — for Sent deliveries (incl. legacy rows without sessions). */
export async function listStorageSendsForSentDeliveries(sb, {
  limit = 40,
  email = '',
  admin = false,
} = {}) {
  const cap = Math.min(80, Math.max(1, Number(limit) || 40));
  let query = sb
    .from(TABLE)
    .select('id, storage_number, delivery_number, status, delivered_at, driver_name, metadata, created_by_email, quantity, assembly_name, customer_name')
    .eq('status', WAREHOUSE_STORAGE_SEND_STATUSES.DELIVERED)
    .order('delivered_at', { ascending: false, nullsFirst: false })
    .limit(cap * 2);
  if (!admin && email) {
    query = query.eq('created_by_email', email);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to load sold deliveries.');
  return (data || []).map((row) => {
    const meta = row.metadata || {};
    const sessionId = String(meta.delivery_session_id || row.id).trim();
    const storageNumber = String(row.storage_number || row.delivery_number || '').trim();
    return {
      session_id: sessionId,
      delivery_number: storageNumber || row.delivery_number,
      display_number: storageNumber,
      document_kind: 'sold_delivery',
      status: 'completed',
      submitted_at: row.delivered_at || null,
      driver_name: row.driver_name || meta.customer_driver_name || '',
      dispatched_by_name: meta.dispatched_by_name || '',
      total_qty: row.quantity,
      storage_send_id: String(row.id),
      delivery_session_id: meta.delivery_session_id || null,
    };
  });
}

export async function buildSoldDeliverySentDetail(sb, storageSendId) {
  const { storage_send: row } = await getWarehouseStorageSend(sb, storageSendId);
  if (row.status !== WAREHOUSE_STORAGE_SEND_STATUSES.DELIVERED) {
    throw new Error('Sold delivery not found.');
  }
  const meta = row.metadata || {};
  const sessionId = String(meta.delivery_session_id || row.id).trim();
  const signatureUrl = row.driver_signature_url || '';
  const { fetchDeliverySignatureAsDataUri } = await import('./deliverySignatureInline.js');
  const driverSignatureDataUri = signatureUrl
    ? await fetchDeliverySignatureAsDataUri(signatureUrl)
    : '';
  const storageNumber = String(row.storage_number || row.delivery_number || '').trim();
  return {
    session: {
      id: sessionId,
      delivery_number: storageNumber,
      display_number: storageNumber,
      document_kind: 'sold_delivery',
      status: 'completed',
      submitted_at: row.delivered_at || meta.delivered_at || null,
      driver_name: row.driver_name || meta.customer_driver_name || '',
      dispatched_by_name: meta.dispatched_by_name || '',
      driver_signature_url: signatureUrl,
      customer_name: row.customer_name || '',
      customer_phone: row.customer_phone || '',
    },
    print_groups: soldDeliveryPrintGroups(row),
    driver_signature_data_uri: driverSignatureDataUri,
  };
}

export async function prepareWarehouseStorageDelivery(sb, body, user, grant) {
  await assertWarehouseStorageProductionAccess(user, grant);
  const id = String(body.storage_send_id || body.id || '').trim();
  const { storage_send: row } = await getWarehouseStorageSend(sb, id);
  if (row.status !== WAREHOUSE_STORAGE_SEND_STATUSES.IN_STORAGE) {
    throw new Error('This item is no longer in storage.');
  }
  const sessionId = String(body.session_id || body.sessionId || '').trim() || newUuid();
  const opened = await openSoldDeliverySession(sb, { row, sessionId, user });
  return {
    session_id: opened.session_id,
    storage_send: row,
    delivery_number: opened.delivery_number || row.storage_number,
  };
}

export async function submitWarehouseStorageDelivery(sb, body, user, grant) {
  await assertWarehouseStorageProductionAccess(user, grant);
  const { resolveMobileDeliveryDriver } = await import('./resolveMobileDeliveryDriver.js');
  const id = String(body.storage_send_id || body.id || '').trim();
  const { driverName, driverId, customerDriverName, customerDriverPhone, customerDriverActive } = resolveMobileDeliveryDriver(body);

  const { storage_send: row } = await getWarehouseStorageSend(sb, id);
  if (row.status !== WAREHOUSE_STORAGE_SEND_STATUSES.IN_STORAGE) {
    throw new Error('This item is no longer in storage.');
  }

  const deliveryNumber = String(row.storage_number || '').trim();
  if (!deliveryNumber) throw new Error('Storage number missing.');
  const now = new Date().toISOString();
  const qty = Number(row.quantity) || 0;
  const sessionId = String(body.session_id || body.sessionId || '').trim();
  const alreadyDeductedFloor1 = row.metadata?.floor1_deducted_on_create === true;
  if (!alreadyDeductedFloor1) {
    await adjustAssemblyStock(sb, row.assembly_id, FACTORY_ID, -qty);
  }

  const deliverySessionId = await finalizeSoldDeliverySession(sb, {
    row,
    sessionId,
    user,
    now,
    driverId,
    driverName,
    customerDriverName,
    customerDriverPhone,
    customerDriverActive,
    driverSignatureUrl: body.driver_signature_url || null,
  });

  const { error } = await sb.from(TABLE).update({
    status: WAREHOUSE_STORAGE_SEND_STATUSES.DELIVERED,
    delivery_number: deliveryNumber,
    driver_id: driverId || null,
    driver_name: driverName,
    driver_signature_url: body.driver_signature_url || null,
    delivered_at: now,
    updated_at: now,
    metadata: {
      ...(row.metadata || {}),
      delivered_at: now,
      delivery_session_id: deliverySessionId || sessionId || null,
      customer_driver_name: customerDriverActive ? customerDriverName : null,
      customer_driver_phone: customerDriverActive ? customerDriverPhone : null,
      customer_driver_signed: customerDriverActive,
    },
  }).eq('id', id);
  if (error) {
    if (!alreadyDeductedFloor1) {
      await adjustAssemblyStock(sb, row.assembly_id, FACTORY_ID, qty);
    }
    throw new Error(error.message || 'Failed to complete delivery.');
  }

  return {
    storage_send: mapRow({
      ...row,
      status: WAREHOUSE_STORAGE_SEND_STATUSES.DELIVERED,
      delivery_number: deliveryNumber,
      driver_name: driverName,
      delivered_at: now,
    }),
    delivery_number: deliveryNumber,
    submitted_at: now,
    driver_signature_url: body.driver_signature_url || '',
    session_id: deliverySessionId || sessionId || null,
    print_groups: soldDeliveryPrintGroups(row),
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
  };
}

function resolveSetComponentsForManualStorage(setAssemblyId, setItems, assembliesById) {
  const sid = String(setAssemblyId || '').trim();
  const expanded = expandWarehouseSetItemsRows(setItems || []).filter(
    (r) => String(r.set_assembly_id) === sid,
  );
  if (!expanded.length) return [];

  let lines = expanded.filter((r) => String(r.location_id) === String(FACTORY_ID));
  if (!lines.length) {
    lines = expanded.filter((r) => String(r.location_id) === String(KITWE_LOCATION_ID));
  }
  if (!lines.length) {
    const firstLoc = expanded[0]?.location_id;
    lines = expanded.filter((r) => String(r.location_id) === String(firstLoc));
  }

  const byComponent = new Map();
  for (const row of lines) {
    const cid = String(row.component_assembly_id || '').trim();
    if (!cid) continue;
    const comp = assembliesById.get(cid);
    if (!comp) continue;
    const perSet = Math.max(1, Math.floor(Number(row.quantity) || 1));
    byComponent.set(cid, (byComponent.get(cid) || 0) + perSet);
  }
  return [...byComponent.entries()].map(([cid, perSetQty]) => ({
    component: assembliesById.get(cid),
    perSetQty,
  }));
}

export async function createManualWarehouseStorageSend(sb, body, user) {
  if (!canManageCatalog(user) && !canWarehouseKitweStorageCreator(user)) {
    const err = new Error('Catalog admin access required to add to Sales Storage.');
    err.status = 403;
    throw err;
  }

  const customerId = body.customer_id ? String(body.customer_id).trim() : '';
  let customerName = String(body.customer_name || '').trim();
  let customerPhone = String(body.customer_phone || '').trim();

  if (customerId && (!customerName || !customerPhone)) {
    const { data: cust } = await sb
      .from('customers')
      .select('id, name, phone')
      .eq('id', customerId)
      .maybeSingle();
    if (cust) {
      if (!customerName) customerName = String(cust.name || '').trim();
      if (!customerPhone) customerPhone = String(cust.phone || '').trim();
    } else {
      const { data: qc } = await sb
        .from('quote_customers')
        .select('id, name, phone')
        .eq('id', customerId)
        .maybeSingle();
      if (qc) {
        if (!customerName) customerName = String(qc.name || '').trim();
        if (!customerPhone) customerPhone = String(qc.phone || '').trim();
      }
    }
  }

  if (!customerName) {
    throw new Error('Select a customer first.');
  }

  const rawLines = Array.isArray(body.lines) && body.lines.length
    ? body.lines
    : [{
      assembly_id: body.assembly_id,
      quantity: body.quantity,
    }];

  const validLines = rawLines
    .map((l) => ({
      assembly_id: String(l?.assembly_id || l?.assemblyId || '').trim(),
      quantity: Math.max(1, Math.floor(Number(l?.quantity ?? l?.qty) || 1)),
    }))
    .filter((l) => l.assembly_id);

  if (!validLines.length) {
    throw new Error('Select at least one product or set.');
  }

  const [
    { data: allAssemblies, error: aErr },
    { data: allSetItems, error: sErr },
    { data: allPackets, error: pErr },
    { data: assemblyPacketRows, error: apErr },
  ] = await Promise.all([
    sb.from('warehouse_assemblies').select('id, name, family_sku, item_kind, packet_count, inventory_mode, units_per_carton'),
    sb.from('warehouse_set_items').select('*'),
    sb.from('warehouse_packets').select('id, sku, name, packet_number, qty_per_unit, assembly_id'),
    sb.from('warehouse_assembly_packets').select('*'),
  ]);
  if (aErr) throw new Error(aErr.message || 'Failed to load warehouse catalog.');
  if (sErr) throw new Error(sErr.message || 'Failed to load set components.');
  if (pErr) throw new Error(pErr.message || 'Failed to load warehouse packets.');
  if (apErr) throw new Error(apErr.message || 'Failed to load packet links.');

  const assembliesById = new Map((allAssemblies || []).map((a) => [String(a.id), a]));
  const packetsByAssembly = buildPacketsByAssembly(assemblyPacketRows || [], allPackets || []);
  const operatorName = user?.user_metadata?.full_name || user?.full_name || user?.email || 'Warehouse Catalog';
  const now = new Date().toISOString();
  const rawSaleDate = String(body.sale_date || body.saleDate || '').trim();
  const effectiveSaleDate = rawSaleDate || now;
  const createdRows = [];
  let totalLabelsPrinted = 0;

  async function deductComponentFromFloor1(compAsm, unitsToDeduct) {
    const u = Math.max(1, Math.floor(Number(unitsToDeduct) || 1));
    const aid = String(compAsm.id);
    const pktList = packetsByAssembly.get(aid) || [];
    if (assemblyDerivesWarehouseStockFromPackets(compAsm, pktList)) {
      for (const pkt of pktList) {
        const cartonDelta = u * Math.max(1, Math.floor(Number(pkt.qty_per_unit) || 1));
        await adjustPacketStock(sb, pkt.id, FACTORY_ID, -cartonDelta);
      }
      return;
    }
    if (assemblyUsesFinishedBoxReceiving(compAsm, pktList) && pktList[0]?.id) {
      const perBox = assemblyUnitsPerCarton(compAsm);
      const boxesDelta = boxCountFromFinishedUnits(u, perBox);
      await adjustPacketStock(sb, pktList[0].id, FACTORY_ID, -boxesDelta);
      return;
    }
    const have = await getAssemblyStockQty(sb, aid, FACTORY_ID);
    if (have < u) {
      throw new Error(`Insufficient Floor 1 stock for "${compAsm.name}" (need ${u}, have ${have}).`);
    }
    await adjustAssemblyStock(sb, aid, FACTORY_ID, -u);
  }

  for (const reqLine of validLines) {
    const selectedAsm = assembliesById.get(reqLine.assembly_id);
    if (!selectedAsm) {
      throw new Error('Selected product or set not found in warehouse catalog.');
    }

    const isSet = isWarehouseSetAssembly(selectedAsm);
    let labelTargets = [];

    if (isSet) {
      const comps = resolveSetComponentsForManualStorage(
        selectedAsm.id,
        allSetItems || [],
        assembliesById,
      );
      if (!comps.length) {
        throw new Error(`Set "${selectedAsm.name}" has no component products configured.`);
      }
      labelTargets = comps.map(({ component, perSetQty }) => ({
        assembly: component,
        printQty: perSetQty * reqLine.quantity,
        parentSet: selectedAsm,
      }));
    } else {
      labelTargets = [{
        assembly: selectedAsm,
        printQty: reqLine.quantity,
        parentSet: null,
      }];
    }

    // Deduct from Floor 1 stock first (validates sufficient stock before printing/saving)
    for (const target of labelTargets) {
      await deductComponentFromFloor1(target.assembly, target.printQty);
    }

    // Print Zebra labels for each component (if set) or product
    for (const target of labelTargets) {
      const compAsm = target.assembly;
      const copies = Math.max(1, Math.floor(Number(target.printQty) || 1));
      await printWarehouseStorageSaleLabel(getFirestore(), {
        name: compAsm.name,
        sku: compAsm.family_sku || compAsm.name,
        customerName,
        customerPhone: customerPhone || '—',
        qty: copies,
        saleDate: effectiveSaleDate,
        setName: target.parentSet ? target.parentSet.name : '',
        printedBy: operatorName,
      });
      totalLabelsPrinted += copies;
    }

    // Add to sales-storage after printing
    const storageNumber = await allocateWarehouseStorageNumber();
    const id = newUuid();
    const row = {
      id,
      storage_number: storageNumber,
      sale_id: null,
      sale_item_id: null,
      receipt_number: isSet ? `SET (${selectedAsm.family_sku || selectedAsm.name})` : 'MANUAL',
      assembly_id: selectedAsm.id,
      assembly_name: selectedAsm.name,
      assembly_sku: selectedAsm.family_sku || null,
      customer_id: customerId || null,
      customer_name: customerName,
      customer_phone: customerPhone || null,
      quantity: reqLine.quantity,
      sale_date: effectiveSaleDate,
      status: WAREHOUSE_STORAGE_SEND_STATUSES.IN_STORAGE,
      labels_printed_at: now,
      created_at: now,
      updated_at: now,
      created_by_email: user?.email || null,
      created_by_name: operatorName,
      metadata: {
        manual_catalog_storage: true,
        sale_date: effectiveSaleDate,
        floor1_deducted_on_create: true,
        floor1_deducted_at: now,
        item_kind: isSet ? 'set' : 'product',
        printed_components: labelTargets.map((t) => ({
          assembly_id: t.assembly.id,
          name: t.assembly.name,
          sku: t.assembly.family_sku || '',
          printed_qty: t.printQty,
        })),
      },
    };

    const { error: insErr } = await sb.from(TABLE).insert(row);
    if (insErr) {
      throw new Error(insErr.message || 'Failed to add to sales storage.');
    }

    const mapped = mapRow(row);
    queueProductionStoragePush(mapped);
    createdRows.push(mapped);
  }

  await recomputeWarehouseLocationStockServer(sb, FACTORY_ID);

  return {
    storage_sends: createdRows,
    storage_send: createdRows[0] || null,
    total_labels_printed: totalLabelsPrinted,
  };
}

export async function reprintWarehouseStorageLabels(sb, body, user) {
  if (!canManageCatalog(user) && !canWarehouseKitweStorageCreator(user)) {
    const err = new Error('Catalog admin access required to reprint Sales Storage labels.');
    err.status = 403;
    throw err;
  }

  const id = String(body.storage_send_id || body.id || '').trim();
  if (!id) throw new Error('storage_send_id is required.');

  const { storage_send: row } = await getWarehouseStorageSend(sb, id);
  const operatorName = user?.user_metadata?.full_name || user?.full_name || user?.email || 'Warehouse Catalog';
  const customerName = String(row.customer_name || 'Customer').trim();
  const customerPhone = String(row.customer_phone || '—').trim();

  let saleDate = row.sale_date || row.metadata?.sale_date || null;
  if (!saleDate && row.sale_id) {
    const { data: saleRow } = await sb
      .from('sales')
      .select('sale_date, created_at')
      .eq('id', row.sale_id)
      .maybeSingle();
    saleDate = saleRow?.sale_date || saleRow?.created_at || null;
  }
  if (!saleDate) {
    saleDate = row.created_at || new Date().toISOString();
  }

  const printedComps = Array.isArray(row?.metadata?.printed_components)
    ? row.metadata.printed_components
    : [];

  let isSetRow = row?.metadata?.item_kind === 'set'
    || /^SET\s*\(/i.test(String(row.receipt_number || ''))
    || /\bset\b/i.test(String(row.assembly_name || ''))
    || printedComps.length > 0;
  let parentSetName = isSetRow ? String(row.assembly_name || '').trim() : '';
  if (!parentSetName && row.assembly_id) {
    const { data: asmRow } = await sb
      .from('warehouse_assemblies')
      .select('name, item_kind')
      .eq('id', row.assembly_id)
      .maybeSingle();
    if (asmRow && isWarehouseSetAssembly(asmRow)) {
      isSetRow = true;
      parentSetName = String(asmRow.name || row.assembly_name || '').trim();
    }
  }

  let totalLabelsPrinted = 0;

  if (printedComps.length > 0) {
    for (const comp of printedComps) {
      const copies = Math.max(1, Math.floor(Number(comp.printed_qty) || 1));
      await printWarehouseStorageSaleLabel(getFirestore(), {
        name: comp.name || row.assembly_name,
        sku: comp.sku || row.assembly_sku || comp.name || row.assembly_name,
        customerName,
        customerPhone,
        qty: copies,
        saleDate,
        setName: parentSetName,
        printedBy: operatorName,
      });
      totalLabelsPrinted += copies;
    }
  } else {
    const [{ data: allAssemblies }, { data: allSetItems }] = await Promise.all([
      sb.from('warehouse_assemblies').select('id, name, family_sku, item_kind'),
      sb.from('warehouse_set_items').select('*'),
    ]);
    const assembliesById = new Map((allAssemblies || []).map((a) => [String(a.id), a]));
    const selectedAsm = assembliesById.get(String(row.assembly_id));
    if (selectedAsm && isWarehouseSetAssembly(selectedAsm)) {
      const comps = resolveSetComponentsForManualStorage(
        selectedAsm.id,
        allSetItems || [],
        assembliesById,
      );
      if (comps.length > 0) {
        const setQty = Math.max(1, Math.floor(Number(row.quantity) || 1));
        for (const { component, perSetQty } of comps) {
          const copies = Math.max(1, perSetQty * setQty);
          await printWarehouseStorageSaleLabel(getFirestore(), {
            name: component.name,
            sku: component.family_sku || component.name,
            customerName,
            customerPhone,
            qty: copies,
            saleDate,
            setName: selectedAsm.name,
            printedBy: operatorName,
          });
          totalLabelsPrinted += copies;
        }
      }
    }
    if (totalLabelsPrinted === 0) {
      const copies = Math.max(1, Math.floor(Number(row.quantity) || 1));
      await printWarehouseStorageSaleLabel(getFirestore(), {
        name: row.assembly_name,
        sku: row.assembly_sku || row.assembly_name,
        customerName,
        customerPhone,
        qty: copies,
        saleDate,
        printedBy: operatorName,
      });
      totalLabelsPrinted += copies;
    }
  }

  const now = new Date().toISOString();
  await sb.from(TABLE).update({
    labels_printed_at: now,
    updated_at: now,
  }).eq('id', row.id);

  return {
    storage_send: mapRow({ ...row, labels_printed_at: now }),
    total_labels_printed: totalLabelsPrinted,
  };
}
