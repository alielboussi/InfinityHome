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
} from './services/stocktake';
import { downloadStocktakeQtySample, parseStocktakeQtyFile } from './utils/stocktakeQtyImport';
import { downloadStocktakeVariancePdf } from './utils/stocktakeVariancePdf';
import { stocktakeCountUrlForLocation } from './utils/stocktakeLocationSlug';
import { logUserActivity } from './utils/userActivityLog';
import './stocktake-count.css';

export default function StocktakeControlPage() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState(null);
  const [consolidated, setConsolidated] = useState([]);
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
  const selectedLocation = locations.find((l) => l.id === locationId) || null;
  const countPageUrl = selectedLocation ? stocktakeCountUrlForLocation(selectedLocation) : '';

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
  }, `Session started. Counters use ${countPageUrl || 'the location count link below'}.`);

  const handleCloseSession = () => {
    if (!event?.id) return;
    const force = hasCounts;
    const confirmed = force
      ? window.confirm(
        'Force close this session? All counts will be permanently discarded and counters will no longer be able to add to it. Inventory and periods are unchanged.',
      )
      : window.confirm('Close this empty session? No inventory or periods will change.');
    if (!confirmed) return;
    run(async () => {
      await cancelEvent(event.id, undefined, { force });
      await logUserActivity({
        actionType: 'stocktake_event_cancel',
        actionLabel: force ? 'Force close stocktake session' : 'Close empty stocktake session',
        entityType: 'stocktake_event',
        entityId: event.id,
        metadata: { locationId, force },
      });
      await refreshSession(locationId);
    }, force ? 'Session force closed — counts discarded.' : 'Empty session closed.');
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

  const handleDownloadPdf = () => run(async () => {
    if (!periodId) return;
    const data = await getPeriodVariance(periodId);
    await downloadStocktakeVariancePdf({
      period: data.period,
      rows: data.rows,
      company: data.company,
      locationName: data.locationName || locationName,
    });
  }, 'Variance PDF downloaded.');

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

  const period = periodDetail?.period;
  const canDownloadPdf = period?.status === 'closed';

  return (
    <div className="stock-periods-page">
      <div className="stock-periods-card">
        <div className="stock-periods-section-title">Stocktake</div>
        <div className="stock-periods-note">
          Pick a location, start counting, then import Excel and/or share that location&apos;s count link with counters.
          When counting is finished, an admin reviews aggregated totals on
          {' '}<strong>Stocktake Aggregation</strong> before submit.
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

        {locationId && countPageUrl && (
          <div className="stock-periods-note" style={{ marginTop: 8 }}>
            <strong>Count link for {locationName || 'this location'}:</strong>
            {' '}<a href={countPageUrl} target="_blank" rel="noopener noreferrer">{countPageUrl}</a>
          </div>
        )}

        {locationId && (
          <div className="stock-periods-note" style={{ marginTop: 8 }}>
            {initialCompleted
              ? 'Next admin submit on Stocktake Aggregation closes the open period and opens a new one.'
              : 'First stocktake here — admin submit creates opening stock and starts the first period.'}
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
                  Share the count link above with counters — each location has its own URL.
                </div>
                <div className="stock-periods-actions" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="stock-periods-btn stock-periods-btn-secondary"
                    disabled={busy}
                    title={hasCounts ? 'Discard all counts and cancel this session' : 'Close empty session'}
                    onClick={handleCloseSession}
                  >
                    {hasCounts ? 'Force close session' : 'Close session'}
                  </button>
                  <button
                    type="button"
                    className="stock-periods-btn stock-periods-btn-secondary"
                    disabled={busy || !hasCounts}
                    onClick={handleClearCounts}
                  >
                    Clear counts
                  </button>
                </div>
                {hasCounts ? (
                  <div className="stock-periods-note" style={{ marginTop: 6 }}>
                    Counts are ready for admin review on <strong>Stocktake Aggregation</strong>.
                    Use Clear counts to restart counting, or Force close session to cancel entirely (counts discarded).
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
