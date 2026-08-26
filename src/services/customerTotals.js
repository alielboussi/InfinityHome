import db from '../dataClient';
import { fetchCanonicalFinancials, aggregateCustomerTotals } from '../utils/financials';
import { mergeStartingDueIntoCustomerTotals } from '../utils/startingDueBalance';

export async function fetchCustomerTotals(customerIds) {
  const ids = Array.isArray(customerIds) ? customerIds.filter(Boolean) : [];
  if (!ids.length) return { data: {} };
  try {
    const resp = await fetch('/api/customer-totals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerIds: ids }),
    });
    const text = await resp.text().catch(() => '');
    let json = {};
    if (text) { try { json = JSON.parse(text); } catch { json = { raw: text }; } }
    if (resp.ok && json?.ok) return { data: json.totals || {} };

    const status = resp.status || 0;
    const canFallback = status === 405 || status === 404 || status === 401 || status === 403 || status === 0;
    if (!canFallback) return { error: new Error(json?.error || json?.raw || `Failed to fetch customer totals (${status})`) };
  } catch (e) {
    // Continue to fallback
  }

  try {
    const { data: salesRows, error: salesErr } = await db
      .from('sales')
      .select('id, customer_id, currency, total_amount, discount')
      .in('customer_id', ids);
    if (salesErr) return { error: salesErr };

    const { data: customerRows, error: customerErr } = await db
      .from('customers')
      .select('id, currency, starting_due_balance')
      .in('id', ids);
    if (customerErr) return { error: customerErr };

    const saleIds = (salesRows || []).map(s => s.id).filter(v => v != null);
    if (!saleIds.length) {
      return { data: mergeStartingDueIntoCustomerTotals({}, customerRows || []) };
    }

    const finMap = await fetchCanonicalFinancials(db, saleIds);
    const { data: payRows, error: payErr } = await db
      .from('sales_payments')
      .select('sale_id, amount, discount_amount, currency')
      .in('sale_id', saleIds);
    if (payErr) return { error: payErr };

    return {
      data: mergeStartingDueIntoCustomerTotals(
        aggregateCustomerTotals(salesRows || [], finMap, payRows || []),
        customerRows || [],
      ),
    };
  } catch (err) {
    return { error: err };
  }
}
