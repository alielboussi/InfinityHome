// Canonical financials fetcher: prefer PDF-aligned view, fallback gracefully
// Returns a Map keyed by String(sale_id) -> { sale_id, total_due, paid_amount, outstanding_amount, subtotal_before_discount?, discount_amount? }
import { fromPublic } from '../dbSchema';

export async function fetchCanonicalFinancials(supabase, saleIds) {
  const out = new Map();
  const ids = Array.from(new Set((saleIds || []).filter(v => v !== undefined && v !== null)));
  if (!ids.length) return out;

  // Helper to safely run a select and ignore 400 errors for missing views/columns
  async function trySelect(view, columns) {
    try {
      const { data, error } = await fromPublic(view)
        .select(columns)
        .in('sale_id', ids);
      if (error) return { ok: false, data: [] };
      return { ok: true, data: data || [] };
    } catch {
      return { ok: false, data: [] };
    }
  }

  // 1) Try PDF-aligned canonical view first (if present)
  let rows = [];
  let res = await trySelect('v_sales_pdf_totals', 'sale_id,total_due,paid_amount,outstanding_amount,subtotal_before_discount,discount_amount');
  if (res.ok) rows = res.data;

  // 2) Fallback to existing financials view
  if (!rows.length) {
    res = await trySelect('v_sales_financials', 'sale_id,total_due,paid_amount,outstanding_amount,subtotal_before_discount,discount_amount');
    if (res.ok) rows = res.data;
  }

  // Seed map from any rows we have
  (rows || []).forEach(r => {
    const key = String(r.sale_id);
    out.set(key, {
      sale_id: r.sale_id,
      total_due: Number(r.total_due || 0),
      paid_amount: Number(r.paid_amount || 0),
      outstanding_amount: Number(r.outstanding_amount ?? Math.max(0, Number(r.total_due || 0) - Number(r.paid_amount || 0))),
      subtotal_before_discount: r.subtotal_before_discount,
      discount_amount: r.discount_amount,
    });
  });

  // 3) If still missing some, fill minimally from sales.total_amount to avoid breaking UI
  const missing = ids.filter(id => !out.has(String(id)));
  if (missing.length) {
    try {
      const { data } = await supabase
        .schema('public')
        .from('sales')
        .select('id,total_amount')
        .in('id', missing);
      (data || []).forEach(s => {
        const key = String(s.id);
        const total = Number(s.total_amount || 0);
        if (!out.has(key)) out.set(key, { sale_id: s.id, total_due: total, paid_amount: 0, outstanding_amount: total });
      });
    } catch {}
  }

  return out;
}

// Convenience for a single sale_id
export async function fetchCanonicalFinancialForSale(supabase, saleId) {
  const map = await fetchCanonicalFinancials(supabase, [saleId]);
  return map.get(String(saleId)) || { sale_id: saleId, total_due: 0, paid_amount: 0, outstanding_amount: 0 };
}

