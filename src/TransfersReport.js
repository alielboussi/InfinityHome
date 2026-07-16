import React, { useCallback, useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fromPublic } from './dbSchema';
import supabase from './supabase';
import { applyInventoryBulk } from './utils/inventoryApi';
import { syncProductLocations } from './services/productLocations';
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

export default function TransfersReport() {
  const today = useMemo(() => new Date(), []);
  const defaultEnd = useMemo(() => toYMD(today), [today]);
  const defaultStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return toYMD(d);
  }, [today]);

  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [rows, setRows] = useState([]);
  const [itemsBySession, setItemsBySession] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [actionError, setActionError] = useState('');

  const productMap = useMemo(() => {
    const map = new Map();
    (products || []).forEach(p => map.set(String(p.id), p));
    return map;
  }, [products]);

  const locationMap = useMemo(() => {
    const map = new Map();
    (locations || []).forEach(l => map.set(String(l.id), l));
    return map;
  }, [locations]);

  useEffect(() => {
    (async () => {
      const [{ data: locData }, { data: prodData }] = await Promise.all([
        fromPublic('locations').select('id, name').order('name'),
        fromPublic('products').select('id, name, sku').order('name'),
      ]);
      setLocations(locData || []);
      setProducts(prodData || []);
    })();
  }, []);

  const toggleExpanded = (sessionId) => {
    setExpanded(prev => {
      const next = new Set(prev);
      const key = String(sessionId);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const loadTransfers = useCallback(async () => {
    if (!startDate || !endDate) {
      setRows([]);
      setItemsBySession(new Map());
      setError('');
      return;
    }
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      setRows([]);
      setItemsBySession(new Map());
      setError('Choose a valid date range.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const baseSelect = 'id, from_location, to_location, transfer_date, transfer_datetime, created_at, total_qty, pdf_url, metadata, notes, status';
      let dtQuery = fromPublic('stock_transfer_sessions')
        .select(baseSelect)
        .not('transfer_datetime', 'is', null)
        .gte('transfer_datetime', startISO)
        .lte('transfer_datetime', endISO);
      let dateQuery = fromPublic('stock_transfer_sessions')
        .select(baseSelect)
        .is('transfer_datetime', null)
        .gte('transfer_date', startDate)
        .lte('transfer_date', endDate);
      if (fromLocation) {
        dtQuery = dtQuery.eq('from_location', fromLocation);
        dateQuery = dateQuery.eq('from_location', fromLocation);
      }
      if (toLocation) {
        dtQuery = dtQuery.eq('to_location', toLocation);
        dateQuery = dateQuery.eq('to_location', toLocation);
      }
      const [dtRes, dateRes] = await Promise.all([dtQuery, dateQuery]);

      const merged = new Map();
      (dtRes?.data || []).forEach(row => merged.set(row.id, row));
      (dateRes?.data || []).forEach(row => merged.set(row.id, row));
      let sessions = Array.from(merged.values());
      sessions.sort((a, b) => {
        const ta = a.transfer_datetime || a.transfer_date || a.created_at;
        const tb = b.transfer_datetime || b.transfer_date || b.created_at;
        return new Date(tb).getTime() - new Date(ta).getTime();
      });

      const sessionIds = sessions.map(s => s.id).filter(Boolean);
      if (sessionIds.length === 0) {
        setRows([]);
        setItemsBySession(new Map());
        setLoading(false);
        return;
      }

      const { data: entryRows, error: entryErr } = await fromPublic('stock_transfer_entries')
        .select('session_id, product_id, parent_product_id, quantity')
        .in('session_id', sessionIds);
      if (entryErr) throw entryErr;

      const filteredEntries = (entryRows || []).filter(row => {
        const pid = row.product_id || row.parent_product_id;
        return Boolean(pid);
      });

      const itemsMap = new Map();
      filteredEntries.forEach(row => {
        if (!row.session_id) return;
        const sid = String(row.session_id);
        const pid = row.product_id || row.parent_product_id;
        if (!pid) return;
        if (!itemsMap.has(sid)) itemsMap.set(sid, []);
        const info = productMap.get(String(pid));
        itemsMap.get(sid).push({
          product_id: pid,
          name: info?.name || String(pid),
          sku: info?.sku || '',
          qty: Number(row.quantity) || 0,
        });
      });

      setRows(sessions);
      setItemsBySession(itemsMap);
    } catch (e) {
      setError(e?.message || 'Failed to load transfers.');
      setRows([]);
      setItemsBySession(new Map());
    } finally {
      setLoading(false);
    }
  }, [fromLocation, toLocation, startDate, endDate, productMap]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  const getDirection = useCallback((session) => {
    const fromSelected = fromLocation && String(session.from_location) === String(fromLocation);
    const toSelected = toLocation && String(session.to_location) === String(toLocation);
    if (fromSelected && toSelected) return 'INTERNAL';
    if (fromSelected) return 'OUT';
    if (toSelected) return 'IN';
    return 'MOVE';
  }, [fromLocation, toLocation]);

  const transferSummary = useMemo(() => {
    let totalTransfers = rows.length;
    let totalQty = 0;
    let inboundQty = 0;
    let outboundQty = 0;
    let internalQty = 0;
    rows.forEach(session => {
      const sid = String(session.id);
      const items = itemsBySession.get(sid) || [];
      const qty = session.total_qty ?? items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      totalQty += qty;
      const dir = getDirection(session);
      if (dir === 'IN') inboundQty += qty;
      if (dir === 'OUT') outboundQty += qty;
      if (dir === 'INTERNAL') internalQty += qty;
    });
    return { totalTransfers, totalQty, inboundQty, outboundQty, internalQty };
  }, [rows, itemsBySession, getDirection]);

  const getPdfUrl = useCallback((session) => {
    if (!session) return '';
    if (session.pdf_url) return session.pdf_url;
    const meta = session.metadata;
    if (meta && typeof meta === 'object' && meta.pdf_url) return meta.pdf_url;
    const notes = session.notes;
    if (typeof notes === 'string' && notes.trim()) {
      try {
        const parsed = JSON.parse(notes);
        if (parsed?.pdf_url) return parsed.pdf_url;
      } catch {}
    }
    return '';
  }, []);

  const handleOpenPdf = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  };

  const handleExportPdf = async () => {
    if (!rows.length) return;
    const doc = new jsPDF('p', 'pt', 'a4');
    rows.forEach((session, index) => {
      if (index > 0) doc.addPage();
      const fromName = locationMap.get(String(session.from_location))?.name || session.from_location || '-';
      const toName = locationMap.get(String(session.to_location))?.name || session.to_location || '-';
      const dateLabel = formatDateTime(session.transfer_datetime || session.transfer_date || session.created_at);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Transfers Report', 40, 40);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Transfer ID: ${session.id}`, 40, 58);
      doc.text(`Date: ${dateLabel}`, 40, 72);
      doc.text(`From: ${fromName}`, 40, 86);
      doc.text(`To: ${toName}`, 40, 100);

      const items = itemsBySession.get(String(session.id)) || [];
      const body = items.map(item => [item.name, item.sku || '-', String(item.qty)]);
      autoTable(doc, {
        startY: 120,
        head: [['Product', 'SKU', 'Qty']],
        body,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [0, 180, 216] },
      });
    });

    const safeStart = startDate || 'start';
    const safeEnd = endDate || 'end';
    doc.save(`Transfers_${safeStart}_to_${safeEnd}.pdf`);
  };

  const applyTransferInventory = async (session, entries) => {
    const fromLoc = session.from_location;
    const toLoc = session.to_location;
    const qtyByProduct = new Map();
    (entries || []).forEach(entry => {
      const pid = entry.product_id || entry.parent_product_id;
      if (!pid) return;
      const prev = qtyByProduct.get(pid) || 0;
      qtyByProduct.set(pid, prev + Number(entry.quantity || 0));
    });
    const productIds = Array.from(qtyByProduct.keys());
    if (!productIds.length) return;

    const { data: invRows, error: invErr } = await fromPublic('inventory')
      .select('id, product_id, location, quantity')
      .in('product_id', productIds)
      .in('location', [fromLoc, toLoc]);
    if (invErr) throw invErr;

    const invByKey = new Map();
    (invRows || []).forEach(r => invByKey.set(`${r.product_id}|${r.location}`, r));
    const updates = [];
    const inserts = [];

    qtyByProduct.forEach((qty, pid) => {
      const srcKey = `${pid}|${fromLoc}`;
      const dstKey = `${pid}|${toLoc}`;
      const src = invByKey.get(srcKey);
      const dst = invByKey.get(dstKey);
      if (src) {
        updates.push({ id: src.id, quantity: (Number(src.quantity) || 0) - qty });
      } else {
        inserts.push({ product_id: pid, location: fromLoc, quantity: -qty });
      }
      if (dst) {
        updates.push({ id: dst.id, quantity: (Number(dst.quantity) || 0) + qty });
      } else {
        inserts.push({ product_id: pid, location: toLoc, quantity: qty });
      }
    });

    await applyInventoryBulk({ updates, inserts }, supabase);

    const productLocationRows = productIds.map(pid => ({ product_id: pid, location_id: toLoc }));
    await syncProductLocations({ rows: productLocationRows }, supabase);
  };

  const handleApprove = async (session) => {
    if (!session?.id) return;
    const sid = String(session.id);
    if (actionBusy) return;
    setActionBusy(sid);
    setActionError('');
    try {
      const { data: entries, error: entriesErr } = await fromPublic('stock_transfer_entries')
        .select('id, session_id, product_id, parent_product_id, quantity')
        .eq('session_id', session.id);
      if (entriesErr) throw entriesErr;
      await applyTransferInventory(session, entries || []);
      const nowIso = new Date().toISOString();
      const { error: upErr } = await fromPublic('stock_transfer_sessions')
        .update({ status: 'approved', transfer_datetime: nowIso, transfer_date: nowIso.slice(0, 10) })
        .eq('id', session.id);
      if (upErr) throw upErr;
      await loadTransfers();
    } catch (e) {
      setActionError(e?.message || 'Failed to approve transfer.');
    } finally {
      setActionBusy('');
    }
  };

  const handleReject = async (session) => {
    if (!session?.id) return;
    const sid = String(session.id);
    if (actionBusy) return;
    const confirm = window.confirm('Reject this transfer?');
    if (!confirm) return;
    setActionBusy(sid);
    setActionError('');
    try {
      const note = JSON.stringify({ status: 'rejected', rejected_at: new Date().toISOString() });
      const { error: upErr } = await fromPublic('stock_transfer_sessions')
        .update({ status: 'rejected', notes: note })
        .eq('id', session.id);
      if (upErr) throw upErr;
      await loadTransfers();
    } catch (e) {
      setActionError(e?.message || 'Failed to reject transfer.');
    } finally {
      setActionBusy('');
    }
  };

  return (
    <div className="report-page">
      <div className="page-header-row">
        <BackToDashboard />
        <h2 style={{ margin: 0 }}>Transfers Report</h2>
      </div>

      <div className="report-filters">
        <div className="report-filter-block">
          <label>Start date</label>
          <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="report-filter-block">
          <label>End date</label>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="report-filter-block">
          <label>From location</label>
          <select value={fromLocation} onChange={e => setFromLocation(e.target.value)}>
            <option value="">All locations</option>
            {(locations || []).map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
        <div className="report-filter-block">
          <label>To location</label>
          <select value={toLocation} onChange={e => setToLocation(e.target.value)}>
            <option value="">All locations</option>
            {(locations || []).map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="report-actions">
        <button type="button" onClick={handleExportPdf} disabled={!rows.length}>
          Export Transfers PDF
        </button>
      </div>

      {actionError && <div className="report-error">{actionError}</div>}

      {rows.length > 0 && (
        <div className="report-summary">
          <div className="report-summary-card">
            <div className="report-summary-title">Transfers</div>
            <div className="report-summary-value">{formatNumber(transferSummary.totalTransfers)}</div>
          </div>
          <div className="report-summary-card">
            <div className="report-summary-title">Total Qty</div>
            <div className="report-summary-value">{formatNumber(transferSummary.totalQty)}</div>
          </div>
          <div className="report-summary-card">
            <div className="report-summary-title">Inbound Qty</div>
            <div className="report-summary-value">{formatNumber(transferSummary.inboundQty)}</div>
          </div>
          <div className="report-summary-card">
            <div className="report-summary-title">Outbound Qty</div>
            <div className="report-summary-value">{formatNumber(transferSummary.outboundQty)}</div>
          </div>
          <div className="report-summary-card">
            <div className="report-summary-title">Internal Qty</div>
            <div className="report-summary-value">{formatNumber(transferSummary.internalQty)}</div>
          </div>
        </div>
      )}

      {error && <div className="report-error">{error}</div>}
      {loading && (
        <div className="report-blank">Loading transfers...</div>
      )}
      {!loading && rows.length === 0 && !error && (
        <div className="report-blank">No transfers found for the selected filters.</div>
      )}

      {rows.length > 0 && (
        <div className="report-section">
          <div className="report-section-title">Transfers</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th>Direction</th>
                <th>Total Qty</th>
                <th>Status</th>
                <th>Items</th>
                <th>PDF</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(session => {
                const sid = String(session.id);
                const fromName = locationMap.get(String(session.from_location))?.name || session.from_location || '-';
                const toName = locationMap.get(String(session.to_location))?.name || session.to_location || '-';
                const items = itemsBySession.get(sid) || [];
                const isOpen = expanded.has(sid);
                const pdfUrl = getPdfUrl(session);
                return (
                  <React.Fragment key={sid}>
                    <tr>
                      <td>{formatDateTime(session.transfer_datetime || session.transfer_date || session.created_at)}</td>
                      <td>{fromName}</td>
                      <td>{toName}</td>
                      <td>{getDirection(session)}</td>
                      <td>{formatNumber(session.total_qty ?? items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0))}</td>
                      <td>{session.status || '-'}</td>
                      <td>
                        <button type="button" className="report-link" onClick={() => toggleExpanded(sid)}>
                          {isOpen ? 'Hide' : 'View'}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="report-link"
                          onClick={() => handleOpenPdf(pdfUrl)}
                          disabled={!pdfUrl}
                        >
                          {pdfUrl ? 'PDF' : '—'}
                        </button>
                      </td>
                      <td>
                        {String(session.status || '').toLowerCase() === 'pending' ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button type="button" className="report-link" onClick={() => handleApprove(session)} disabled={actionBusy === sid}>
                              {actionBusy === sid ? 'Approving…' : 'Approve'}
                            </button>
                            <button type="button" className="report-link" onClick={() => handleReject(session)} disabled={actionBusy === sid}>
                              Reject
                            </button>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="report-detail-row">
                        <td colSpan={9}>
                          {items.length === 0 ? (
                            <div className="report-blank">No items recorded for this transfer.</div>
                          ) : (
                            <table className="report-table report-subtable">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>Product</th>
                                  <th>SKU</th>
                                  <th>Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, idx) => (
                                  <tr key={`${sid}-${idx}`}>
                                    <td style={{ textAlign: 'left' }}>{item.name}</td>
                                    <td>{item.sku || '-'}</td>
                                    <td>{item.qty}</td>
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
