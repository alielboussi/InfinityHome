import React, { useEffect, useState } from 'react';
import db from './dataClient';
import {
  fetchLocations,
  computeOpeningAggregationForPeriod,
  getPeriodDetail,
  getPeriodVariance,
  listPeriods,
} from './services/stocktake';
import { formatStockPeriodDateTime } from './utils/stocktakePeriodDisplay';
import { downloadPeriodOpeningAggregationPdf } from './utils/stocktakeAggregationPdf';
import { downloadStocktakeVariancePdf } from './utils/stocktakeVariancePdf';
import './stocktake-count.css';

export default function StocktakePeriodsPage() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState('');
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetchLocations().then((d) => setLocations(d.rows || [])).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!locationId) {
      setPeriods([]);
      setPeriodId('');
      setDetail(null);
      return;
    }
    setBusy(true);
    listPeriods(locationId)
      .then((d) => {
        setPeriods(d.rows || []);
        const open = (d.rows || []).find((p) => p.status === 'open');
        setPeriodId(open?.id || (d.rows || [])[0]?.id || '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [locationId]);

  useEffect(() => {
    if (!periodId) {
      setDetail(null);
      return;
    }
    setBusy(true);
    getPeriodDetail(periodId)
      .then((d) => setDetail(d))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [periodId]);

  const period = detail?.period;
  const canDownloadPdf = String(period?.status || '').toLowerCase() === 'closed';
  const canDownloadOpeningAggregation = (detail?.opening_aggregation || []).length > 0
    || (detail?.opening || []).some((r) => Number(r.qty || 0) > 0);

  const locationName = locations.find((l) => l.id === locationId)?.name || '';

  const handleDownloadOpeningAggregationPdf = async () => {
    if (!canDownloadOpeningAggregation) return;
    setBusy(true);
    setError('');
    try {
      let rows = detail.opening_aggregation || [];
      const opening = (detail.opening || []).filter((r) => Number(r.qty || 0) > 0);
      if (!rows.length && opening.length) {
        rows = await computeOpeningAggregationForPeriod(period, opening);
      }
      const { data: company } = await db.from('company_settings').select('*').limit(1).maybeSingle();
      await downloadPeriodOpeningAggregationPdf({
        period,
        rows,
        company: company || null,
        locationName,
      });
      setToast('Opening aggregation PDF downloaded — please collect signatures.');
    } catch (err) {
      setError(err.message || 'Failed to build PDF');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!periodId || !canDownloadPdf) return;
    setBusy(true);
    setError('');
    try {
      const data = await getPeriodVariance(periodId);
      await downloadStocktakeVariancePdf({
        period: data.period,
        rows: data.rows,
        company: data.company,
        locationName: data.locationName,
      });
      setToast('Variance PDF downloaded.');
    } catch (err) {
      setError(err.message || 'Failed to build PDF');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stock-periods-page">
      <div className="stock-periods-card">
        <div className="stock-periods-section-title">Opening Stock by Period</div>
        <div className="stock-periods-note">
          View opening (and closing) stock entered from stocktake submissions. Variance PDF unlocks when a period is closed.
        </div>
        <label className="stock-periods-label">Location</label>
        <select className="pos-control" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={busy}>
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
          <div className="stock-periods-section-title">Periods</div>
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
                <tr><td colSpan={4}>No periods yet. Complete an initial stocktake first.</td></tr>
              ) : periods.map((p) => (
                <tr key={p.id}>
                  <td>{formatStockPeriodDateTime(p.begin_period_date || p.opened_at)}</td>
                  <td>{formatStockPeriodDateTime(p.end_period_date || p.closed_at)}</td>
                  <td>{p.status}</td>
                  <td>
                    <button type="button" className="stock-periods-btn stock-periods-btn-secondary" onClick={() => setPeriodId(p.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="stock-periods-card">
          <div className="stock-periods-section-title">
            Period detail — {period?.status}
          </div>
          <div className="stock-periods-actions">
            <button
              type="button"
              className="stock-periods-btn stock-periods-btn-primary"
              disabled={!canDownloadOpeningAggregation || busy}
              onClick={handleDownloadOpeningAggregationPdf}
            >
              Download opening aggregation PDF (signatures)
            </button>
            <button
              type="button"
              className="stock-periods-btn stock-periods-btn-primary"
              disabled={!canDownloadPdf || busy}
              onClick={handleDownloadPdf}
            >
              Download Variance PDF
            </button>
            {!canDownloadPdf && (
              <span className="stock-periods-note">PDF enabled only after this period is closed by a stocktake submit.</span>
            )}
          </div>

          {(detail.opening_aggregation || []).length > 0 && (
            <>
              <div className="stock-periods-section-title" style={{ marginTop: 16 }}>
                Opening stock (aggregation view)
              </div>
              <table className="pos-table stock-periods-table">
                <thead>
                  <tr>
                    <th>Product / Set</th>
                    <th>SKU</th>
                    <th>Type</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.opening_aggregation.map((r, idx) => (
                    <tr key={`${r.sku}-${r.name}-${idx}`}>
                      <td>{r.name}</td>
                      <td>{r.sku || '—'}</td>
                      <td>Product</td>
                      <td>{r.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="stock-periods-section-title" style={{ marginTop: 16 }}>
            {period?.status === 'open' && !(detail.closing || []).length
              ? 'Expected stock to count'
              : 'Opening stock (this period)'}
          </div>
          <table className="pos-table stock-periods-table">
            <thead>
              <tr><th>Product</th><th>SKU</th><th>Qty</th></tr>
            </thead>
            <tbody>
              {(detail.opening || []).length === 0 ? (
                <tr><td colSpan={3}>No opening stock recorded for this period yet.</td></tr>
              ) : detail.opening.map((r) => (
                <tr key={r.product_id}>
                  <td>{r.name}</td>
                  <td>{r.sku || '—'}</td>
                  <td>{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(detail.closing || []).length > 0 && (
            <>
              <div className="stock-periods-section-title" style={{ marginTop: 16 }}>Closing stock</div>
              <table className="pos-table stock-periods-table">
                <thead>
                  <tr><th>Product</th><th>SKU</th><th>Qty</th></tr>
                </thead>
                <tbody>
                  {detail.closing.map((r) => (
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
    </div>
  );
}