// Compute a customer's overall outstanding using pooled NON-CREDIT payments across their sales,
// allocating chronologically (oldest sales first). Matches AllSales/PDF philosophy.
export async function computeCustomerOutstandingCanonical(supabase, customerId, currencyFilter) {
  if (!customerId) return 0;
  // 1) Fetch all sales for the customer
  const { data: salesRows } = await supabase
    .schema('public')
    .from('sales')
    .select('id, sale_date, created_at, currency')
    .eq('customer_id', customerId);
  const sales = Array.isArray(salesRows) ? salesRows : [];
  if (!sales.length) return 0;
  // Apply optional currency filter (match USD/$ vs K)
  const curCode = (currencyFilter || '').toString().trim();
  const salesFiltered = curCode
    ? sales.filter(s => {
        const raw = (s.currency || '').toString().trim();
        const norm = (raw === '$' || raw.toUpperCase() === 'USD') ? 'USD' : (raw.toUpperCase() === 'K' ? 'K' : raw.toUpperCase());
        const want = (curCode === '$' || curCode.toUpperCase() === 'USD') ? 'USD' : (curCode.toUpperCase() === 'K' ? 'K' : curCode.toUpperCase());
        return norm === want;
      })
    : sales;
  const saleIds = salesFiltered.map(s => s.id).filter(v => v != null);

  // 2) Fetch canonical totals per sale
  const finMap = await fetchCanonicalFinancials(supabase, saleIds);

  // 3) Fetch and dedupe payments for these sales; exclude 'credit'
  const { data: payRows } = await fromPublic('sales_payments')
    .select('sale_id, amount, payment_type, payment_date, reference, notes')
    .in('sale_id', saleIds);
  const payments = Array.isArray(payRows) ? payRows : [];
  const seen = new Set();
  const nonCredit = [];
  payments.forEach(p => {
    const type = String(p.payment_type || '').toLowerCase();
    const key = `${p.sale_id}|${p.payment_date || ''}|${Number(p.amount || 0)}|${String(p.reference || '')}|${String(p.notes || '')}|${type}`;
    if (seen.has(key)) return; seen.add(key);
    // Include credit in allocation (advance payments reduce due)
    nonCredit.push({
      sale_id: p.sale_id,
      amount: Number(p.amount || 0) || 0,
      ts: (() => { try { return new Date(p.payment_date || 0).getTime() || 0; } catch { return 0; } })(),
    });
  });

  // 4) Allocate pooled payments chronologically across sales (oldest first)
  const normalizeYYYYMMDD = (raw) => {
    const str = String(raw || '');
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    try {
      const dt = new Date(str); if (isNaN(dt.getTime())) return '';
      const y = dt.getFullYear(); const mo = String(dt.getMonth() + 1).padStart(2, '0'); const da = String(dt.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    } catch { return ''; }
  };
  const salesSorted = salesFiltered
    .map(s => ({ id: s.id, dateKey: normalizeYYYYMMDD(s.sale_date || s.created_at || '') }))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
  let pool = nonCredit.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  let outstanding = 0;
  salesSorted.forEach(s => {
    const fin = finMap.get(String(s.id));
    const total = Number(fin?.total_due || 0);
    const applied = Math.min(pool, total);
    pool -= applied;
    const remain = Math.max(0, total - applied);
    outstanding += remain;
  });
  return Math.max(0, outstanding);
}

// Exact PDF-aligned "Due Remaining" computation used in laybyPdf.js settlement:
// - Include ALL sales for the customer (no currency filter)
// - For each sale, compute Total = max(0, Net - Discount)
//   Net prefers visible item line totals (sum of unit_price * quantity) if any exist for the sale;
//   otherwise falls back to view-provided subtotal_before_discount from canonical views.
// - Discount uses view-provided discount_amount, capped not to exceed Net.
// - Sum all sale Totals across the customer (equivalent to the "cumulative due" across date sections)
// - Subtract all non-credit payments, after deduping identical rows.
// - Credits are advances and intentionally NOT subtracted here, exactly like the PDF.
export async function computeCustomerDueRemainingLikePdf(supabase, customerId) {
  if (!customerId) return 0;
  try {
    // 1) Fetch all sales for this customer
    const { data: salesRows } = await supabase
      .schema('public')
      .from('sales')
      .select('id, sale_date, created_at')
      .eq('customer_id', customerId);
    const sales = Array.isArray(salesRows) ? salesRows : [];
    if (!sales.length) return 0;
    const saleIds = sales.map(s => s.id).filter(v => v != null);

    // 2) Fetch canonical financials (PDF-aligned views)
    const finMap = await fetchCanonicalFinancials(supabase, saleIds);

    // 3) Fetch sale items and compute per-sale visible Net from items
    const { data: itemRows } = await fromPublic('sales_items')
      .select('sale_id, quantity, unit_price')
      .in('sale_id', saleIds);
    const items = Array.isArray(itemRows) ? itemRows : [];
    const netBySaleFromItems = new Map();
    items.forEach(r => {
      const sid = r.sale_id;
      const amt = (Number(r.unit_price || 0) * Number(r.quantity || 0)) || 0;
      netBySaleFromItems.set(sid, (netBySaleFromItems.get(sid) || 0) + amt);
    });

    // 4) Compute Total per sale using the same preference as PDF tables
    let sumTotals = 0;
    saleIds.forEach(id => {
      const fin = finMap.get(String(id)) || {};
      const netFromItems = Number(netBySaleFromItems.get(id) || 0);
      const viewNet = Number(fin.subtotal_before_discount || 0);
      const net = netFromItems > 0 ? netFromItems : viewNet;
      const viewDiscount = Number(fin.discount_amount || 0);
      const discount = Math.min(viewDiscount, net);
      const totalAfterDiscount = Math.max(0, net - discount);
      sumTotals += totalAfterDiscount;
    });

    // 5) Fetch and sum all NON-CREDIT payments (deduped, like the PDF)
    const { data: payRows } = await fromPublic('sales_payments')
      .select('sale_id, amount, payment_type, payment_date, reference, notes')
      .in('sale_id', saleIds)
      .order('payment_date', { ascending: true });
    const payments = Array.isArray(payRows) ? payRows : [];
    const seen = new Set();
    let nonCreditPaid = 0;
    payments.forEach(p => {
      const type = String(p.payment_type || '').toLowerCase();
      const key = `${p.sale_id}|${p.payment_date || ''}|${Number(p.amount || 0)}|${String(p.reference || '')}|${String(p.notes || '')}|${type}`;
      if (seen.has(key)) return; seen.add(key);
      if (type === 'credit') return; // do not subtract credits in settlement
      const amt = Number(p.amount || 0);
      if (!isNaN(amt) && amt > 0) nonCreditPaid += amt;
    });

    // 6) Final due remaining
    const dueRemaining = Math.max(0, Number(sumTotals || 0) - Number(nonCreditPaid || 0));
    return dueRemaining;
  } catch {
    return 0;
  }
}

// LaybyManagement-aligned outstanding for a customer.
// Mirrors the aggregation used on LaybyManagement.js (section 3a):
// - Collect all sales for the customer AND sales linked via the customer's laybys (by layby_id)
// - Compute items-first Net with row-dedup (product_id/display_name/unit_price/quantity/color)
// - Fall back to view-provided subtotal_before_discount when items net is zero
// - Group by sale date (YYYY-MM-DD), clamp discount per date group to the group's Net
// - Sum totals across all dates, then subtract ALL payments (any payment_type) after deduplication
// Returns a single number: outstanding
export async function computeCustomerOutstandingLikeLaybyPage(supabase, customerId) {
  if (!customerId) return 0;
  try {
    // 1) Gather all laybys for the customer to get layby_ids
    const { data: laybys } = await fromPublic('laybys')
      .select('id')
      .eq('customer_id', customerId);
    const laybyIds = Array.from(new Set((laybys || []).map(r => r.id).filter(v => v != null))).map(v => String(v));

    // 2) Gather all sales for customer_id
    const { data: salesByCustomer } = await supabase
      .schema('public')
      .from('sales')
      .select('id, customer_id, sale_date, created_at')
      .eq('customer_id', customerId);
    const saleIdSet = new Set((salesByCustomer || []).map(s => s.id).filter(v => v != null));

    // 3) Also gather sales by layby_id (for laybys belonging to this customer)
    if (laybyIds.length) {
      const { data: salesByLayby } = await supabase
        .schema('public')
        .from('sales')
        .select('id, layby_id')
        .in('layby_id', laybyIds);
      (salesByLayby || []).forEach(s => { if (s?.id != null) saleIdSet.add(s.id); });
    }
    const saleIds = Array.from(saleIdSet);
    if (!saleIds.length) return 0;

    // 4) Canonical financials for fallback fields (subtotal_before_discount, discount_amount)
    const finMap = await fetchCanonicalFinancials(supabase, saleIds);

    // 5) Items for items-first Net and row-dedup
    const numericIds = saleIds.filter(v => !isNaN(Number(v))).map(v => Number(v));
    const items = numericIds.length
      ? (await fromPublic('sales_items').select('sale_id, product_id, display_name, quantity, unit_price, color').in('sale_id', numericIds)).data || []
      : [];
    const itemsBySale = new Map();
    (items || []).forEach(r => {
      const k = String(r.sale_id);
      const arr = itemsBySale.get(k) || [];
      arr.push(r);
      itemsBySale.set(k, arr);
    });

    // 6) Sale info for date grouping
    const { data: saleRows2 } = await supabase
      .schema('public')
      .from('sales')
      .select('id, sale_date, created_at')
      .in('id', saleIds);
    const dateKeyOf = (raw) => {
      const str = String(raw || '');
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      try {
        const dt = new Date(str);
        if (isNaN(dt.getTime())) return '';
        const y = dt.getFullYear();
        const mo = String(dt.getMonth() + 1).padStart(2, '0');
        const da = String(dt.getDate()).padStart(2, '0');
        return `${y}-${mo}-${da}`;
      } catch { return ''; }
    };
    const byDate = new Map(); // dateKey -> saleIds[]
    (saleRows2 || []).forEach(s => {
      const dk = dateKeyOf(s.sale_date || s.created_at || '');
      const arr = byDate.get(dk) || [];
      arr.push(String(s.id));
      byDate.set(dk, arr);
    });

    // 7) Deduped payments (ALL payment types)
    const { data: payRows } = await fromPublic('sales_payments')
      .select('sale_id, amount, payment_type, payment_date, reference, notes')
      .in('sale_id', saleIds);
    const seenPay = new Set();
    const paidBySale = new Map();
    (payRows || []).forEach(p => {
      const key = `${p.sale_id}|${p.payment_date || ''}|${Number(p.amount || 0)}|${String(p.reference || '')}|${String(p.notes || '')}|${String(p.payment_type || '').toLowerCase()}`;
      if (seenPay.has(key)) return; seenPay.add(key);
      const k = String(p.sale_id);
      const prev = Number(paidBySale.get(k) || 0);
      paidBySale.set(k, prev + Number(p.amount || 0));
    });

    // 8) Compute total across date groups
    let total = 0;
    byDate.forEach((idsForDate) => {
      // Items-first Net with row-dedup per LaybyManagement
      const itemsNet = idsForDate.reduce((a, sid) => {
        const rows = itemsBySale.get(String(sid)) || [];
        const seen = new Set();
        let sum = 0;
        rows.forEach(it => {
          const key = `${sid}|${String(it.product_id || '')}|${String(it.display_name || '')}|${Number(it.unit_price || 0)}|${Number(it.quantity || 0)}|${String(it.color || '')}`;
          if (seen.has(key)) return; seen.add(key);
          sum += Number(it.unit_price || 0) * Number(it.quantity || 0);
        });
        return a + sum;
      }, 0);
      const viewNet = idsForDate.reduce((a, sid) => a + Number((finMap.get(String(sid)) || {}).subtotal_before_discount || 0), 0);
      const disc = idsForDate.reduce((a, sid) => a + Number((finMap.get(String(sid)) || {}).discount_amount || 0), 0);
      const net = itemsNet > 0 ? itemsNet : viewNet;
      const effDisc = Math.min(Math.max(0, disc), net);
      total += Math.max(0, net - effDisc);
    });

    // 9) Sum all payments across all saleIds
    let paid = 0;
    saleIds.forEach(id => { paid += Number(paidBySale.get(String(id)) || 0); });
    const outstanding = Math.max(0, total - paid);
    return outstanding;
  } catch {
    return 0;
  }
}
