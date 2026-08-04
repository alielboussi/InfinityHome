// Service to fetch consolidated layby statement via RPC get_layby_statement
// Feature-flag driven; caller can fall back to legacy multi-query logic if needed.
import db from './dataClient';

// Environment-driven feature flag: set REACT_APP_USE_LAYBY_RPC=true to enable.
// Defaults to false so API/client statement filters remain the single active-only source.
export const USE_LAYBY_RPC = (process.env.REACT_APP_USE_LAYBY_RPC == null)
  ? false
  : (String(process.env.REACT_APP_USE_LAYBY_RPC).toLowerCase() === 'true');

const isClosedSaleStatus = (status) => {
  const s = String(status || '').trim().toLowerCase();
  return s === 'completed' || s === 'cancelled' || s === 'voided' || s === 'refunded' || s === 'settled' || s === 'paid';
};

const saleLooksOpen = (sale) => {
  const status = String(sale?.status || '').trim().toLowerCase();
  const outstanding = Number(
    sale?.outstanding_amount ??
    sale?.due ??
    sale?.due_amount ??
    sale?.balance_due ??
    0
  );
  if (Number.isFinite(outstanding) && outstanding > 0) return true;
  if (status) return !isClosedSaleStatus(status);
  return false;
};

// Normalized shape returned:
// { layby: {...}, sales: [], items: [], payments: [] }
export async function fetchLaybyStatementRPC(customerId, laybyId) {
  if (!customerId || !laybyId) return { error: 'MISSING_IDS' };
  const { data, error } = await db.rpc('get_layby_statement', { p_customer_id: customerId, p_layby_id: laybyId });
  if (error) return { error: error.message || String(error) };
  if (!data) return { error: 'NO_DATA' };
  if (data.error) return { error: data.error };
  const norm = {
    layby: data.layby || {},
    sales: Array.isArray(data.sales) ? data.sales : [],
    items: Array.isArray(data.items) ? data.items : [],
    payments: Array.isArray(data.payments) ? data.payments : [],
  };
  // Enforce active/pending layby logic even when RPC returns broader history.
  const allowedSaleIds = new Set(
    (norm.sales || [])
      .filter((s) => saleLooksOpen(s))
      .map((s) => String(s?.sale_id ?? s?.id ?? '').trim())
      .filter(Boolean)
  );
  norm.sales = (norm.sales || []).filter((s) => allowedSaleIds.has(String(s?.sale_id ?? s?.id ?? '').trim()));
  norm.items = (norm.items || []).filter((it) => allowedSaleIds.has(String(it?.sale_id || '').trim()));
  norm.payments = (norm.payments || []).filter((p) => allowedSaleIds.has(String(p?.sale_id || '').trim()));
  // Normalize payments payment_type lowercase + include allocation_batch_uuid (already present)
  norm.payments = norm.payments.map(p => ({ ...p, payment_type: String(p.payment_type || '').toLowerCase() }));
  return { data: norm };
}
