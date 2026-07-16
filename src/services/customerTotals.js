import supabase from '../supabase';

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
    const { data: salesRows, error: salesErr } = await supabase
      .from('sales')
      .select('id, customer_id, currency')
      .in('customer_id', ids);
    if (salesErr) return { error: salesErr };
    const saleIds = (salesRows || []).map(s => s.id).filter(v => v != null);
    if (!saleIds.length) return { data: {} };

    const { data: totalsRows, error: totalsErr } = await supabase
      .from('v_sales_pdf_totals')
      .select('sale_id, currency, subtotal_before_discount, discount_amount, total_due, paid_amount, outstanding_amount')
      .in('sale_id', saleIds);
    if (totalsErr) return { error: totalsErr };
    const saleMetaById = new Map();
    (salesRows || []).forEach(s => {
      saleMetaById.set(String(s.id), {
        currency: s.currency || null,
        total_amount: Number(s.total_amount || 0),
        sale_discount: Number(s.discount || 0),
        customer_id: s.customer_id || null,
      });
    });
    (totalsRows || []).forEach(r => {
      const key = String(r.sale_id);
      const prev = saleMetaById.get(key) || {};
      saleMetaById.set(key, {
        ...prev,
        currency: r.currency || prev.currency || null,
        subtotal_before_discount: Number(r.subtotal_before_discount || 0),
        sale_discount: Number(r.discount_amount || prev.sale_discount || 0),
        total_due: Number(r.total_due || 0),
      });
    });

    const { data: payRows, error: payErr } = await supabase
      .from('sales_payments')
      .select('sale_id, amount, discount_amount, currency')
      .in('sale_id', saleIds);
    if (payErr) return { error: payErr };
    const paymentsByCustomerCurrency = new Map();
    (payRows || []).forEach(p => {
      const saleMeta = saleMetaById.get(String(p.sale_id)) || {};
      const custId = saleMeta.customer_id || null;
      if (!custId) return;
      const currencyRaw = p.currency || saleMeta.currency || 'K';
      const code = (currencyRaw === '$' || currencyRaw === 'USD') ? 'USD' : 'K';
      const key = `${custId}|${code}`;
      const prev = paymentsByCustomerCurrency.get(key) || { paid: 0, discount: 0 };
      prev.paid += Number(p.amount || 0);
      prev.discount += Number(p.discount_amount || 0);
      paymentsByCustomerCurrency.set(key, prev);
    });

    const totals = {};
    (salesRows || []).forEach(s => {
      const custId = String(s.customer_id || '');
      if (!custId) return;
      const fin = saleMetaById.get(String(s.id)) || {};
      const currencyRaw = fin.currency || s.currency || 'K';
      const code = (currencyRaw === '$' || currencyRaw === 'USD') ? 'USD' : 'K';
      if (!totals[custId]) totals[custId] = {};
      if (!totals[custId][code]) {
        totals[custId][code] = { total: 0, paid: 0, discount: 0, outstanding: 0, _saleDiscount: 0 };
      }
      const subtotal = Number(fin.subtotal_before_discount || 0);
      const saleDiscount = Number(fin.sale_discount || 0);
      const netTotal = subtotal > 0 ? subtotal : Math.max(0, Number(fin.total_amount || 0) + saleDiscount);
      totals[custId][code].total += netTotal;
      totals[custId][code]._saleDiscount += saleDiscount;
    });

    Object.keys(totals).forEach(custId => {
      Object.keys(totals[custId]).forEach(code => {
        const agg = totals[custId][code];
        const payKey = `${custId}|${code}`;
        const payAgg = paymentsByCustomerCurrency.get(payKey) || { paid: 0, discount: 0 };
        const saleDiscount = Number(agg._saleDiscount || 0);
        const paid = Number(payAgg.paid || 0);
        const payDiscount = Number(payAgg.discount || 0);
        const totalDiscount = saleDiscount + payDiscount;
        const outstanding = Math.max(0, Number(agg.total || 0) - saleDiscount - paid - payDiscount);
        totals[custId][code] = {
          total: Number(agg.total || 0),
          paid,
          discount: totalDiscount,
          outstanding,
        };
      });
    });

    return { data: totals };
  } catch (err) {
    return { error: err };
  }
}
