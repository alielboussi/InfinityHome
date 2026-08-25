/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from 'react';
import db from './dataClient';
import generateLaybyPdf from './laybyPdf';
import { cacheGet, cacheSet } from './utils/staleCache';
import { fetchLaybyCustomerRows } from './services/laybyCustomerRows';
import { fetchLaybyStatement } from './services/laybyStatement';
import { LAYBY_ROWS_CACHE_KEY, getDisplayTotalsByCurrency } from './utils/laybyRollup';
import { isFahme } from './laybyRules';
import { isRealtimeEnabled } from './utils/realtimeConfig';

const formatCurrency = (amount, currency = 'K') => {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = Number(amount || 0);
  const formatted = n % 1 === 0
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rawCode = String(currency || '').trim();
  const code = rawCode.toUpperCase();
  const label = (code === 'USD' || rawCode === '$') ? '$' : (rawCode || 'K');
  return `${label} ${formatted}`;
};

const getDisplayTotalsForRow = (row) => getDisplayTotalsByCurrency(row, { isFahmeCustomer: isFahme(row?.customerId) });

const sumTotalsByCurrency = (rows) => {
  const out = {};
  (rows || []).forEach(r => {
    Object.entries(r.totalsByCurrency || {}).forEach(([code, vals]) => {
      if (!out[code]) out[code] = { total: 0, paid: 0, discount: 0, due: 0 };
      out[code].total += Number(vals.total || 0);
      out[code].paid += Number(vals.paid || 0);
      out[code].discount += Number(vals.discount || 0);
      out[code].due += Number(vals.due || 0);
    });
  });
  return out;
};

const LAYBY_ROWS_CACHE_TTL_MS = 5 * 60 * 1000;

