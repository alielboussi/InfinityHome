import db from '../dataClient';
import { KITWE_LOCATION_ID } from '../constants/warehouseShowroomLocations';

function isEligible(row) {
  const receipt = String(row?.receipt_number || '').trim();
  if (!receipt) return false;
  const status = String(row?.status || '').toLowerCase();
  if (status === 'void' || status === 'cancelled' || status === 'canceled') return false;
  return String(row?.location_id || '') === String(KITWE_LOCATION_ID);
}

function mapRow(row) {
  return {
    id: row.id,
    receipt_number: String(row.receipt_number || '').trim(),
    sale_date: row.sale_date || row.created_at,
    customer_id: row.customer_id,
    total_amount: row.total_amount,
    currency: row.currency,
    status: row.status,
  };
}

/** All Kitwe POS receipts (any cashier) — Hassan warehouse storage picker. */
export async function loadKitwePosSalesForStoragePage() {
  const { data, error } = await db
    .from('sales')
    .select('id, receipt_number, sale_date, created_at, customer_id, total_amount, currency, status, location_id')
    .eq('location_id', KITWE_LOCATION_ID)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  let rows = (data || []).filter(isEligible);
  if (!rows.length) {
    const { data: recent, error: recentErr } = await db
      .from('sales')
      .select('id, receipt_number, sale_date, created_at, customer_id, total_amount, currency, status, location_id')
      .order('created_at', { ascending: false })
      .limit(400);
    if (!recentErr) rows = (recent || []).filter(isEligible);
  }
  return rows.map(mapRow);
}

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

async function loadSaleCustomerFields(customerId) {
  const id = String(customerId || '').trim();
  if (!id) return { customer_id: null, customer_name: '', customer_phone: '' };
  const { data: cust } = await db.from('customers').select('id, name, phone').eq('id', id).maybeSingle();
  if (cust) {
    return {
      customer_id: cust.id,
      customer_name: String(cust.name || '').trim(),
      customer_phone: String(cust.phone || '').trim(),
    };
  }
  const { data: qc } = await db.from('quote_customers').select('id, name, phone').eq('id', id).maybeSingle();
  if (qc) {
    return {
      customer_id: qc.id,
      customer_name: String(qc.name || '').trim(),
      customer_phone: String(qc.phone || '').trim(),
    };
  }
  return { customer_id: id, customer_name: '', customer_phone: '' };
}

async function querySaleItemsForStorage(saleId) {
  for (const key of saleIdEqVariants(saleId)) {
    const { data, error } = await db
      .from('sales_items')
      .select('id, sale_id, product_id, display_name, name, quantity, unit_price')
      .eq('sale_id', key);
    if (!error && (data || []).length) return data;
  }
  return [];
}

/** Receipt lines when storage API is unavailable or returns no items (Firestore sale_id type coercion). */
export async function loadKitwePosSaleDetailForStoragePage(saleId) {
  if (saleId == null || String(saleId).trim() === '') {
    throw new Error('Sale is required.');
  }
  let sale = null;
  for (const key of saleIdEqVariants(saleId)) {
    const { data, error } = await db
      .from('sales')
      .select('id, receipt_number, sale_date, created_at, customer_id, location_id, status')
      .eq('id', key)
      .maybeSingle();
    if (!error && data) {
      sale = data;
      break;
    }
  }
  if (!sale) throw new Error('Sale not found.');
  if (String(sale.location_id) !== String(KITWE_LOCATION_ID)) {
    throw new Error('Only Kitwe POS receipts can be sent to warehouse storage.');
  }
  const [itemsRaw, customer] = await Promise.all([
    querySaleItemsForStorage(sale.id),
    loadSaleCustomerFields(sale.customer_id),
  ]);
  return {
    sale: {
      ...sale,
      receipt_number: String(sale.receipt_number || '').trim(),
      ...customer,
    },
    items: mapStorageSaleItems(itemsRaw),
  };
}
