import React from 'react';
import db from '../dataClient';
import {
  computeOpeningAggregationForPeriod,
  getPeriodVariance,
} from '../services/stocktake';
import {
  downloadPeriodClosingAggregationPdf,
  downloadPeriodOpeningAggregationPdf,
} from '../utils/stocktakeAggregationPdf';
import { downloadStocktakeVariancePdf } from '../utils/stocktakeVariancePdf';

async function loadCompany() {
  const { data: company } = await db.from('company_settings').select('*').limit(1).maybeSingle();
  return company || null;
}

async function resolveOpeningRows(detail) {
  let rows = detail?.opening_aggregation || [];
  const opening = (detail?.opening || []).filter((r) => Number(r.qty || 0) > 0);
  if (!rows.length && opening.length) {
    rows = await computeOpeningAggregationForPeriod(detail.period, opening);
  }
  return rows;
}

async function resolveClosingRows(detail) {
  let rows = detail?.closing_aggregation || [];
  const closing = (detail?.closing || []).filter((r) => Number(r.qty || 0) > 0);
  if (!rows.length && closing.length) {
    rows = await computeOpeningAggregationForPeriod(detail.period, closing);
  }
  return rows;
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
  const hasOpening = (detail?.opening_aggregation || []).length > 0
    || (detail?.opening || []).some((r) => Number(r.qty || 0) > 0);
  const hasClosing = (detail?.closing || []).some((r) => Number(r.qty || 0) > 0);

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
    const rows = await resolveOpeningRows(detail);
    if (!rows.length) throw new Error('No opening stock for this period yet.');
    const company = await loadCompany();
    await downloadPeriodOpeningAggregationPdf({
      period,
      rows,
      company,
      locationName,
    });
  }, 'Opening stock PDF downloaded.');

  const handleClosing = () => run(async () => {
    const rows = await resolveClosingRows(detail);
    if (!rows.length) throw new Error('No closing stock for this period yet.');
    const company = await loadCompany();
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

/** Auto-download after admin aggregation submit (rollover or initial). */
export async function downloadStocktakeSubmitPdfBundle({
  submitType,
  closedPeriod,
  openedPeriod,
  aggregationRows,
  locationName,
  company,
}) {
  const co = company || await loadCompany();
  const rows = aggregationRows || [];
  if (!rows.length) return { downloaded: [] };

  const downloaded = [];

  if (submitType === 'initial' && openedPeriod) {
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
    await downloadPeriodClosingAggregationPdf({
      period: closedPeriod,
      rows,
      company: co,
      locationName,
    });
    downloaded.push('closing');

    if (openedPeriod) {
      await downloadPeriodOpeningAggregationPdf({
        period: openedPeriod,
        rows,
        company: co,
        locationName,
      });
      downloaded.push('opening');
    }

    try {
      const variance = await getPeriodVariance(closedPeriod.id);
      await downloadStocktakeVariancePdf({
        period: variance.period,
        rows: variance.rows,
        company: variance.company || co,
        locationName: variance.locationName || locationName,
      });
      downloaded.push('variance');
    } catch (err) {
      console.warn('Variance PDF auto-download failed', err);
    }
  }

  return { downloaded };
}