export default function LaybyManagementMobile() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [rtTick, setRtTick] = useState(0);
  const rtTimerRef = React.useRef(null);

  useEffect(() => {
    if (!isRealtimeEnabled()) return undefined;
    const channel = db
      .channel('layby-mgmt-mobile-rt')
      .on('firestore_changes', { event: '*', schema: 'public', table: 'laybys' }, () => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(() => setRtTick(t => t + 1), 250);
      })
      .on('firestore_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(() => setRtTick(t => t + 1), 250);
      })
      .on('firestore_changes', { event: '*', schema: 'public', table: 'sales_payments' }, () => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(() => setRtTick(t => t + 1), 250);
      })
      .on('firestore_changes', { event: '*', schema: 'public', table: 'layby_payments' }, () => {
        if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
        rtTimerRef.current = setTimeout(() => setRtTick(t => t + 1), 250);
      })
      .subscribe();
    return () => {
      try { db.removeChannel(channel); } catch {}
      if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
    };
  }, []);

  const loadRows = async () => {
    setLoading(true);
    setError('');
    try {
      const built = await fetchLaybyCustomerRows();
      if (!built.length) {
        setRows([]);
        setLoading(false);
        return;
      }
      setRows(built);
    } catch (e) {
      setError(e?.message || 'Failed to load layby customers.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [rtTick]);

  const filteredRows = useMemo(() => {
    const term = (search || '').toLowerCase().trim();
    if (!term) return rows;
    return rows.filter(r => {
      const name = String(r.customer?.name || '').toLowerCase();
      const phone = String(r.customer?.phone || '').toLowerCase();
      return name.includes(term) || phone.includes(term);
    });
  }, [rows, search]);

  const summaryTotals = useMemo(() => sumTotalsByCurrency(filteredRows), [filteredRows]);

  const formatTotalsLine = (field) => {
    const entries = Object.entries(summaryTotals || {});
    if (!entries.length) return '—';
    return entries.map(([code, vals]) => formatCurrency(vals[field] || 0, code)).join(' | ');
  };

  return (
    <div className="layby-mgmt-container" style={{ maxWidth: 1000, margin: '24px auto', background: '#181c20', borderRadius: 12, padding: '18px 12px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
      <h2 style={{ fontSize: '1.3rem', color: '#4caf50', textAlign: 'center', marginBottom: 12 }}>Layby Management</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
        <div className="layby-total-box k">Total Sale: {formatTotalsLine('total')}</div>
        <div className="layby-total-box usd">Total Deposit: {formatTotalsLine('paid')}</div>
        <div className="layby-total-box k">Total Discount: {formatTotalsLine('discount')}</div>
        <div className="layby-total-box usd">Total Due: {formatTotalsLine('due')}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search customer name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pos-control pos-search-wide"
          style={{ flex: 1, minWidth: 220 }}
        />
        <div style={{ color: '#9aa4b2', fontSize: 12 }}>Rows: {filteredRows.length}</div>
      </div>

      {error && <div style={{ color: '#ff5252', marginBottom: 10 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#9aa4b2', textAlign: 'center', padding: 14 }}>Loading laybys...</div>
      ) : (
        <div style={{ width: '100%', background: 'transparent', borderRadius: 8, overflowX: 'auto' }}>
          <table className="pos-table" style={{ width: '100%', minWidth: 920, background: '#23272f', borderRadius: 8, fontSize: '0.78rem', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="text-col">Customer</th>
                <th className="text-col">Phone</th>
                <th className="num-col">Total Sale</th>
                <th className="num-col">Total Deposit</th>
                <th className="num-col">Total Discount</th>
                <th className="num-col">Total Due</th>
                <th className="export-col" style={{ minWidth: 90, width: 90, textAlign: 'center' }}>Export</th>
                <th className="updated-col" style={{ minWidth: 110, width: 110, textAlign: 'center' }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => {
                const formatGroupCell = (field) => {
                  const entries = Object.entries(getDisplayTotalsForRow(row));
                  if (!entries.length) return '—';
                  return entries.map(([code, vals]) => formatCurrency(vals[field] || 0, code)).join(' | ');
                };
                const primaryLayby = row.primaryLayby;
                return (
                  <tr key={`row-${row.customerId}`} style={{ background: '#1a1f27' }}>
                    <td className="text-col" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                      <div style={{ fontWeight: 700 }}>{row.customer?.name || row.customerId}</div>
                    </td>
                    <td className="text-col" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{row.customer?.phone || '—'}</td>
                    <td className="num-col">{formatGroupCell('total')}</td>
                    <td className="num-col">{formatGroupCell('paid')}</td>
                    <td className="num-col">{formatGroupCell('discount')}</td>
                    <td className="num-col">{formatGroupCell('due')}</td>
                    <td className="export-col" style={{ minWidth: 90, width: 90, textAlign: 'center' }}>
                      <button
                        style={{ background: '#00bfff', color: '#fff', borderRadius: 6, padding: '4px 10px', fontWeight: 600, fontSize: '0.76rem', minWidth: 60, maxWidth: 80, height: 26, marginRight: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                        onClick={async () => {
                          const customerId = row.customerId;
                          let statement = {
                            sales: row.fullStatement?.sales || [],
                            items: row.fullStatement?.items || [],
                            payments: row.fullStatement?.payments || [],
                          };
                          const shouldRefreshStatement = isFahme(customerId)
                            || (!statement.sales.length && !statement.items.length && !statement.payments.length);
                          if (shouldRefreshStatement) {
                            const { data: statementRes, error: statementErr } = await fetchLaybyStatement(customerId);
                            if (!statementErr && statementRes) {
                              statement = {
                                sales: statementRes?.sales || [],
                                items: statementRes?.items || [],
                                payments: statementRes?.payments || [],
                              };
                            }
                          }
                          const pdfLayby = { ...(primaryLayby || {}), sale_id: null, customer_id: row.customerId, customerInfo: row.customer || {} };
                          await generateLaybyPdf(pdfLayby, {
                            statement,
                            totalsByCurrency: getDisplayTotalsForRow(row),
                          });
                        }}
                      >PDF</button>
                    </td>
                    <td className="updated-col" style={{ minWidth: 110, width: 110, textAlign: 'center', color: '#00bfff', fontSize: 12 }}>
                      {row.lastUpdated ? new Date(row.lastUpdated).toLocaleDateString('en-GB') : ''}
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: '#9aa4b2', padding: 8 }}>No active laybys.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
