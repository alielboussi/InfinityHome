import supabase from '../supabase';
import { fetchCanonicalFinancials } from '../utils/financials';

export async function fetchCustomerStatement(customerId) {
  if (!customerId) return { error: new Error('customerId is required') };
  try {
    const resp = await fetch('/api/customer-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId }),
    });
    const text = await resp.text().catch(() => '');
    let json = {};
    if (text) { try { json = JSON.parse(text); } catch { json = { raw: text }; } }
    if (resp.ok && json?.ok) return { data: json };

    const status = resp.status || 0;
    const canFallback = status === 405 || status === 404 || status === 401 || status === 403 || status === 0;
    if (!canFallback) return { error: new Error(json?.error || json?.raw || `Failed to fetch customer statement (${status})`) };
  } catch (e) {
    // Continue to fallback
  }

  try {
    const { data: salesRows, error: salesErr } = await supabase
      .from('sales')
      .select('id, sale_date, currency')
      .eq('customer_id', customerId);
    if (salesErr) return { error: salesErr };
    const saleIds = (salesRows || []).map(s => s.id).filter(v => v != null);
    if (!saleIds.length) return { data: { sales: [], items: [], payments: [] } };

    const finMap = await fetchCanonicalFinancials(supabase, saleIds);
    const sales = (salesRows || []).map(s => {
      const fin = finMap.get(String(s.id)) || {};
      return {
        sale_id: s.id,
        sale_date: s.sale_date,
        currency: s.currency || fin.currency || null,
        total_due: Number(fin.total_due || 0),
        paid_amount: Number(fin.paid_amount || 0),
        outstanding_amount: Number(fin.outstanding_amount || Math.max(0, Number(fin.total_due || 0) - Number(fin.paid_amount || 0))),
        subtotal_before_discount: Number(fin.subtotal_before_discount || 0),
        discount_amount: Number(fin.discount_amount || 0),
      };
    });

    const { data: items, error: itemsErr } = await supabase
      .from('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .in('sale_id', saleIds);
    if (itemsErr) return { error: itemsErr };

    const { data: payments, error: payErr } = await supabase
      .from('sales_payments')
      .select('sale_id, amount, discount_amount, payment_type, payment_date, reference, currency, notes, allocation_batch_uuid')
      .in('sale_id', saleIds)
      .order('payment_date', { ascending: true });
    if (payErr) return { error: payErr };

    return { data: { sales, items: items || [], payments: payments || [] } };
  } catch (err) {
    return { error: err };
  }
}