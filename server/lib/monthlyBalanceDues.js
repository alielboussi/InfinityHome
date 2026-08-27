import { aggregateCustomerTotals, buildFinancialsMap } from '../../src/utils/saleFinancials.js';
import { isExcludedFromMonthlyBalanceDue } from '../../src/utils/whatsappCustomerRules.js';
import { buildMonthlyBalanceDueMessages } from '../../src/utils/monthlyBalanceDuesMessage.js';
import { resolveStoredLaybyPdfUrl } from './laybyPdfStorage.js';

const BALANCE_THRESHOLD = 1;
const LUSAKA_TZ = 'Africa/Lusaka';

function normalizeBalanceDue(balanceDue, currency = 'K') {
  const due = Math.max(0, Number(balanceDue || 0));
  if (due < BALANCE_THRESHOLD) return 0;
  return due;
}

async function computeTotalsForCustomers(db, customerIds) {
  const ids = Array.from(new Set((customerIds || []).map((id) => String(id)).filter(Boolean)));
  if (!ids.length) return {};

  const [{ data: salesRows, error: salesErr }, { data: laybyRows, error: laybyErr }] = await Promise.all([
    db
      .from('sales')
      .select('id, customer_id, currency, total_amount, discount, layby_id')
      .in('customer_id', ids),
    db
      .from('laybys')
      .select('id, customer_id')
      .in('customer_id', ids),
  ]);
  if (salesErr) throw salesErr;
  if (laybyErr) throw laybyErr;

  const laybyIds = (laybyRows || []).map((row) => row.id).filter((value) => value != null);
  const laybyCustomerById = new Map((laybyRows || []).map((row) => [String(row.id), String(row.customer_id)]));

  let linkedSales = [];
  if (laybyIds.length) {
    const { data: byLayby, error: linkedErr } = await db
      .from('sales')
      .select('id, customer_id, currency, total_amount, discount, layby_id')
      .in('layby_id', laybyIds);
    if (linkedErr) throw linkedErr;
    linkedSales = byLayby || [];
  }

  const salesById = new Map();
  [...(salesRows || []), ...linkedSales].forEach((sale) => {
    if (!sale?.id) return;
    const customerId = sale.customer_id || laybyCustomerById.get(String(sale.layby_id || '')) || null;
    if (!customerId || !ids.includes(String(customerId))) return;
    salesById.set(String(sale.id), { ...sale, customer_id: customerId });
  });

  const normalizedSales = [...salesById.values()];
  const saleIds = normalizedSales.map((sale) => sale.id).filter((value) => value != null);
  if (!saleIds.length) return {};

  const [itemsRes, payRes] = await Promise.all([
    db
      .from('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .in('sale_id', saleIds),
    db
      .from('sales_payments')
      .select('sale_id, amount, discount_amount, currency')
      .in('sale_id', saleIds),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  const payRows = payRes.error ? [] : (payRes.data || []);

  const finMap = buildFinancialsMap(normalizedSales, itemsRes.data || [], payRows);
  return aggregateCustomerTotals(normalizedSales, finMap, payRows);
}

export async function fetchCustomersWithBalanceDue(db) {
  const { data: customers, error: custErr } = await db
    .from('customers')
    .select('id, name, currency, phone')
    .order('name', { ascending: true });
  if (custErr) throw custErr;

  const eligible = (customers || []).filter((row) => (
    row?.id && !isExcludedFromMonthlyBalanceDue(row.id, row.name)
  ));
  if (!eligible.length) return [];

  const customerIds = eligible.map((row) => row.id);
  const totalsByCustomer = await computeTotalsForCustomers(db, customerIds);
  const nameById = new Map(eligible.map((row) => [String(row.id), String(row.name || 'Unknown').trim() || 'Unknown']));
  const phoneById = new Map(eligible.map((row) => [String(row.id), String(row.phone || '').trim()]));

  const { data: laybyRows, error: laybyErr } = await db
    .from('laybys')
    .select('id, customer_id, updated_at, created_at')
    .in('customer_id', customerIds);
  if (laybyErr) throw laybyErr;

  const laybyIdByCustomer = new Map();
  (laybyRows || []).forEach((layby) => {
    const customerId = String(layby?.customer_id || '').trim();
    if (!customerId) return;
    const existing = laybyIdByCustomer.get(customerId);
    const existingTime = existing?.updated_at || existing?.created_at || '';
    const candidateTime = layby?.updated_at || layby?.created_at || '';
    if (!existing || String(candidateTime) > String(existingTime)) {
      laybyIdByCustomer.set(customerId, layby);
    }
  });

  const rows = [];
  Object.entries(totalsByCustomer).forEach(([customerId, byCurrency]) => {
    const balances = Object.entries(byCurrency || {})
      .map(([currency, agg]) => ({
        currency,
        outstanding: normalizeBalanceDue(agg?.outstanding, currency),
      }))
      .filter((entry) => entry.outstanding > 0);

    if (!balances.length) return;
    const layby = laybyIdByCustomer.get(String(customerId)) || null;
    rows.push({
      customerId,
      laybyId: layby?.id || null,
      name: nameById.get(String(customerId)) || 'Unknown',
      phone: phoneById.get(String(customerId)) || '',
      balances,
      totalOutstanding: balances.reduce((sum, entry) => sum + entry.outstanding, 0),
    });
  });

  rows.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  return rows;
}

export async function enrichBalanceDueRowsWithStoredPdfs(rows = []) {
  const enriched = [];
  for (const row of rows) {
    const laybyPdfUrl = await resolveStoredLaybyPdfUrl(row.laybyId, row.customerId);
    enriched.push({ ...row, laybyPdfUrl: laybyPdfUrl || '' });
  }
  return enriched;
}

export { buildMonthlyBalanceDueMessages };

export function isScheduledMonthlyRunDay(date = new Date()) {
  try {
    const day = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: LUSAKA_TZ,
      day: 'numeric',
    }).format(date));
    return day === 30;
  } catch {
    return date.getUTCDate() === 30;
  }
}
