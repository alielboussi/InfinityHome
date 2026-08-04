// Minimal shared rules and helpers for Layby/Fahme logic
// Now uses canonical PDF-aligned financials to ensure consistency across pages.
import { fetchCanonicalFinancials } from './utils/financials';

export const FAHME_ID = 'd8e756ae-b8ea-4f90-b99a-70c1120f52b9';
export const FAHME_IDS = [
  FAHME_ID,
  'efb21cad-1a8d-4d64-9487-51e816fcb429',
];

export function isFahme(customerId) {
  if (!customerId) return false;
  const key = String(customerId).trim().toLowerCase();
  return FAHME_IDS.some((id) => String(id).toLowerCase() === key);
}

// Compute total/paid/outstanding per layby using computeSaleFinancials from base tables
export async function computeLaybyRollups(db, laybys) {
  const rows = Array.isArray(laybys) ? laybys : [];
  if (!rows.length) return {};

  // Build mapping from layby -> candidate sale IDs
  const byLayby = new Map();
  const allSaleIdsSet = new Set();
  // Layby IDs are UUID (text) now; keep original string values for matching
  const toKey = (id) => id == null ? null : String(id);

  rows.forEach(r => {
    const set = new Set();
    if (r.sale_id != null) { set.add(r.sale_id); allSaleIdsSet.add(r.sale_id); }
    byLayby.set(String(r.id), { sales: set });
  });

  // Fetch extra sales linked by sales.layby_id
  try {
    const laybyIds = Array.from(new Set(rows.map(r => toKey(r.id)).filter(Boolean)));
    if (laybyIds.length) {
      const q = await db
        .schema('public')
        .from('sales')
        .select('id, layby_id, customer_id')
        .in('layby_id', laybyIds);
      const extraSales = q.error ? [] : (q.data || []);
      extraSales.forEach(s => {
        const key = String(s.layby_id);
        const entry = byLayby.get(key);
        if (!entry) return;
        entry.sales.add(s.id);
        allSaleIdsSet.add(s.id);
        byLayby.set(key, entry);
      });
    }
  } catch {}

  const allSaleIds = Array.from(allSaleIdsSet).filter(v => v != null);
  // Fetch canonical financials for all sales
  let finBySale = new Map();
  if (allSaleIds.length) {
    try {
      const map = await fetchCanonicalFinancials(db, allSaleIds);
      finBySale = map;
    } catch {}
  }

  // Compute per-layby aggregates from base-table financials; fallback to layby table values
  const out = {};
  rows.forEach(l => {
    const ref = byLayby.get(String(l.id));
    const saleIds = Array.from(ref?.sales || []);
    let total = 0;
    let paid = 0;
    saleIds.forEach(id => {
      const fin = finBySale.get(String(id));
      if (fin) {
        total += Number(fin.total_due || 0);
        paid += Number(fin.paid_amount || 0);
      }
    });
    if (!saleIds.length || finBySale.size === 0) {
      // fallback
      total = Number(l.total_amount || 0);
      paid = Number(l.paid || l.paid_amount || 0);
    }
    out[String(l.id)] = { total, paid, outstanding: Math.max(0, total - paid) };
  });
  return out;
}

// For Fahme, compute an override outstanding across all his laybys (applies opening credit once)
export async function computeFahmeOverrides(db, laybys) {
  const rows = Array.isArray(laybys) ? laybys : [];
  if (!rows.length) return {};
  const rollups = await computeLaybyRollups(db, rows);
  const totals = Object.entries(rollups).reduce((acc, [, v]) => {
    acc.total += Number(v.total || 0);
    acc.paid += Number(v.paid || 0);
    return acc;
  }, { total: 0, paid: 0 });
  const combinedOutstanding = Math.max(0, totals.total - totals.paid);
  const map = {};
  rows.forEach(r => { map[String(r.id)] = { outstanding: combinedOutstanding }; });
  return map;
}

// POS badge due helper (minimal); return 0 for now or compute externally
export async function computePosBadgeDue(/* db, customerId */) {
  return 0;
}
