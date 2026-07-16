import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelEvent,
  clearCounts,
  createEvent,
  fetchImportTemplate,
  fetchLocationState,
  fetchLocations,
  getEvent,
  getPeriodDetail,
  getPeriodVariance,
  importCounts,
  listEvents,
  listPeriods,
  submitEvent,
} from './services/stocktake';
import { downloadStocktakeQtySample, parseStocktakeQtyFile } from './utils/stocktakeQtyImport';
import { downloadStocktakeVariancePdf } from './utils/stocktakeVariancePdf';
import { logUserActivity } from './utils/userActivityLog';
import './stocktake-count.css';

export default function StocktakeControlPage() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState(null);
  const [consolidated, setConsolidated] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [initialCompleted, setInitialCompleted] = useState(false);
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState('');
  const [periodDetail, setPeriodDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [importSummary, setImportSummary] = useState('');
  const fileRef = useRef(null);

  const activeCounting = event?.status === 'counting';
  const hasCounts = consolidated.length > 0;
  const locationName = locations.find((l) => l.id === locationId)?.name || '';

  const refreshSession = useCallback(async (locId, selectedEventId) => {
    if (!locId) return;
    const [stateRes, listRes] = await Promise.all([
      fetchLocationState(locId),
      listEvents(locId),
    ]);
    setInitialCompleted(Boolean(stateRes.state?.initial_completed));
    const active = selectedEventId
      || (listRes.rows || []).find((e) => e.status === 'counting')?.id
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
  }, []);

  const refreshPeriods = useCallback(async (locId) => {
    if (!locId) {
      setPeriods([]);
      setPeriodId('');
      setPeriodDetail(null);
      return;
    }
    const data = await listPeriods(locId);
    const rows = data.rows || [];
    setPeriods(rows);
    const open = rows.find((p) => p.status === 'open');
    setPeriodId((prev) => {
      if (prev && rows.some((p) => p.id === prev)) return prev;
      return open?.id || rows[0]?.id || '';
    });
  }, []);

  useEffect(() => {
    fetchLocations()
      .then((data) => {
        const rows = data.rows || [];
        setLocations(rows);
        const lab = rows.find((r) => String(r.name || '').toUpperCase() === 'TEST STOCKTAKE LAB');
        if (lab) setLocationId(lab.id);
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
        await refreshPeriods(locationId);
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
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [locationId, eventId, refreshSession, refreshPeriods]);

  useEffect(() => {
    if (!periodId) {
      setPeriodDetail(null);
      return;
    }
    let alive = true;
    getPeriodDetail(periodId)
      .then((d) => { if (alive) setPeriodDetail(d); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [periodId]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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

  const handleStartSession = () => run(async () => {
    const data = await createEvent(locationId);
    await logUserActivity({
      actionType: 'stocktake_event_create',
      actionLabel: 'Start stocktake counting session',
      entityType: 'stocktake_event',
      entityId: data.event?.id,
      metadata: { locationId, is_initial: data.event?.is_initial },
    });
    await refreshSession(locationId, data.event.id);
  }, 'Session started. Users count on /stocktake/count for this location.');

  const handleCloseSession = () => {
    if (!event?.id) return;
    if (hasCounts) {
      setError('Counts already exist. Clear counts for a fresh start, or submit to finish.');
      return;
    }
    if (!window.confirm('Close this empty session? No inventory or periods will change.')) return;
    run(async () => {
      await cancelEvent(event.id);
      await logUserActivity({
        actionType: 'stocktake_event_cancel',
        actionLabel: 'Close empty stocktake session',
        entityType: 'stocktake_event',
        entityId: event.id,
        metadata: { locationId },
      });
      await refreshSession(locationId);
    }, 'Empty session closed.');
  };

  const handleClearCounts = () => {
    if (!event?.id) return;
    if (!hasCounts) {
      setToast('No counts to clear.');
      return;
    }
    if (!window.confirm('Delete all counts for this session? Users can start counting again from scratch.')) return;
    run(async () => {
      await clearCounts(event.id);
      await logUserActivity({
        actionType: 'stocktake_counts_clear',
        actionLabel: 'Clear stocktake counts',
        entityType: 'stocktake_event',
        entityId: event.id,
        metadata: { locationId },
      });
      setImportSummary('');
      await refreshSession(locationId, event.id);
    }, 'All counts cleared.');
  };

  const handleSubmit = () => {
    if (!event?.id) return;
    if (!hasCounts) {
      setError('No counts yet. Import or count first, or close the empty session.');
      return;
    }
    const msg = initialCompleted
      ? 'Submit counts? This closes the current period, opens the next one, and updates inventory for this location only.'
      : 'Submit counts as the first opening stock for this location and start the period?';
    if (!window.confirm(msg)) return;
    run(async () => {
      const result = await submitEvent(event.id);
      await logUserActivity({
        actionType: 'stocktake_submit',
        actionLabel: result.submitType === 'initial' ? 'Submit initial stocktake' : 'Submit stocktake rollover',
        entityType: 'stocktake_event',
        entityId: event.id,
        metadata: { submitType: result.submitType, locationId },
      });
      if (result.submitType === 'rollover' && result.closedPeriod?.id) {
        try {
          const variance = await getPeriodVariance(result.closedPeriod.id);
          await downloadStocktakeVariancePdf({
            period: variance.period,
            rows: variance.rows,
            company: variance.company,
          });
        } catch (pdfErr) {
          console.warn('Variance PDF auto-download failed', pdfErr);
        }
      }
      await refreshSession(locationId);
      await refreshPeriods(locationId);
    }, 'Submitted. Periods updated automatically.');
  };

  const handleDownloadSample = () => run(async () => {
    if (!locationId) throw new Error('Select a location first.');
    const data = await fetchImportTemplate(locationId);
    downloadStocktakeQtySample({
      rows: data.rows || [],
      filename: `stocktake_qty_sample_${(locationName || 'location').replace(/\s+/g, '_')}.xlsx`,
    });
  }, 'Sample Excel downloaded (products/components only).');

  const handleImportFile = async (file) => {
    if (!file) return;
    if (!event?.id || event.status !== 'counting') {
      setError('Start a counting session first, then import.');
      return;
    }
    await run(async () => {
      const rows = await parseStocktakeQtyFile(file);
      const result = await importCounts(event.id, rows);
      await logUserActivity({
        actionType: 'stocktake_counts_import',
        actionLabel: 'Import stocktake quantities',
        entityType: 'stocktake_event',
        entityId: event.id,
        metadata: {
          locationId,
          importedCount: result.importedCount,
          skippedCount: result.skippedCount,
        },
      });
      const skipPreview = (result.skipped || [])
        .slice(0, 5)
        .map((s) => `${s.sku}: ${s.reason}`)
        .join(' · ');
      setImportSummary(
        `Imported ${result.importedCount} row(s) for ${locationName || 'this location'}`
        + (result.skippedCount ? ` · skipped ${result.skippedCount}${skipPreview ? ` (${skipPreview})` : ''}` : '')
        + '. Sets are never imported.'
      );
      await refreshSession(locationId, event.id);
    }, 'Import finished.');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDownloadPdf = () => run(async () => {
    if (!periodId) return;
    const data = await getPeriodVariance(periodId);
    await downloadStocktakeVariancePdf({
      period: data.period,
      rows: data.rows,
      company: data.company,
    });
  }, 'Variance PDF downloaded.');

  const period = periodDetail?.period;
  const canDownloadPdf = period?.status === 'closed';

  return (
    <div className="stock-periods-page">
      <div className="stock-periods-card">
        <div className="stock-periods-section-title">Stocktake</div>
        <div className="stock-periods-note">
          Pick a location, start counting, then import Excel and/or have users count on the fixed page
          {' '}<strong>/stocktake/count</strong>. Submit when finished — periods update automatically.
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

        {locationId && (
          <div className="stock-periods-note" style={{ marginTop: 8 }}>
            {initialCompleted
              ? 'Next submit closes the open period and opens a new one for this location only.'
              : 'First stocktake here — submit creates opening stock and starts the first period.'}
          </div>
        )}
      </div>

      {error && <div className="stock-periods-error">{error}</div>}
      {toast && <div className="stock-periods-toast">{toast}</div>}
      {importSummary && <div className="stock-periods-toast">{importSummary}</div>}

      {locationId && (
        <>
          <div className="stock-periods-card">
            <div className="stock-periods-section-title">Counting</div>
            {!activeCounting ? (
              <div className="stock-periods-actions">
                <button
                  type="button"
                  className="stock-periods-btn stock-periods-btn-primary"
                  disabled={busy}
                  onClick={handleStartSession}
                >
                  Start counting
                </button>
              </div>
            ) : (
              <>
                <div className="stock-periods-note" style={{ color: '#1f9d55' }}>
                  Counting open{event?.is_initial ? ' (first stocktake)' : ''} for {locationName || 'this location'}.
                  Users sign in on <strong>/stocktake/count</strong> — same page every time.
                </div>
                <div className="stock-periods-actions" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="stock-periods-btn stock-periods-btn-secondary"
                    disabled={busy || hasCounts}
                    title={hasCounts ? 'Clear counts first, or submit instead' : 'Close empty session'}
                    onClick={handleCloseSession}
                  >
                    Close session
                  </button>
                  <button
                    type="button"
                    className="stock-periods-btn stock-periods-btn-secondary"
                    disabled={busy || !hasCounts}
                    onClick={handleClearCounts}
                  >
                    Clear counts
                  </button>
                  <button
                    type="button"
                    className="stock-periods-btn stock-periods-btn-primary"
                    disabled={busy || !hasCounts}
                    onClick={handleSubmit}
                  >
                    Submit stocktake
                  </button>
                </div>
                {hasCounts ? (
                  <div className="stock-periods-note" style={{ marginTop: 6 }}>
                    Close session is only for empty starts. Use Clear counts to restart, or Submit to finish.
                  </div>
                ) : (
                  <div className="stock-periods-note" style={{ marginTop: 6 }}>
                    No counts yet — you can close this session if it was started by mistake.
                  </div>
                )}
              </>
            )}

            <div className="stock-periods-section-title" style={{ marginTop: 18 }}>Import stock qty (Excel)</div>
            <div className="stock-periods-note">
              Columns: <strong>SKU</strong>, <strong>Product Name</strong>, <strong>Quantity</strong>.
              Products and components only — sets are rejected. Quantities apply only to <strong>{locationName || 'the selected location'}</strong>.
            </div>
            <div className="stock-periods-actions" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="stock-periods-btn stock-periods-btn-secondary"
                disabled={busy || !locationId}
                onClick={handleDownloadSample}
              >
                Download sample Excel
              </button>
              <button
                type="button"
                className="stock-periods-btn stock-periods-btn-primary"
                disabled={busy || !activeCounting}
                onClick={() => fileRef.current?.click()}
              >
                Import Excel
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => handleImportFile(e.target.files?.[0])}
              />
            </div>
            {!activeCounting && (
              <div className="stock-periods-note" style={{ marginTop: 6 }}>
                Start counting before importing.
              </div>
            )}
          </div>

          {activeCounting && (
            <div className="stock-periods-card">
              <div className="stock-periods-section-title">Live totals</div>
              <table className="pos-table stock-periods-table sticky-header-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidated.length === 0 ? (
                    <tr><td colSpan={4}>No counts yet.</td></tr>
                  ) : consolidated.map((row) => {
                    const open = Boolean(expanded[row.product_id]);
                    return (
                      <React.Fragment key={row.product_id}>
                        <tr
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpanded((prev) => ({ ...prev, [row.product_id]: !prev[row.product_id] }))}
                        >
                          <td>{open ? '▾' : '▸'}</td>
                          <td>{row.name || row.product_id}</td>
                          <td>{row.sku || '—'}</td>
                          <td><strong>{row.qty}</strong></td>
                        </tr>
                        {open && (row.byUser || []).map((u) => (
                          <tr key={`${row.product_id}-${u.user_email}`}>
                            <td />
                            <td colSpan={2} style={{ paddingLeft: 24, fontSize: 13 }}>
                              {u.user_email}
                              {u.updated_at ? ` · ${new Date(u.updated_at).toLocaleString()}` : ''}
                            </td>
                            <td>{u.qty}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="stock-periods-card">
            <div className="stock-periods-section-title">Periods</div>
            <div className="stock-periods-note">
              Created automatically when a stocktake is submitted. No manual period setup.
            </div>
            <table className="pos-table stock-periods-table">
              <thead>
                <tr>
                  <th>Begin</th>
                  <th>End</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {periods.length === 0 ? (
                  <tr><td colSpan={4}>No periods yet. Complete a stocktake submit first.</td></tr>
                ) : periods.map((p) => (
                  <tr key={p.id}>
                    <td>{p.begin_period_date || p.opened_at ? new Date(p.begin_period_date || p.opened_at).toLocaleString() : '—'}</td>
                    <td>{p.end_period_date || p.closed_at ? new Date(p.end_period_date || p.closed_at).toLocaleString() : '—'}</td>
                    <td>{p.status}</td>
                    <td>
                      <button
                        type="button"
                        className="stock-periods-btn stock-periods-btn-secondary"
                        onClick={() => setPeriodId(p.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {periodDetail && (
            <div className="stock-periods-card">
              <div className="stock-periods-section-title">
                Period detail — {period?.status}
              </div>
              <div className="stock-periods-actions">
                <button
                  type="button"
                  className="stock-periods-btn stock-periods-btn-primary"
                  disabled={!canDownloadPdf || busy}
                  onClick={handleDownloadPdf}
                >
                  Download Variance PDF
                </button>
                {!canDownloadPdf && (
                  <span className="stock-periods-note">PDF available after this period is closed by a stocktake submit.</span>
                )}
              </div>

              <div className="stock-periods-section-title" style={{ marginTop: 16 }}>Opening stock</div>
              <table className="pos-table stock-periods-table">
                <thead>
                  <tr><th>Product</th><th>SKU</th><th>Qty</th></tr>
                </thead>
                <tbody>
                  {(periodDetail.opening || []).length === 0 ? (
                    <tr><td colSpan={3}>No opening rows.</td></tr>
                  ) : periodDetail.opening.map((r) => (
                    <tr key={r.product_id}>
                      <td>{r.name}</td>
                      <td>{r.sku || '—'}</td>
                      <td>{r.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(periodDetail.closing || []).length > 0 && (
                <>
                  <div className="stock-periods-section-title" style={{ marginTop: 16 }}>Closing stock</div>
                  <table className="pos-table stock-periods-table">
                    <thead>
                      <tr><th>Product</th><th>SKU</th><th>Qty</th></tr>
                    </thead>
                    <tbody>
                      {periodDetail.closing.map((r) => (
                        <tr key={r.product_id}>
                          <td>{r.name}</td>
                          <td>{r.sku || '—'}</td>
                          <td>{r.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
