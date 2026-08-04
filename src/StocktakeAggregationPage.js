import React, { useCallback, useEffect, useMemo, useState } from 'react';
import db from './dataClient';
import {
  fetchLocationState,
  fetchLocations,
  getEvent,
  getPeriodVariance,
  listEvents,
  submitEvent,
} from './services/stocktake';
import { downloadStocktakeAggregationPdf } from './utils/stocktakeAggregationPdf';
import { downloadStocktakeVariancePdf } from './utils/stocktakeVariancePdf';
import { buildFinalTotals, buildPdfRows, isComponentRow } from './utils/stocktakeSubmitTotals';
import { logUserActivity } from './utils/userActivityLog';
import './stocktake-count.css';

const COUNTER_DISPLAY_NAMES = {
  'alielboussi00@gmail.com': 'Ali El Boussi',
};

function displayCounterLabel(email) {
  const key = String(email || '').trim().toLowerCase();
  if (COUNTER_DISPLAY_NAMES[key]) return COUNTER_DISPLAY_NAMES[key];
  return email || 'Unknown counter';
}

function getUserQtyLines(row) {
  if (!row) return [];

  if (row.row_type === 'set' && (row.byUser || []).some((entry) => Number(entry.qty) > 0)) {
    return (row.byUser || [])
      .filter((entry) => Number(entry.qty) > 0)
      .map((entry) => ({
        label: displayCounterLabel(entry.user_email),
        qty: Number(entry.qty) || 0,
        detail: 'sets scanned',
      }));
  }

  if (row.row_type === 'set' && (row.components || []).length) {
    const lines = [];
    (row.components || []).forEach((comp) => {
      (comp.byUser || []).forEach((entry) => {
        const qty = Number(entry.qty) || 0;
        if (qty <= 0) return;
        lines.push({
          label: displayCounterLabel(entry.user_email),
          qty,
          detail: comp.name || comp.sku || 'component',
        });
      });
    });
    return lines;
  }

  return (row.byUser || [])
    .filter((entry) => Number(entry.qty) > 0)
    .map((entry) => ({
      label: displayCounterLabel(entry.user_email),
      qty: Number(entry.qty) || 0,
      detail: null,
    }));
}

