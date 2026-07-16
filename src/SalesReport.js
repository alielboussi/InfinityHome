import React, { useCallback, useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fromPublic } from './dbSchema';
import BackToDashboard from './BackToDashboard';

const toYMD = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
};

const formatNumber = (value) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  const hasDecimals = Math.abs(num % 1) > 0.000001;
  return num.toLocaleString(undefined, hasDecimals ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);
};

const escapeCsv = (value) => {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
};

export default function SalesReport() {
  const today = useMemo(() => new Date(), []);
  const defaultEnd = useMemo(() => toYMD(today), [today]);
  const defaultStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return toYMD(d);
  }, [today]);

  const [locations, setLocations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [rows, setRows] = useState([]);
  const [itemsBySale, setItemsBySale] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const locationMap = useMemo(() => {
    const map = new Map();
    (locations || []).forEach(l => map.set(String(l.id), l));
    return map;
  }, [locations]);

  const customerMap = useMemo(() => {
    const map = new Map();
    (customers || []).forEach(c => map.set(String(c.id), c));
    return map;
  }, [customers]);

  useEffect(() => {
    (async () => {
      const [{ data: locData }, { data: custData }] = await Promise.all([
        fromPublic('locations').select('id, name').order('name'),
        fromPublic('customers').select('id, name').order('name'),
      ]);
      setLocations(locData || []);
      setCustomers(custData || []);
    })();
  }, []);

  const toggleExpanded = (saleId) => {
    setExpanded(prev => {
      const next = new Set(prev);
      const key = String(saleId);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const loadSales = useCallback(async () => {
    if (!selectedLocation || !startDate || !endDate) {
      setRows([]);
      setItemsBySale(new Map());
      setError('');
      return;
    }
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      setRows([]);
      setItemsBySale(new Map());
      setError('Choose a valid date range.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      let query = fromPublic('sales')
        .select('id, sale_date, created_at, location_id, customer_id, status, currency, total_amount, receipt_number')
        .order('sale_date', { ascending: false })
        .eq('location_id', selectedLocation)
        .gte('sale_date', `${startDate}T00:00:00`)
        .lte('sale_date', `${endDate}T23:59:59.999`);

      const { data: salesRows, error: salesErr } = await query;
      if (salesErr) throw salesErr;

      let sales = salesRows || [];
      const saleIds = sales.map(row => row.id).filter(Boolean);
      if (saleIds.length === 0) {
        setRows([]);
        setItemsBySale(new Map());
        setLoading(false);
        return;
      }

      const { data: itemRows, error: itemsErr } = await fromPublic('sales_items')
        .select('sale_id, product_id, display_name, quantity, unit_price')
        .in('sale_id', saleIds);
      if (itemsErr) throw itemsErr;

      const itemsMap = new Map();
      (itemRows || []).forEach(row => {
        if (!row.sale_id) return;
        const sid = String(row.sale_id);
        if (!itemsMap.has(sid)) itemsMap.set(sid, []);
        itemsMap.get(sid).push({
          name: row.display_name || String(row.product_id || 'Item'),
          sku: '',
          qty: Number(row.quantity) || 0,
          unitPrice: Number(row.unit_price) || 0,
        });
      });

      setRows(sales);
      setItemsBySale(itemsMap);
    } catch (e) {
      setError(e?.message || 'Failed to load sales.');
      setRows([]);
      setItemsBySale(new Map());
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, startDate, endDate]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const salesSummary = useMemo(() => {
    let saleCount = rows.length;
    let itemCount = 0;
    const totalsByCurrency = new Map();
    rows.forEach(sale => {
      const sid = String(sale.id);
      const currency = (sale.currency || 'K').toUpperCase();
      totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + Number(sale.total_amount || 0));
      const items = itemsBySale.get(sid) || [];
      itemCount += items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    });
    return { saleCount, itemCount, totalsByCurrency };
  }, [rows, itemsBySale]);

  const currencyTotals = useMemo(() => {
    return Array.from(salesSummary.totalsByCurrency.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [salesSummary.totalsByCurrency]);

  const handleExportPdf = async () => {
    if (!rows.length) return;
    const doc = new jsPDF('p', 'pt', 'a4');
    rows.forEach((sale, index) => {
      if (index > 0) doc.addPage();
      const customerName = customerMap.get(String(sale.customer_id))?.name || sale.customer_id || 'Walk-in';
      const locationName = locationMap.get(String(sale.location_id))?.name || sale.location_id || '-';
      const dateLabel = formatDateTime(sale.sale_date || sale.created_at);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Sales Report', 40, 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Sale ID: ${sale.id}`, 40, 58);
      doc.text(`Receipt: ${sale.receipt_number || '-'}`, 40, 72);
      doc.text(`Date: ${dateLabel}`, 40, 86);
      doc.text(`Customer: ${customerName}`, 40, 100);
      doc.text(`Location: ${locationName}`, 40, 114);
      doc.text(`Total: ${formatNumber(sale.total_amount)} ${sale.currency || ''}`.trim(), 40, 128);

      const items = itemsBySale.get(String(sale.id)) || [];
      const body = items.map(item => [item.name, item.sku || '-', String(item.qty), String(item.unitPrice)]);
      autoTable(doc, {
        startY: 150,
        head: [['Product', 'SKU', 'Qty', 'Unit Price']],
        body,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [0, 180, 216] },
      });
    });

    const safeStart = startDate || 'start';
    const safeEnd = endDate || 'end';
    doc.save(`Sales_${safeStart}_to_${safeEnd}.pdf`);
  };

  const handleExportCsv = () => {
    if (!rows.length) return;
    const header = [
      'sale_id',
      'sale_date',
      'receipt_number',
      'customer_name',
      'location_name',
      'status',
      'currency',
      'total_amount',
      'items_count',
      'items'
    ];
    const lines = rows.map(sale => {
      const sid = String(sale.id);
      const customerName = customerMap.get(String(sale.customer_id))?.name || sale.customer_id || 'Walk-in';
      const locationName = locationMap.get(String(sale.location_id))?.name || sale.location_id || '-';
      const items = itemsBySale.get(sid) || [];
      const itemNames = items.map(item => item.name).join(' | ');
      return [
        sale.id,
        sale.sale_date || sale.created_at || '',
        sale.receipt_number || '',
        customerName,
        locationName,
        sale.status || '',
        sale.currency || '',
        Number(sale.total_amount || 0),
        items.length,
        itemNames
      ].map(escapeCsv).join(',');
    });
    const csv = [header.map(escapeCsv).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Sales_${startDate || 'start'}_to_${endDate || 'end'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="report-page">
      <div className="page-header-row">
        <BackToDashboard />
        <h2 style={{ margin: 0 }}>Sales Report</h2>
      </div>

      <div className="report-filters report-filters-sales">
        <div className="report-filter-location-row">
          <label htmlFor="sales-report-location">Location</label>
          <select
            id="sales-report-location"
            className="report-location-select"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">Select a location</option>
            {(locations || []).map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
        <div className="report-filter-dates-row">
          <div className="report-filter-block">
            <label htmlFor="sales-report-start">Start date</label>
            <input id="sales-report-start" type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="report-filter-block">
            <label htmlFor="sales-report-end">End date</label>
            <input id="sales-report-end" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="report-actions">
        <button type="button" onClick={handleExportPdf} disabled={!rows.length}>
          Export Sales PDF
        </button>
        <button type="button" onClick={handleExportCsv} disabled={!rows.length}>
          Export Sales CSV
        </button>
      </div>

      {rows.length > 0 && (
        <div className="report-summary">
          <div className="report-summary-card">
            <div className="report-summary-title">Sales</div>
            <div className="report-summary-value">{formatNumber(salesSummary.saleCount)}</div>
          </div>
          <div className="report-summary-card">
            <div className="report-summary-title">Items Sold</div>
            <div className="report-summary-value">{formatNumber(salesSummary.itemCount)}</div>
          </div>
          {currencyTotals.map(([currency, total]) => (
            <div className="report-summary-card" key={currency}>
              <div className="report-summary-title">Total {currency}</div>
              <div className="report-summary-value">{formatNumber(total)}</div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="report-error">{error}</div>}
      {!selectedLocation && (
        <div className="report-blank">Select a location to view sales.</div>
      )}
      {selectedLocation && loading && (
        <div className="report-blank">Loading sales...</div>
      )}
      {selectedLocation && !loading && rows.length === 0 && !error && (
        <div className="report-blank">No sales found for the selected filters.</div>
      )}

      {rows.length > 0 && (
        <div className="report-section">
          <div className="report-section-title">Sales</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Receipt</th>
                <th>Customer</th>
                <th>Location</th>
                <th>Total</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(sale => {
                const sid = String(sale.id);
                const isOpen = expanded.has(sid);
                const customerName = customerMap.get(String(sale.customer_id))?.name || sale.customer_id || 'Walk-in';
                const locationName = locationMap.get(String(sale.location_id))?.name || sale.location_id || '-';
                const items = itemsBySale.get(sid) || [];
                return (
                  <React.Fragment key={sid}>
                    <tr>
                      <td>{formatDateTime(sale.sale_date || sale.created_at)}</td>
                      <td>{sale.receipt_number || '-'}</td>
                      <td>{customerName}</td>
                      <td>{locationName}</td>
                      <td>{formatNumber(sale.total_amount)} {sale.currency || ''}</td>
                      <td>
                        <button type="button" className="report-link" onClick={() => toggleExpanded(sid)}>
                          {isOpen ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="report-detail-row">
                        <td colSpan={6}>
                          {items.length === 0 ? (
                            <div className="report-blank">No items recorded for this sale.</div>
                          ) : (
                            <table className="report-table report-subtable">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>Product</th>
                                  <th>SKU</th>
                                  <th>Qty</th>
                                  <th>Unit Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, idx) => (
                                  <tr key={`${sid}-${idx}`}>
                                    <td style={{ textAlign: 'left' }}>{item.name}</td>
                                    <td>{item.sku || '-'}</td>
                                    <td>{item.qty}</td>
                                    <td>{item.unitPrice}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
