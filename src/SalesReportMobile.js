/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import db from './dataClient';
import { fromPublic } from './dbSchema';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { fetchLedgerBalances } from './services/ledger';

// Normalize currency variants to buckets used across the app
function normalizeCurrency(cur) {
  const c = (cur || '').toString().trim().toUpperCase();
  if (!c) return 'K';
  if (['USD', 'US$', 'US DOLLAR', 'DOLLAR', '$'].includes(c)) return 'USD';
  if (['ZMW', 'K', 'KWACHA', 'ZAMBIAN KWACHA'].includes(c)) return 'K';
  return c; // fallback to raw
}

const PAYMENT_TYPES = [
  'All',
  'Cash',
  'Bank Transfer',
  'Mobile Money',
  'Cheque',
  'Visa card',
  'Goods',
];

// Hide specific internal/utility locations from selection on mobile report
const EXCLUDED_LOCATION_IDS = new Set([
  '39ffaa82-8aee-4a33-8de8-06584cbaffcf',
]);

// Display helper: convert snake_case / lowercase payment types to Title Case
function titleCasePaymentType(s) {
  const raw = (s || '').toString().trim();
  if (!raw) return 'Unknown';
  return raw
    .replace(/[_-]+/g, ' ') // snake_case to spaces
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function toStartOfDayISO(dateStr) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T00:00:00.000`).toISOString();
}
function toEndOfDayISO(dateStr) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

export default function SalesReportMobile() {
  // Removed root scroll locking; Android native pull-to-refresh disabled in app wrapper.
  const containerRef = React.useRef(null);
  const today = React.useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }, []);

  // Filters
  const [dateFrom, setDateFrom] = React.useState(today);
  const [dateTo, setDateTo] = React.useState(today);
  const [paymentType, setPaymentType] = React.useState('All');
  const [currencyFilter, setCurrencyFilter] = React.useState('All'); // All, K, USD
  const [locationId, setLocationId] = React.useState('');
  const [locations, setLocations] = React.useState([]);
  const [search, setSearch] = React.useState(''); // customer or receipt search

  // Data
  const [payments, setPayments] = React.useState([]); // sales_payments with sale + customer merged
  const [quotesConverted, setQuotesConverted] = React.useState([]); // quotations with status converted
  const [quotesPending, setQuotesPending] = React.useState([]); // quotations not yet converted
  const [quoteStatusFilter, setQuoteStatusFilter] = React.useState('converted'); // converted | pending | all
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [pdfUrl, setPdfUrl] = React.useState('');
  const [pdfDialogOpen, setPdfDialogOpen] = React.useState(false);
  // Separate toggles for discounts sections (UI shows buttons: Showroom / Factory)
  const [showShowroomDiscounts, setShowroomDiscounts] = React.useState(false);
  const [showFactoryDiscounts, setFactoryDiscounts] = React.useState(false);
  const [salesForDiscounts, setSalesForDiscounts] = React.useState([]); // sales rows for showroom discount sums
  // Map sale_id => 'quote' | 'pos' for layby-origin separation
  const [laybyOriginMap, setLaybyOriginMap] = React.useState({});
  // Search helpers
  const [searchResults, setSearchResults] = React.useState([]);
  const [itemsModal, setItemsModal] = React.useState({ open: false, title: '', saleId: null, items: [], loading: false, error: '' });
  const [ledgerBalances, setLedgerBalances] = React.useState({});

  // Let the WebView drive scroll physics naturally; custom touch nudges caused a "tap first" lag on some devices.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Ensure the scroll container is focusable so Android immediately routes gestures to it.
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    return () => {
      if (el.getAttribute('tabindex') === '-1') el.removeAttribute('tabindex');
    };
  }, []);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Preload locations for filter dropdown (once)
      if (!locations.length) {
        try {
          // Query only columns that exist on public.locations across environments
          // Selecting non-existent columns (e.g., location_name) causes a projection error and empty list
          let req = fromPublic('locations').select('id, name');
          req = req.order('name', { ascending: true, nullsFirst: true });
          const { data: locs, error: locErr } = await req;
          if (locErr) throw locErr;
          const filtered = (locs || []).filter(l => !EXCLUDED_LOCATION_IDS.has(String(l.id)));
          setLocations(filtered);
          // If currently selected is excluded, clear selection
          if (EXCLUDED_LOCATION_IDS.has(String(locationId))) setLocationId('');
        } catch (e) {
          console.warn('Failed to load locations for SalesReportMobile:', e?.message || e);
          setLocations([]);
        }
      }
      // 1) Fetch payments within date range and by type
      let q = db
        .from('sales_payments')
        .select('id, sale_id, amount, currency, payment_type, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);
      const gte = toStartOfDayISO(dateFrom);
      const lte = toEndOfDayISO(dateTo);
      if (gte) q = q.gte('created_at', gte);
      if (lte) q = q.lte('created_at', lte);
      if (paymentType && paymentType !== 'All') q = q.eq('payment_type', paymentType);
      const { data: payRows, error: payErr } = await q;
      if (payErr) throw payErr;
      const rows = payRows || [];
      // Fetch related sales and customers in one go
      const saleIds = Array.from(new Set(rows.map(r => r.sale_id).filter(Boolean)));
      let salesMap = {};
      let custMap = {};
      if (saleIds.length) {
        const { data: sales } = await fromPublic('sales')
          .select('id, sale_date, receipt_number, status, customer_id, currency, location_id')
          .in('id', saleIds);
        (sales || []).forEach(s => { salesMap[String(s.id)] = s; });
        const custIds = Array.from(new Set((sales || []).map(s => s.customer_id).filter(Boolean)));
        if (custIds.length) {
          const { data: customers } = await db
            .from('customers')
            .select('id, name')
            .in('id', custIds);
          (customers || []).forEach(c => { custMap[String(c.id)] = c; });
        }
      }
      const merged = rows.map(p => {
        const sale = salesMap[String(p.sale_id)] || {};
        const cust = custMap[String(sale.customer_id)] || {};
        return {
          ...p,
          sale,
          customer: cust,
        };
      });
      setPayments(merged);

      // Build layby-origin map for these sales: fetch laybys linked by sale_id
      try {
        const saleIdsForLayby = Array.from(new Set((merged || []).map(p => p.sale_id).filter(Boolean)));
        let originMap = {};
        if (saleIdsForLayby.length) {
          const { data: laybyRows } = await db
            .from('laybys')
            .select('id, sale_id, notes, origin')
            .in('sale_id', saleIdsForLayby);
          const bySale = new Map();
          const laybyIds = [];
          (laybyRows || []).forEach(l => {
            bySale.set(String(l.sale_id), l);
            if (l?.id != null) laybyIds.push(l.id);
          });
          // Find which laybys are referenced by converted quotations
          let convertedLaybyIds = new Set();
          if (laybyIds.length) {
            const { data: qlinks } = await db
              .from('quotations')
              .select('layby_id, status')
              .eq('status', 'converted')
              .in('layby_id', laybyIds);
            (qlinks || []).forEach(q => {
              if (q?.layby_id != null) convertedLaybyIds.add(String(q.layby_id));
            });
          }
          // Compose origin map with fallback to notes marker
          saleIdsForLayby.forEach(sid => {
            const l = bySale.get(String(sid));
            if (!l) return;
            const nid = String(l.id);
            const originCol = (l.origin || '').toLowerCase();
            const hasNote = typeof l.notes === 'string' && l.notes.toLowerCase().includes('origin=quote');
            originMap[String(sid)] = (originCol === 'quote' || convertedLaybyIds.has(nid) || hasNote) ? 'quote' : 'pos';
          });
        }
        setLaybyOriginMap(originMap);
      } catch (e) {
        // Non-fatal: origin separation unavailable
        setLaybyOriginMap({});
      }

      // 2) Fetch only converted quotes within range
      let q2 = db
        .from('quotations')
        .select('id, total, currency, status, discount, created_at')
        .eq('status', 'converted')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (gte) q2 = q2.gte('created_at', gte);
      if (lte) q2 = q2.lte('created_at', lte);
      const { data: quotes, error: qErr } = await q2;
      if (qErr) throw qErr;
      setQuotesConverted(quotes || []);

      // 2b) Fetch pending (not converted) quotes within range
      let qPending = db
        .from('quotations')
        .select('id, total, currency, status, discount, created_at')
        .or('status.eq.pending,status.is.null,sale_id.is.null')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (gte) qPending = qPending.gte('created_at', gte);
      if (lte) qPending = qPending.lte('created_at', lte);
      const { data: pendRows, error: pendErr } = await qPending;
      if (pendErr) throw pendErr;
      setQuotesPending(pendRows || []);

      // 3) Fetch sales for showroom discounts (date range by sale_date)
      let q3 = fromPublic('sales')
        .select('id, sale_date, receipt_number, status, currency, total_amount, discount, location_id')
        .order('sale_date', { ascending: false })
        .limit(4000);
      if (dateFrom) q3 = q3.gte('sale_date', dateFrom);
      if (dateTo) q3 = q3.lte('sale_date', dateTo);
      const { data: srows, error: sErr } = await q3;
      if (sErr) throw sErr;
      setSalesForDiscounts(srows || []);

      // 4) Fetch ledger balances (overall snapshot)
      try {
        const { data: ledgerData, error: ledgerErr } = await fetchLedgerBalances();
        if (ledgerErr) throw ledgerErr;
        setLedgerBalances(ledgerData || {});
      } catch (e) {
        // Non-fatal: ledger balances unavailable
        setLedgerBalances({});
      }
    } catch (e) {
      console.error('Failed to load report data:', e);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, paymentType]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // On-demand server search across POS sales, Laybys and Quotations
  React.useEffect(() => {
    const term = (search || '').trim();
    if (term.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    const run = async () => {
      try {
  // start search
        const t = term;
        const num = Number.parseInt(t, 10);
        const isNum = !Number.isNaN(num);

        const salesQ = fromPublic('sales')
          .select('id, receipt_number, sale_date, currency, total_amount, customer:customers!inner(id, name)')
          .ilike('receipt_number', `%${t}%`)
          .order('sale_date', { ascending: false })
          .limit(5);

        const quotesQ = db
          .from('quotations')
          .select('id, quote_number, total, currency, created_at, status')
          .or(`quote_number.ilike.%${t}%,id.eq.${isNum ? num : -1}`)
          .order('created_at', { ascending: false })
          .limit(5);

        const laybyQ = db
          .from('laybys')
          .select('id, sale_id, created_at')
          .or(`id.eq.${isNum ? num : -1},sale_id.eq.${isNum ? num : -1}`)
          .order('created_at', { ascending: false })
          .limit(5);

        const [{ data: salesRes }, { data: quotesRes }, { data: laybyRes }] = await Promise.all([salesQ, quotesQ, laybyQ]);

        if (cancelled) return;
        const out = [];
        (salesRes || []).forEach(s => {
          out.push({
            type: 'Sale',
            saleId: s.id,
            label: `${s.receipt_number || s.id} • ${s.customer?.name || '-'}`,
            sub: `${normalizeCurrency(s.currency || 'K')} ${Number(s.total_amount||0).toLocaleString()} • ${new Date(s.sale_date || s.created_at || Date.now()).toLocaleDateString()}`
          });
        });
        (quotesRes || []).forEach(q => {
          out.push({
            type: 'Quotation',
            label: q.quote_number ? `Quote ${q.quote_number}` : `Quote #${q.id}`,
            sub: `${normalizeCurrency(q.currency || 'K')} ${Number(q.total||0).toLocaleString()} • ${new Date(q.created_at).toLocaleDateString()}`
          });
        });
        (laybyRes || []).forEach(l => {
          out.push({
            type: 'Layby',
            label: `Layby #${l.id}${l.sale_id ? ` • Sale ${l.sale_id}` : ''}`,
            sub: `${new Date(l.created_at).toLocaleDateString()}`
          });
        });
        setSearchResults(out.slice(0, 5));
      } catch (e) {
        if (!cancelled) setSearchResults([]);
      } finally {
  // end search
      }
    };
    const h = setTimeout(run, 250);
    return () => { cancelled = true; clearTimeout(h); };
  }, [search]);

  // Removed aggressive touch handlers to restore natural scroll (native pull-to-refresh already disabled in Android app wrapper)

  // Derived aggregates
  const filteredQuotes = React.useMemo(() => {
    if (quoteStatusFilter === 'converted') return quotesConverted;
    if (quoteStatusFilter === 'pending') return quotesPending;
    return [...quotesConverted, ...quotesPending];
  }, [quoteStatusFilter, quotesConverted, quotesPending]);

  const filtered = React.useMemo(() => {
    const s = (search || '').trim().toLowerCase();
    let arr = payments;
    // Filter by location if selected
    if (locationId) {
      arr = arr.filter(p => String(p?.sale?.location_id || '') === String(locationId));
    }
    // Filter by currency if selected
    if (currencyFilter && currencyFilter !== 'All') {
      arr = arr.filter(p => normalizeCurrency(p.currency || p.sale?.currency || 'K') === currencyFilter);
    }
    if (!s) return arr;
    return arr.filter(p => {
      const cust = (p.customer?.name || '').toLowerCase();
      const receipt = (p.sale?.receipt_number || String(p.sale_id || '')).toLowerCase();
      return cust.includes(s) || receipt.includes(s);
    });
  }, [payments, search, locationId, currencyFilter]);

  const totalsByCurrency = React.useMemo(() => {
    const out = {};
    for (const p of filtered) {
      const cur = normalizeCurrency(p.currency || p.sale?.currency || 'K');
      out[cur] = (out[cur] || 0) + Number(p.amount || 0);
    }
    return out;
  }, [filtered]);

  // Totals grouped by payment type and currency (to display currencies on totals)
  const totalsByTypeCurrency = React.useMemo(() => {
    const out = {};
    for (const p of filtered) {
      const t = p.payment_type || 'Unknown';
      const cur = normalizeCurrency(p.currency || p.sale?.currency || 'K');
      if (!out[t]) out[t] = {};
      out[t][cur] = (out[t][cur] || 0) + Number(p.amount || 0);
    }
    return out;
  }, [filtered]);

  // Totals for layby payments separated by origin (POS vs Converted from quotes)
  const laybyPosTotalsByCurrency = React.useMemo(() => {
    const out = {};
    for (const p of filtered) {
      const sid = String(p.sale_id || '');
      const origin = laybyOriginMap[sid];
      if (origin !== 'pos') continue;
      const cur = normalizeCurrency(p.currency || p.sale?.currency || 'K');
      out[cur] = (out[cur] || 0) + Number(p.amount || 0);
    }
    return out;
  }, [filtered, laybyOriginMap]);

  const laybyQuoteTotalsByCurrency = React.useMemo(() => {
    const out = {};
    for (const p of filtered) {
      const sid = String(p.sale_id || '');
      const origin = laybyOriginMap[sid];
      if (origin !== 'quote') continue;
      const cur = normalizeCurrency(p.currency || p.sale?.currency || 'K');
      out[cur] = (out[cur] || 0) + Number(p.amount || 0);
    }
    return out;
  }, [filtered, laybyOriginMap]);

  const quotesTotalsByCurrency = React.useMemo(() => {
    const out = {};
    for (const q of filteredQuotes) {
      const cur = normalizeCurrency(q.currency || 'K');
      if (currencyFilter === 'All' || cur === currencyFilter) {
        out[cur] = (out[cur] || 0) + Number(q.total || 0);
      }
    }
    return out;
  }, [filteredQuotes, currencyFilter]);

  const quotesDiscountsByCurrency = React.useMemo(() => {
    const out = {};
    for (const q of filteredQuotes) {
      const cur = normalizeCurrency(q.currency || 'K');
      if (currencyFilter === 'All' || cur === currencyFilter) {
        out[cur] = (out[cur] || 0) + Number(q.discount || 0);
      }
    }
    return out;
  }, [filteredQuotes, currencyFilter]);

  // Aggregates for showroom discounts (by currency, filtered by location and currency pills)
  const showroomDiscountsByCurrency = React.useMemo(() => {
    const out = {};
    (salesForDiscounts || []).forEach(s => {
      if (locationId && String(s.location_id || '') !== String(locationId)) return;
      const cur = normalizeCurrency(s.currency || 'K');
      if (currencyFilter !== 'All' && cur !== currencyFilter) return;
      out[cur] = (out[cur] || 0) + Number(s.discount || 0);
    });
    return out;
  }, [salesForDiscounts, locationId, currencyFilter]);

  // Export PDF: generate from filtered, upload to SalesReports bucket, then open URL
  const handleExportPDF = async () => {
    try {
      setLoading(true);
      const doc = new jsPDF('p', 'pt', 'a4');
      const margin = 36;
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = margin;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Sales Report (Mobile)', pageWidth / 2, y, { align: 'center' });
      y += 24;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
  const locName = locations.find(l => String(l.id) === String(locationId));
      const scope = [
        `Date: ${dateFrom || '-'} to ${dateTo || '-'}`,
        `Payment: ${paymentType || 'All'}`,
        `Currency: ${currencyFilter || 'All'}`,
        `Location: ${locName ? (locName.name || `#${locName.id}`) : 'All'}`,
      ];
      scope.forEach(line => { doc.text(line, margin, y); y += 14; });
      y += 6;

      // Table rows
      const tableHead = ['Date', 'Receipt', 'Customer', 'Type', 'Currency', 'Amount'];
      const tableBody = filtered.map(p => [
        p.created_at ? new Date(p.created_at).toLocaleString() : '-',
        p.sale?.receipt_number || p.sale_id,
        p.customer?.name || '-',
        p.payment_type || '-',
        normalizeCurrency(p.currency || p.sale?.currency || 'K'),
        Number(p.amount || 0).toLocaleString(),
      ]);
      doc.autoTable({
        head: [tableHead],
        body: tableBody,
        startY: y,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [0, 191, 255] },
        margin: { left: margin, right: margin },
        theme: 'grid',
      });
      // Totals summary page if needed
      const totalsStartY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : y + 16;
      doc.setFont('helvetica', 'bold');
      doc.text('Totals', margin, totalsStartY);
      doc.setFont('helvetica', 'normal');
      let ty = totalsStartY + 12;
      const entriesCur = Object.entries(totalsByCurrency);
      if (entriesCur.length) {
        entriesCur.forEach(([cur, amt]) => {
          doc.text(`${cur}: ${Number(amt || 0).toLocaleString()}`, margin, ty);
          ty += 12;
        });
      } else {
        doc.text('No payments found.', margin, ty); ty += 12;
      }

      // Create Blob and upload to Firebase Storage
      const blob = doc.output('blob');
      const ts = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
      const safeFrom = (dateFrom || 'start').replace(/\//g, '-');
      const safeTo = (dateTo || 'end').replace(/\//g, '-');
      const path = `mobile/sales-report_${safeFrom}_to_${safeTo}_${ts}.pdf`;
      const { error: upErr } = await db
        .storage
        .from('SalesReports')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw upErr;

      // Get public URL (fallback to signed URL if bucket not public)
      const pub = db.storage.from('SalesReports').getPublicUrl(path);
      let url = pub?.data?.publicUrl || '';
      if (!url) {
        const { data: signed } = await db
          .storage
          .from('SalesReports')
          .createSignedUrl(path, 60 * 60);
        url = signed?.signedUrl || '';
      }
      if (url) {
        // Hold URL and show choice dialog (open or download)
        setPdfUrl(url);
        setPdfDialogOpen(true);
      }
    } catch (e) {
      console.error('Failed to export PDF:', e);
      setError('Failed to export PDF.');
    } finally {
      setLoading(false);
    }
  };

  const chooseOpenPdf = () => {
    if (!pdfUrl) return setPdfDialogOpen(false);
    // On Android WebView, navigating to the PDF URL typically downloads or previews via system handler
    window.location.href = pdfUrl;
    setPdfDialogOpen(false);
  };
  const chooseDownloadPdf = () => {
    if (!pdfUrl) return setPdfDialogOpen(false);
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = pdfUrl.split('/').pop() || 'sales-report.pdf';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setPdfDialogOpen(false);
  };

  return (
  <div className="sr-mobile-container" ref={containerRef}>
      <div className="sr-mobile-filters">
        <div className="sr-section-title">Date</div>
        <div className="sr-date-row">
          <div className="date-field">
            <label>From</label>
            <div className="date-input">
              <span className="icon">📅</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
          </div>
          <div className="date-field">
            <label>To</label>
            <div className="date-input">
              <span className="icon">📅</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="sr-section-title">Location</div>
        <div className="full pill-grid-2">
          <button
            type="button"
            onClick={() => setLocationId('')}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid #00bfff', background: locationId===''?'#0d2633':'#181c20', color: '#e0f7fa' }}
          >All Locations</button>
          {(locations || []).map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLocationId(String(l.id))}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid #00bfff', background: String(locationId)===String(l.id)?'#0d2633':'#181c20', color: '#e0f7fa' }}
            >{l.name || `#${l.id}`}</button>
          ))}
        </div>
        <div className="sr-section-title">Payment Methods</div>
        {/* Payment type selection (2 columns x ~4 rows) */}
        <div className="full pill-grid-2">
          {PAYMENT_TYPES.map(pt => (
            <button
              key={pt}
              type="button"
              onClick={() => setPaymentType(pt)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid #00bfff', background: paymentType===pt?'#0d2633':'#181c20', color: '#e0f7fa' }}
            >{pt}</button>
          ))}
        </div>
        <div className="sr-section-title">Currency</div>
        {/* Currency selection (2 columns) */}
        <div className="full pill-grid-2">
          <button
            type="button"
            onClick={() => setCurrencyFilter('All')}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid #00bfff', background: currencyFilter==='All'?'#0d2633':'#181c20', color: '#e0f7fa' }}
          >All</button>
          <button
            type="button"
            onClick={() => setCurrencyFilter('K')}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid #00bfff', background: currencyFilter==='K'?'#0d2633':'#181c20', color: '#e0f7fa' }}
          >K</button>
          <button
            type="button"
            onClick={() => setCurrencyFilter('USD')}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid #00bfff', background: currencyFilter==='USD'?'#0d2633':'#181c20', color: '#e0f7fa' }}
          >USD</button>
        </div>
        <div className="full">
          <input
            type="text"
            placeholder="Search by customer or receipt..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Search results card */}
      {(() => {
        const s = (search || '').trim();
        if (!s) return null;
        // Prefer explicit search results if available, else fall back to quick local filter of payments/converted quotes
        const res = (searchResults && searchResults.length)
          ? searchResults
          : (() => {
              const s2 = s.toLowerCase();
              const r = [];
              for (const p of payments) {
                const cust = (p.customer?.name || '').toLowerCase();
                const receipt = (p.sale?.receipt_number || String(p.sale_id || '')).toLowerCase();
                if (cust.includes(s2) || receipt.includes(s2)) {
                  r.push({
                    type: 'Payment',
                    saleId: p.sale_id,
                    label: `${p.sale?.receipt_number || p.sale_id} • ${p.customer?.name || '-'}`,
                    sub: `${normalizeCurrency(p.currency || p.sale?.currency || 'K')} ${Number(p.amount||0).toLocaleString()} • ${new Date(p.created_at).toLocaleDateString()}`
                  });
                  if (r.length >= 5) break;
                }
              }
              if (r.length < 5) {
                for (const q of filteredQuotes) {
                  const idStr = String(q.id || '').toLowerCase();
                  if (idStr.includes(s2)) {
                    r.push({ type: 'Quotation', label: `Quote #${q.id}`, sub: `${normalizeCurrency(q.currency || 'K')} ${Number(q.total||0).toLocaleString()} • ${new Date(q.created_at).toLocaleDateString()}` });
                    if (r.length >= 5) break;
                  }
                }
              }
              return r;
            })();
        if (!res.length) return null;
        const handleClick = async (r) => {
          if (!r || !r.saleId) return;
          setItemsModal({ open: true, title: r.label || `Sale ${r.saleId}`, saleId: r.saleId, items: [], loading: true, error: '' });
          try {
            const { data: items, error } = await fromPublic('sales_items')
              .select('product_id, display_name, quantity, unit_price, currency')
              .eq('sale_id', r.saleId)
              .order('product_id', { ascending: true });
            if (error) throw error;
            setItemsModal(prev => ({ ...prev, items: items || [], loading: false }));
          } catch (e) {
            setItemsModal(prev => ({ ...prev, error: e?.message || 'Failed to load items', loading: false }));
          }
        };
        return (
          <div className="sr-search-results">
            {res.slice(0,5).map((r, i) => (
              <div key={i} className="item" onClick={() => handleClick(r)} style={{ cursor: r.saleId ? 'pointer' : 'default', opacity: r.saleId ? 1 : 0.9 }}>
                <div>
                  <div className="label">{r.label}</div>
                  <div className="sub">{r.sub}</div>
                </div>
                <div className="type">{r.type}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Summary */}
      <div className="sr-mobile-summary">
        <div className="sr-mobile-summary-title" style={{ marginTop: 8 }}>Quotes filter</div>
        <div className="pill-grid-3" style={{ gap: 8, marginBottom: 8 }}>
          {['converted','pending','all'].map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setQuoteStatusFilter(opt)}
              style={{
                width: '100%', padding: 10, borderRadius: 8,
                border: '1.5px solid #00bfff',
                background: quoteStatusFilter === opt ? '#0d2633' : '#181c20',
                color: '#e0f7fa'
              }}
            >{opt === 'converted' ? 'Converted' : opt === 'pending' ? 'Not Converted' : 'All Quotes'}</button>
          ))}
        </div>
        {/* Discounts panel: buttons row (Showroom | Factory) */}
        <div className="sr-mobile-summary-title" style={{ marginTop: 12 }}>Discounts</div>
        <div className="full pill-grid-2">
          <button
            type="button"
            onClick={() => setShowroomDiscounts(v => !v)}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid #00bfff', background: showShowroomDiscounts?'#0d2633':'#181c20', color: '#e0f7fa' }}
          >Showroom</button>
          <button
            type="button"
            onClick={() => setFactoryDiscounts(v => !v)}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid #00bfff', background: showFactoryDiscounts?'#0d2633':'#181c20', color: '#e0f7fa' }}
          >Factory</button>
        </div>
        {(showShowroomDiscounts || showFactoryDiscounts) && (
          <div className="sr-mobile-summary-grid">
            {(currencyFilter === 'All' ? ['K','USD'] : [currencyFilter]).map(cur => {
              const showRoom = showShowroomDiscounts;
              const showQuote = showFactoryDiscounts;
              if (!showRoom && !showQuote) return null;
              const roomVal = (showroomDiscountsByCurrency[cur] || 0);
              const quoteVal = (quotesDiscountsByCurrency[cur] || 0);
              const total = (showRoom ? roomVal : 0) + (showQuote ? quoteVal : 0);
              return (
                <div key={`disc-${cur}`} className="sr-mobile-summary-card">
                  <div className="curr">Discounts ({cur})</div>
                  {showRoom && <div className="row"><span>Showroom</span><b>{cur} {roomVal.toLocaleString()}</b></div>}
                  {showQuote && <div className="row"><span>Factory</span><b>{cur} {quoteVal.toLocaleString()}</b></div>}
                  <div className="row total"><span>Total</span><b>{cur} {total.toLocaleString()}</b></div>
                </div>
              );
            })}
            {showFactoryDiscounts && (
              (currencyFilter === 'All' ? Object.entries(quotesTotalsByCurrency) : Object.entries(quotesTotalsByCurrency).filter(([k]) => k===currencyFilter)).map(([cur, amt]) => (
                <div key={`conv-${cur}`} className="sr-mobile-summary-card">
                  <div className="curr">Converted totals ({cur})</div>
                  <div className="row total"><span>Total</span><b>{cur} {amt.toLocaleString()}</b></div>
                </div>
              ))
            )}
          </div>
        )}
        <div className="sr-mobile-scope">Payments received {dateFrom ? `from ${dateFrom}` : ''} {dateTo ? `to ${dateTo}` : ''} {paymentType && paymentType !== 'All' ? `• ${paymentType}` : ''}</div>

        <div className="sr-mobile-summary-title" style={{ marginTop: 12 }}>Layby from Quotes</div>
        <div className="sr-mobile-summary-grid">
          {Object.keys(laybyQuoteTotalsByCurrency).length === 0 && (
            <div className="sr-mobile-summary-card">No quote-origin layby payments yet.</div>
          )}
          {Object.entries(laybyQuoteTotalsByCurrency).map(([cur, amt]) => (
            <div key={`laybyq-${cur}`} className="sr-mobile-summary-card">
              <div className="curr">Quote→Layby ({cur})</div>
              <div className="row total"><span>Payments Received</span><b>{cur} {amt.toLocaleString()}</b></div>
            </div>
          ))}
        </div>

        <div className="sr-mobile-summary-title">Totals by Currency</div>
        <div className="sr-mobile-summary-grid">
          {Object.keys(totalsByCurrency).length === 0 && (
            <div className="sr-mobile-summary-card">No payments found.</div>
          )}
          {Object.entries(totalsByCurrency).map(([cur, amt]) => (
            <div key={cur} className="sr-mobile-summary-card">
              <div className="curr">{cur}</div>
              <div className="row total"><span>Total Received</span><b>{cur} {amt.toLocaleString()}</b></div>
            </div>
          ))}
        </div>

        <div className="sr-mobile-summary-title" style={{ marginTop: 12 }}>Ledger Balance</div>
        <div className="sr-mobile-summary-grid">
          {Object.keys(ledgerBalances || {}).length === 0 && (
            <div className="sr-mobile-summary-card">Ledger balance not available.</div>
          )}
          {Object.entries(ledgerBalances || {}).map(([cur, info]) => (
            <div key={`ledger-${cur}`} className="sr-mobile-summary-card">
              <div className="curr">Ledger ({cur})</div>
              <div className="row total"><span>Balance</span><b>{cur} {Number(info?.balance || 0).toLocaleString()}</b></div>
              {info?.lastEntryAt && (
                <div className="row"><span>Updated</span><b>{new Date(info.lastEntryAt).toLocaleString()}</b></div>
              )}
            </div>
          ))}
        </div>

        <div className="sr-mobile-summary-title" style={{ marginTop: 12 }}>Totals by Payment Type</div>
        <div className="sr-mobile-summary-grid">
          {Object.keys(totalsByTypeCurrency).length === 0 && (
            <div className="sr-mobile-summary-card">No data.</div>
          )}
          {Object.entries(totalsByTypeCurrency).map(([t, byCur]) => {
            const entries = (currencyFilter === 'All')
              ? Object.entries(byCur)
              : Object.entries(byCur).filter(([cur]) => cur === currencyFilter);
            if (!entries.length) return null;
            return (
              <div key={t} className="sr-mobile-summary-card">
                <div className="curr">{titleCasePaymentType(t)}</div>
                {entries.map(([cur, amt]) => (
                  <div key={`${t}-${cur}`} className="row"><span>Received</span><b>{cur} {amt.toLocaleString()}</b></div>
                ))}
              </div>
            );
          })}
        </div>

  {/* Payments received breakdown (POS-created vs Converted from quotes) */}
  <div className="sr-mobile-summary-title" style={{ marginTop: 12 }}>Payments Received</div>
        <div className="sr-mobile-summary-grid">
          {/* POS-created layby payments */}
          {(Object.keys(laybyPosTotalsByCurrency).length === 0 && Object.keys(laybyQuoteTotalsByCurrency).length === 0) && (
            <div className="sr-mobile-summary-card">No layby payments found.</div>
          )}
          {Object.entries(laybyPosTotalsByCurrency).map(([cur, amt]) => (
            <div key={`pos-${cur}`} className="sr-mobile-summary-card">
              <div className="curr">POS-created Layby ({cur})</div>
              <div className="row total"><span>Received</span><b>{cur} {amt.toLocaleString()}</b></div>
            </div>
          ))}
          {/* Converted-from-quote layby payments */}
          {Object.entries(laybyQuoteTotalsByCurrency).map(([cur, amt]) => (
            <div key={`q-${cur}`} className="sr-mobile-summary-card">
              <div className="curr">Converted Layby ({cur})</div>
              <div className="row total"><span>Received</span><b>{cur} {amt.toLocaleString()}</b></div>
            </div>
          ))}
        </div>

        <div className="sr-mobile-summary-title" style={{ marginTop: 12 }}>Converted Quotes (Invoices)</div>
        <div className="sr-mobile-summary-grid">
          {Object.keys(quotesTotalsByCurrency).length === 0 && (
            <div className="sr-mobile-summary-card">No converted quotes.</div>
          )}
          {Object.entries(quotesTotalsByCurrency).map(([cur, amt]) => (
            <div key={`q-${cur}`} className="sr-mobile-summary-card">
              <div className="curr">{cur}</div>
              <div className="row total"><span>Total</span><b>{cur} {amt.toLocaleString()}</b></div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions moved to bottom */}
      <div className="sr-mobile-actions">
        <button onClick={fetchData} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button onClick={handleExportPDF} disabled={loading} title="Export and download PDF">Download PDF</button>
        {error && <div style={{ color: '#ff6b6b', fontWeight: 700 }}>{error}</div>}
      </div>
      <div className="sr-bottom-spacer" />


      {pdfDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 99,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          onClick={() => setPdfDialogOpen(false)}
        >
          <div
            style={{ background: '#0f1720', color: '#e0f7fa', border: '1px solid #00bfff', borderRadius: 10, padding: 16, width: '88vw', maxWidth: 420 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, marginBottom: 10 }}>PDF ready</div>
            <div style={{ marginBottom: 14, opacity: 0.9 }}>Would you like to open or download the PDF?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={chooseOpenPdf}
                style={{ flex: 1, background: '#00bfff', color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700 }}
              >Open</button>
              <button
                onClick={chooseDownloadPdf}
                style={{ flex: 1, background: '#0d2633', color: '#e0f7fa', border: '1.5px solid #00bfff', borderRadius: 8, padding: 10, fontWeight: 700 }}
              >Download</button>
            </div>
            <button
              onClick={() => setPdfDialogOpen(false)}
              style={{ marginTop: 10, width: '100%', background: 'transparent', color: '#8fd7ff', border: 'none', textDecoration: 'underline' }}
            >Cancel</button>
          </div>
        </div>
      )}

      {itemsModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setItemsModal({ open: false, title: '', saleId: null, items: [], loading: false, error: '' })}
        >
          <div
            style={{ background: '#0f1720', color: '#e0f7fa', border: '1px solid #00bfff', borderRadius: 10, padding: 16, width: '92vw', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Products for {itemsModal.title}</div>
            {itemsModal.loading && <div>Loading…</div>}
            {itemsModal.error && <div style={{ color: '#ff6b6b', marginBottom: 8 }}>{itemsModal.error}</div>}
            {!itemsModal.loading && !itemsModal.error && (
              <div>
                {itemsModal.items.length === 0 && <div style={{ opacity: 0.85 }}>No items found.</div>}
                {itemsModal.items.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #223', padding: '6px 0' }}>
                    <div style={{ fontWeight: 600 }}>{it.display_name || it.product_id}</div>
                    <div style={{ whiteSpace: 'nowrap' }}>{it.quantity} × {it.currency || ''} {Number(it.unit_price||0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setItemsModal({ open: false, title: '', saleId: null, items: [], loading: false, error: '' })}
              style={{ marginTop: 10, width: '100%', background: 'transparent', color: '#8fd7ff', border: 'none', textDecoration: 'underline' }}
            >Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