export default function StocktakeAggregationPage() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState(null);
  const [consolidated, setConsolidated] = useState([]);
  const [qtyDraft, setQtyDraft] = useState({});
  const [initialCompleted, setInitialCompleted] = useState(false);
  const [company, setCompany] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  const locationName = locations.find((loc) => loc.id === locationId)?.name || '';
  const activeCounting = event?.status === 'counting';
  const hasCounts = consolidated.length > 0;

  const refreshSession = useCallback(async (locId, selectedEventId) => {
    if (!locId) return;
    const [stateRes, listRes] = await Promise.all([
      fetchLocationState(locId),
      listEvents(locId),
    ]);
    setInitialCompleted(Boolean(stateRes.state?.initial_completed));
    const active = selectedEventId
      || (listRes.rows || []).find((entry) => entry.status === 'counting')?.id
      || '';
    setEventId(active);
    if (active) {
      const detail = await getEvent(active);
      setEvent(detail.event);
      setConsolidated(detail.consolidated || []);
    } else {
      setEvent(null);
      setConsolidated([]);
    }
    setQtyDraft({});
  }, []);

  useEffect(() => {
    Promise.all([
      fetchLocations(),
      db.from('company_settings').select('*').limit(1).maybeSingle(),
    ])
      .then(([locRes, companyRes]) => {
        setLocations(locRes.rows || []);
        setCompany(companyRes.data || null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!locationId) return undefined;
    let alive = true;
    (async () => {
      try {
        setError('');
        await refreshSession(locationId);
      } catch (err) {
        if (alive) setError(err.message);
      }
    })();
    const timer = setInterval(() => {
      if (!eventId) return;
      getEvent(eventId)
        .then((detail) => {
          if (!alive) return;
          setEvent(detail.event);
          setConsolidated(detail.consolidated || []);
        })
        .catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [locationId, eventId, refreshSession]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = consolidated || [];
    if (!term) return rows;
    return rows.filter((row) =>
      String(row.name || '').toLowerCase().includes(term)
      || String(row.sku || '').toLowerCase().includes(term));
  }, [consolidated, search]);

  useEffect(() => {
    setExpandedRows(new Set());
  }, [eventId, locationId]);

  const toggleExpanded = (rowKey) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const pdfRows = useMemo(
    () => buildPdfRows(consolidated, qtyDraft),
    [consolidated, qtyDraft],
  );

  const run = async (fn, msg) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (msg) setToast(msg);
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const handleQtyChange = (productId, value) => {
    const pid = String(productId);
    setQtyDraft((prev) => ({ ...prev, [pid]: value }));
  };

  const getRowQty = (row) => {
    if (!isComponentRow(row)) return row.qty;
    const pid = String(row.product_id);
    if (Object.prototype.hasOwnProperty.call(qtyDraft, pid)) {
      return qtyDraft[pid];
    }
    return row.qty;
  };

  const handleDownloadPdf = () => run(async () => {
    if (!pdfRows.length) throw new Error('No aggregated rows to export.');
    await downloadStocktakeAggregationPdf({
      locationName,
      sessionLabel: event?.is_initial ? 'Initial opening stock review' : 'Period rollover review',
      rows: pdfRows,
      company,
      generatedAt: new Date(),
    });
  }, 'Aggregation PDF downloaded.');

  const handleSubmit = () => {
    if (!event?.id || !hasCounts) {
      setError('No active counting session with aggregated totals.');
      return;
    }
    const msg = initialCompleted
      ? 'Submit adjusted totals? This closes the current period, opens the next one, and updates inventory.'
      : 'Submit as initial opening stock for this location and start the first period?';
    if (!window.confirm(msg)) return;

    run(async () => {
      const hasDraftEdits = Object.keys(qtyDraft).length > 0;
      const finalTotals = buildFinalTotals(consolidated, qtyDraft);
      const result = await submitEvent(
        event.id,
        hasDraftEdits && finalTotals.length ? { finalTotals } : {},
      );
      await logUserActivity({
        actionType: 'stocktake_submit',
        actionLabel: result.submitType === 'initial'
          ? 'Admin submit initial stocktake'
          : 'Admin submit stocktake rollover',
        entityType: 'stocktake_event',
        entityId: event.id,
        metadata: { submitType: result.submitType, locationId, adminAggregation: true },
      });
      if (result.submitType === 'rollover' && result.closedPeriod?.id) {
        try {
          const variance = await getPeriodVariance(result.closedPeriod.id);
          await downloadStocktakeVariancePdf({
            period: variance.period,
            rows: variance.rows,
            company: variance.company,
            locationName: variance.locationName || locationName,
          });
        } catch (pdfErr) {
          console.warn('Variance PDF auto-download failed', pdfErr);
        }
      }
      await refreshSession(locationId);
    }, 'Submitted. Inventory and stock periods updated.');
  };

  return (
    <div className="stock-periods-page">
      <div className="stock-periods-card">
        <div className="stock-periods-section-title">Stocktake Aggregation</div>
        <div className="stock-periods-note">
          Admin review of aggregated counter totals. Adjust component quantities if needed, download the full PDF,
          then submit to apply opening stock or close the period.
        </div>

        <label className="stock-periods-label">Location</label>
        <select
          className="pos-control"
          value={locationId}
          disabled={busy}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">Select location…</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="stock-periods-error">{error}</div>}
      {toast && <div className="stock-periods-toast">{toast}</div>}

      {locationId && (
        <div className="stock-periods-card">
          {!activeCounting ? (
            <div className="stock-periods-note">
              No counting session is open for {locationName || 'this location'}.
              Start counting on the Stocktake page, then return here to review aggregated totals.
            </div>
          ) : (
            <>
              <div className="stock-periods-note" style={{ color: '#1f9d55', marginBottom: 10 }}>
                Reviewing session for {locationName}
                {event?.is_initial ? ' (first stocktake / opening stock)' : ' (period rollover)'}.
              </div>

              <div className="stock-periods-actions" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="stock-periods-btn stock-periods-btn-secondary"
                  disabled={busy || !pdfRows.length}
                  onClick={handleDownloadPdf}
                >
                  Download aggregation PDF
                </button>
                <button
                  type="button"
                  className="stock-periods-btn stock-periods-btn-primary"
                  disabled={busy || !hasCounts}
                  onClick={handleSubmit}
                >
                  {initialCompleted ? 'Submit & close period' : 'Submit as opening stock'}
                </button>
              </div>

              <label className="stock-periods-label">Search products</label>
              <input
                type="search"
                className="pos-control"
                value={search}
                placeholder="Name or SKU"
                onChange={(e) => setSearch(e.target.value)}
              />

              <table className="pos-table stock-periods-table sticky-header-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }} aria-label="Expand" />
                    <th style={{ textAlign: 'left' }}>Product / Set</th>
                    <th>SKU</th>
                    <th>Type</th>
                    <th>Aggregated qty</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr><td colSpan={5}>No counts yet for this session.</td></tr>
                  ) : visibleRows.map((row) => {
                    const rowKey = row.key || row.product_id || row.name;
                    const editable = isComponentRow(row);
                    const qtyValue = getRowQty(row);
                    const userLines = getUserQtyLines(row);
                    const canExpand = userLines.length > 0;
                    const expanded = expandedRows.has(rowKey);
                    return (
                      <React.Fragment key={rowKey}>
                        <tr className={row.row_type === 'set' ? 'stocktake-live-row--set' : ''}>
                          <td>
                            {canExpand ? (
                              <button
                                type="button"
                                className={`stocktake-expand-tri${expanded ? ' is-open' : ''}`}
                                aria-expanded={expanded}
                                aria-label={expanded ? 'Hide counts per counter' : 'Show counts per counter'}
                                onClick={() => toggleExpanded(rowKey)}
                              />
                            ) : null}
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            {row.row_type === 'set' ? (
                              <span className="stocktake-live-set-label">
                                <span className="stocktake-live-badge">SET</span>
                                {row.name || rowKey}
                              </span>
                            ) : (
                              row.name || row.product_id
                            )}
                            {editable && Number(row.used_in_sets) > 0 && (
                              <div className="stocktake-live-subnote">
                                {Number(row.total_counted)} counted · {Number(row.used_in_sets)} in sets
                              </div>
                            )}
                          </td>
                          <td>{row.sku || '—'}</td>
                          <td>{row.row_type === 'set' ? 'Set' : 'Component'}</td>
                          <td>
                            {editable ? (
                              <input
                                type="number"
                                min="0"
                                step="1"
                                className="pos-control pos-compact"
                                style={{ width: 90, textAlign: 'center' }}
                                value={qtyValue}
                                onChange={(e) => handleQtyChange(row.product_id, e.target.value)}
                              />
                            ) : (
                              <strong>{qtyValue}</strong>
                            )}
                          </td>
                        </tr>
                        {expanded && canExpand && (
                          <tr className="stocktake-live-detail">
                            <td />
                            <td colSpan={4}>
                              <span className="stocktake-live-detail-label">Per counter</span>
                              <ul className="stocktake-live-user-list">
                                {userLines.map((line, index) => (
                                  <li key={`${line.label}-${line.detail || ''}-${index}`}>
                                    <strong>{line.label}</strong>
                                    {' — '}
                                    {line.qty}
                                    {line.detail ? ` (${line.detail})` : ''}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                        {row.row_type === 'set' && (row.components || []).map((comp) => (
                          <tr key={`${rowKey}-comp-${comp.product_id}`} className="stocktake-live-detail">
                            <td />
                            <td style={{ textAlign: 'left', paddingLeft: 20 }}>
                              <span className="stocktake-live-subnote">
                                ↳ {comp.name || comp.product_id}
                                {comp.sku ? ` (${comp.sku})` : ''}
                              </span>
                            </td>
                            <td>{comp.sku || '—'}</td>
                            <td>Component</td>
                            <td>
                              <span title={`${comp.need_per_set || comp.quantity || 0} per set × ${qtyValue} sets`}>
                                {Number(comp.qty) || (Number(comp.need_per_set || comp.quantity || 0) * Number(qtyValue || 0))}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div className="stock-periods-note" style={{ marginTop: 10 }}>
                Set rows show complete sets derived from components. Component lines under each set are what get written to inventory on submit.
                Use the triangle to see each counter&apos;s contribution. Edit leftover component quantities only — set qty is read-only.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
