import { newUuid } from './uuid.js';
import { allocateWarehouseStorageNumber } from './warehouseStorageNumber.js';
import { adjustAssemblyStock, getAssemblyStockQty } from './warehouseReturnStock.js';
import { printWarehouseReturnCustomerLabel } from './warehouseReturnCustomerLabelPrint.js';
import { getFirestore } from './firestoreDb.js';
import { HASSAN_AWAD, canManageCatalog } from '../../src/accessControl.js';
import { isLoginAccessAdmin } from './loginAccess.js';
import { KITWE_LOCATION_ID } from '../../src/constants/warehouseShowroomLocations.js';
import { WAREHOUSE_FROM_LOCATION_ID } from '../../src/utils/warehouseDelivery.js';
import {
  isWarehouseProductionKitweDeliveryAllowed,
} from '../../src/mobile/mobileAccessManifest.js';
import { WAREHOUSE_STORAGE_SEND_STATUSES } from '../../src/utils/warehouseStorageSend.js';
import { normalizeWarehouseSku } from '../../src/utils/warehouseAssemblyMath.js';
import { isWarehouseProductAssembly } from '../../src/utils/warehouseCatalogHierarchy.js';

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

function isStorageEligibleSaleRow(row) {
  const receipt = String(row?.receipt_number || '').trim();
  if (!receipt) return false;
  const status = String(row?.status || '').toLowerCase();
  if (status === 'void' || status === 'cancelled' || status === 'canceled') return false;
  return String(row?.location_id || '') === String(KITWE_LOCATION_ID);
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
  const saleItemId = body.sale_item_id;
  const qty = Math.max(1, Math.floor(Number(body.quantity) || 0));
  if (saleId == null || saleItemId == null) throw new Error('Receipt line is required.');

  const detail = await getPosSaleDetailForStorage(sb, user, { sale_id: saleId });
  const line = detail.items.find((i) => String(i.id) === String(saleItemId));
  if (!line) throw new Error('Sale line not found.');
  if (qty > line.quantity) {
    throw new Error(`Cannot send more than sold quantity (${line.quantity}).`);
  }

  let assembly = await findAssemblyForProduct(sb, line.product_id, line.display_name);
  if (!assembly) {
    assembly = await createAssemblyFromSaleItem(sb, {
      productId: line.product_id,
      displayName: line.display_name,
    });
  }

  const kitweQty = await getAssemblyStockQty(sb, assembly.id, KITWE_LOCATION_ID);
  if (kitweQty < qty) {
    throw new Error(`Insufficient Kitwe stock (need ${qty}, have ${kitweQty}).`);
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
    sale_item_id: saleItemId,
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

  const result = await printWarehouseReturnCustomerLabel(getFirestore(), {
    name: assembly.name,
    sku: assembly.family_sku || assembly.name,
    customerName: detail.sale.customer_name || 'Customer',
    customerPhone: detail.sale.customer_phone || '',
    qty,
    printedBy: row.created_by_name,
    printedAt: now,
  });

  await sb.from(TABLE).update({
    labels_printed_at: now,
    updated_at: now,
  }).eq('id', id);

  const mapped = mapRow({ ...row, labels_printed_at: now });
  queueProductionStoragePush(mapped);
  return { storage_send: mapped };
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

export async function prepareWarehouseStorageDelivery(sb, body, user, grant) {
  await assertWarehouseStorageProductionAccess(user, grant);
  const id = String(body.storage_send_id || body.id || '').trim();
  const { storage_send: row } = await getWarehouseStorageSend(sb, id);
  if (row.status !== WAREHOUSE_STORAGE_SEND_STATUSES.IN_STORAGE) {
    throw new Error('This item is no longer in storage.');
  }
  const sessionId = newUuid();
  return {
    session_id: sessionId,
    storage_send: row,
    delivery_number: row.delivery_number || null,
  };
}

export async function submitWarehouseStorageDelivery(sb, body, user, grant) {
  await assertWarehouseStorageProductionAccess(user, grant);
  const id = String(body.storage_send_id || body.id || '').trim();
  const driverId = String(body.driver_id || '').trim();
  const driverName = String(body.driver_name || '').trim();
  if (!driverName) throw new Error('Driver is required.');

  const { storage_send: row } = await getWarehouseStorageSend(sb, id);
  if (row.status !== WAREHOUSE_STORAGE_SEND_STATUSES.IN_STORAGE) {
    throw new Error('This item is no longer in storage.');
  }

  const deliveryNumber = String(row.storage_number || '').trim();
  if (!deliveryNumber) throw new Error('Storage number missing.');
  const now = new Date().toISOString();
  const qty = Number(row.quantity) || 0;
  await adjustAssemblyStock(sb, row.assembly_id, FACTORY_ID, -qty);

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
    },
  }).eq('id', id);
  if (error) {
    await adjustAssemblyStock(sb, row.assembly_id, FACTORY_ID, qty);
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
    print_groups: [{
      assembly_name: row.assembly_name,
      units: qty,
      elapsed_display: '—',
      lines: [],
    }],
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
  };
}
