/**
 * Generate variance PDF for a closed stock period (uses fixed buildVarianceRows).
 * node scripts/generateStocktakeVariancePdf.js [periodId] [outputPath]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDataClient } from '../server/lib/getDataClient.js';
import { buildVarianceRows } from '../server/lib/stocktakeVarianceRows.js';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const DEFAULT_PERIOD = '1db65892-44f1-4bf8-8c9a-1b9e3d20e920';

function fmtQty(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
}

function fmtMoney(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

async function main() {
  const periodId = process.argv[2] || DEFAULT_PERIOD;
  const outArg = process.argv[3];
  const db = getDataClient();

  const { data: period, error: pErr } = await db.from('stock_periods').select('*').eq('id', periodId).maybeSingle();
  if (pErr) throw pErr;
  if (!period) throw new Error(`Period not found: ${periodId}`);
  if (period.status !== 'closed') throw new Error('Period must be closed');

  const rows = await buildVarianceRows(db, period);
  const periodForReport = { ...period };
  const nonZeroVar = rows.filter((r) => Number(r.variance || 0) !== 0);
  console.log('Variance rows:', rows.length, 'non-zero variance:', nonZeroVar.length);
  nonZeroVar.forEach((r) => {
    console.log(
      ' ',
      r.sku,
      r.product_name?.slice(0, 40),
      'open',
      r.opening_stock_qty,
      'sales',
      r.sales,
      'close',
      r.closing_stock_qty,
      'var',
      r.variance,
    );
  });

  const { data: company } = await db.from('company_settings').select('*').limit(1).maybeSingle();
  const { data: location } = await db
    .from('locations')
    .select('id, name')
    .eq('id', period.location_id)
    .maybeSingle();

  const begin = periodForReport.begin_period_date || periodForReport.opened_at;
  const end = periodForReport.end_period_date || periodForReport.closed_at;
  const periodLine = `Period: ${fmtDateTime(begin)} to ${fmtDateTime(end)}`;
  const companyName = company?.company_name || company?.name || 'Best Rest Furniture';

  const doc = new jsPDF('l', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 32;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(companyName, pageWidth / 2, 40, { align: 'center' });
  doc.setFontSize(14);
  doc.text('Stocktake Variance Report', pageWidth / 2, 58, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Location: ${location?.name || ''}`, pageWidth / 2, 76, { align: 'center' });
  doc.text(periodLine, pageWidth / 2, 92, { align: 'center' });
  doc.setFontSize(8);
  doc.text(
    'Current = Opening + Transfers In − Sales. Variance Qty = Closing − Current. Amount = unit price × variance.',
    pageWidth / 2,
    108,
    { align: 'center', maxWidth: pageWidth - margin * 2 },
  );

  const body = rows.map((r) => [
    r.sku || '',
    r.product_name || '',
    fmtQty(r.opening_stock_qty),
    fmtQty(r.transfers_in),
    fmtQty(r.sales),
    fmtQty(r.current_stock_qty),
    fmtQty(r.closing_stock_qty),
    fmtQty(r.variance),
    fmtMoney(r.variance_amount),
  ]);

  doc.autoTable({
    startY: 120,
    head: [['SKU', 'Product', 'Open', 'Trans In', 'Sales', 'Current', 'Closing', 'Var', 'Amount']],
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 90, 180], textColor: 255, fontSize: 7 },
    margin: { left: margin, right: margin },
  });

  const dir = path.dirname(fileURLToPath(import.meta.url));
  const defaultName = `Variance_Lusaka_${String(begin).slice(0, 10)}_${String(end).slice(0, 10)}.pdf`;
  const outPath = outArg
    ? path.resolve(outArg)
    : path.resolve(dir, '..', defaultName);
  const pdfBuf = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(outPath, pdfBuf);
  console.log('Wrote', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
