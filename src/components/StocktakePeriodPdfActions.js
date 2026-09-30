/** STOCKTAKE_PIPELINE_LOCKED — see docs/stocktake-pdf-pipeline.md */
import React from 'react';
import db from '../dataClient';
import { getPeriodVariance } from '../services/stocktake';
import {
  downloadPeriodClosingAggregationPdf,
  downloadPeriodOpeningAggregationPdf,
} from '../utils/stocktakeAggregationPdf';
import { periodLedgerPdfRowsFromVariance } from '../utils/periodPdfFromVariance';
import {
  periodPdfRowsFromScannedAggregation,
  resolveClosingPdfRows,
  resolveOpeningPdfRows,
  rolloverOpeningPdfRowsFromClosedVariance,
} from '../utils/stocktakePeriodPdfRows';
import { downloadStocktakeVariancePdf } from '../utils/stocktakeVariancePdf';

async function loadCompany() {
  const { data: company } = await db.from('company_settings').select('*').limit(1).maybeSingle();
  return company || null;
}

/**
 * Opening, closing, and variance PDFs for a stock period (shared layout + handlers).
 */
export default function StocktakePeriodPdfActions({
  period,
  detail,
  locationName,
  busy,
  disabled,
  onToast,
  onError,
  setBusy,
}) {
  const isClosed = String(period?.status || '').toLowerCase() === 'closed';
  const hasOpeningRaw = (detail?.opening || []).some((r) => Number(r.qty || 0) > 0);
  const hasClosingRaw = (detail?.closing || []).some((r) => Number(r.qty || 0) > 0);
  // Closed-period PDFs use variance ledger (incl. imputed opening); do not gate on raw entries only.
  const hasOpening = isClosed || hasOpeningRaw;
  const hasClosing = isClosed || hasClosingRaw;

  const run = async (fn, toastMsg) => {
    if (disabled || busy) return;
    setBusy?.(true);
    onError?.('');
    try {
      await fn();
      if (toastMsg) onToast?.(toastMsg);
    } catch (err) {
      onError?.(err.message || 'Failed to build PDF');
    } finally {
      setBusy?.(false);
    }
  };

  const handleOpening = () => run(async () => {
    const company = await loadCompany();
    const rows = await resolveOpeningPdfRows({
      period,
      detail,
      getPeriodVariance,
    });
    if (!rows.length) throw new Error('No opening stock for this period yet.');
    await downloadPeriodOpeningAggregationPdf({
      period,
      rows,
      company,
      locationName,
    });
  }, 'Opening stock PDF downloaded.');

  const handleClosing = () => run(async () => {
    const company = await loadCompany();
    const rows = await resolveClosingPdfRows({
      period,
      detail,
      getPeriodVariance,
    });
    if (!rows.length) throw new Error('No closing stock for this period yet.');
    await downloadPeriodClosingAggregationPdf({
      period,
      rows,
      company,
      locationName,
    });
  }, 'Closing stock PDF downloaded.');

  const handleVariance = () => run(async () => {
    if (!period?.id) return;
    const data = await getPeriodVariance(period.id);
    await downloadStocktakeVariancePdf({
      period: data.period,
      rows: data.rows,
      company: data.company,
      locationName: data.locationName || locationName,
    });
  }, 'Variance report PDF downloaded.');

  const btnClass = 'stock-periods-btn stock-periods-btn-primary stock-periods-pdf-btn';

  return (
    <div className="stock-periods-pdf-actions" role="group" aria-label="Period PDF reports">
      <button
        type="button"
        className={btnClass}
        disabled={!hasOpening || disabled || busy}
        onClick={handleOpening}
      >
        Opening stock PDF
      </button>
      <button
        type="button"
        className={btnClass}
        disabled={!hasClosing || disabled || busy}
        onClick={handleClosing}
      >
        Closing stock PDF
      </button>
      <button
        type="button"
        className={btnClass}
        disabled={!isClosed || disabled || busy}
        onClick={handleVariance}
      >
        Variance report PDF
      </button>
    </div>
  );
}

/**
 * Auto-download after admin aggregation submit (rollover or initial).
 * LOCKED: rollover uses getPeriodVariance → same rows as manual variance/opening/closing PDFs.
 */
export async function downloadStocktakeSubmitPdfBundle({
  submitType,
  closedPeriod,
  openedPeriod,
  aggregationRows,
  locationName,
  company,
}) {
  const co = company || await loadCompany();
  const downloaded = [];

  if (submitType === 'initial' && openedPeriod) {
    const rows = periodPdfRowsFromScannedAggregation(aggregationRows || []);
    if (!rows.length) return { downloaded: [] };
    await downloadPeriodOpeningAggregationPdf({
      period: openedPeriod,
      rows,
      company: co,
      locationName,
    });
    downloaded.push('opening');
    return { downloaded };
  }

  if (submitType === 'rollover' && closedPeriod) {
    try {
      const variance = await getPeriodVariance(closedPeriod.id);
      const closingRows = periodLedgerPdfRowsFromVariance(variance.rows, 'closing');

      await downloadPeriodClosingAggregationPdf({
        period: closedPeriod,
        rows: closingRows,
        company: variance.company || co,
        locationName: variance.locationName || locationName,
      });
      downloaded.push('closing');

      if (openedPeriod) {
        const openingRows = rolloverOpeningPdfRowsFromClosedVariance(variance.rows);
        await downloadPeriodOpeningAggregationPdf({
          period: openedPeriod,
          rows: openingRows,
          company: variance.company || co,
          locationName: variance.locationName || locationName,
        });
        downloaded.push('opening');
      }

      await downloadStocktakeVariancePdf({
        period: variance.period,
        rows: variance.rows,
        company: variance.company || co,
        locationName: variance.locationName || locationName,
      });
      downloaded.push('variance');
    } catch (err) {
      console.warn('Period PDF auto-download failed', err);
    }
  }

  return { downloaded };
}
