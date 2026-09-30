import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { rewriteLegacyStorageUrl } from './storageImageUrl';
import { appendStocktakePageNumbers } from './stocktakePdfPageNumbers';
import { renderSegmentedStocktakeTable } from './stocktakePdfSetGroups';
import { drawStocktakeApprovalSignatures } from './stocktakePdfSignatures';
import { fmtStocktakeCurrency, fmtStocktakeQty } from './stocktakePdfFormat';
import { planSetPriceCellMerges } from './stocktakeSetComponentPricing';

function fmtDateFile(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Period stamp with date and time (24h, en-GB — matches stocktake period UI). */
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

function formatStocktakePeriodRange(begin, end) {
  const a = fmtDateTime(begin);
  const b = fmtDateTime(end);
  if (a && b) return `Period: ${a} to ${b}`;
  if (a) return `Period: ${a}`;
  return '';
}

function loadImage(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timer);
      finish(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    img.src = url;
  });
}

function resolveRowDisplayPrice(row) {
  const display = Number(row?.display_unit_price);
  if (Number.isFinite(display) && display > 0) return display;
  const direct = Number(row?.unit_price);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const variance = Number(row?.variance ?? 0);
  if (variance !== 0) {
    const amount = Number(row?.variance_amount ?? 0);
    if (Number.isFinite(amount)) return amount / variance;
  }
  const fallback = Number(row?.unit_price ?? 0) || 0;
  return fallback > 0 ? fallback : '';
}

function buildVariancePdfTableBody(rows) {
  const dataRows = (rows || []).filter((r) => r.row_type !== 'set_header');
  const mergePlan = planSetPriceCellMerges(dataRows, resolveRowDisplayPrice);
  let totalAmount = 0;

  const body = dataRows.map((r, index) => {
    const current = r.current_stock_qty ?? (
      Number(r.opening_stock_qty || 0) + Number(r.transfers_in || 0) - Number(r.sales || 0)
    );
    const amount = Number(r.variance_amount ?? 0);
    if (Number.isFinite(amount)) totalAmount += amount;

    const leading = [
      r.sku || '',
      r.product_name || '',
      fmtStocktakeQty(r.opening_stock_qty),
      fmtStocktakeQty(r.transfers_in),
      fmtStocktakeQty(r.sales),
      fmtStocktakeQty(current),
      fmtStocktakeQty(r.closing_stock_qty),
    ];
    const tail = [
      fmtStocktakeQty(r.variance),
      fmtStocktakeCurrency(amount),
    ];

    const cellPlan = mergePlan[index];
    if (cellPlan?.kind === 'mergeContinue') {
      return [...leading, ...tail];
    }
    if (cellPlan?.kind === 'mergeStart') {
      const priceText = cellPlan.price === '' || cellPlan.price == null
        ? ''
        : fmtStocktakeCurrency(cellPlan.price);
      const priceCell = {
        content: priceText,
        rowSpan: cellPlan.rowSpan,
        styles: { valign: 'middle', halign: 'center', fillColor: [255, 255, 255] },
      };
      return [...leading, priceCell, ...tail];
    }

    const displayPrice = resolveRowDisplayPrice(r);
    const priceCell = displayPrice === '' ? '' : fmtStocktakeCurrency(displayPrice);
    return [...leading, priceCell, ...tail];
  });

  return { body, totalAmount };
}

/** Centered lines with normal word spacing (no justify stretch). Returns Y after last line. */
function drawCenteredWrappedText(doc, text, centerX, startY, maxWidth, lineHeight = 11) {
  const paragraphs = String(text || '').split(/\n/);
  let y = startY;
  paragraphs.forEach((paragraph) => {
    const lines = doc.splitTextToSize(paragraph, maxWidth);
    if (!lines.length) {
      y += lineHeight;
      return;
    }
    lines.forEach((line) => {
      doc.text(line, centerX, y, { align: 'center' });
      y += lineHeight;
    });
  });
  return y;
}

async function drawStocktakeReportHeader(doc, {
  company,
  title,
  subtitle,
  locationLabel,
  periodLine,
  footnote,
}) {
  const companyName = company?.company_name || company?.name || 'Best Rest Furniture';
  const logoUrl = rewriteLegacyStorageUrl(company?.company_logo || company?.logo || '', { bucket: 'companylogos' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;

  const logoImg = await loadImage(logoUrl);
  if (logoImg) {
    try {
      const ratio = Math.min(60 / logoImg.width, 40 / logoImg.height);
      doc.addImage(logoImg, 'PNG', margin, 20, logoImg.width * ratio, logoImg.height * ratio);
    } catch {
      // ignore logo failures
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(companyName, pageWidth / 2, 44, { align: 'center' });

  doc.setFontSize(14);
  doc.text(title, pageWidth / 2, 68, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let metaY = 86;
  if (locationLabel) {
    doc.text(`Location: ${locationLabel}`, pageWidth / 2, metaY, { align: 'center' });
    metaY += 14;
  }
  const metaMaxWidth = pageWidth - margin * 2 - 8;
  if (periodLine) {
    metaY = drawCenteredWrappedText(doc, periodLine, pageWidth / 2, metaY, metaMaxWidth, 12);
    metaY += 4;
  }
  if (subtitle) {
    doc.setFontSize(10);
    metaY = drawCenteredWrappedText(doc, subtitle, pageWidth / 2, metaY, metaMaxWidth, 12);
    metaY += 4;
  }
  if (footnote) {
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    metaY = drawCenteredWrappedText(doc, footnote, pageWidth / 2, metaY, metaMaxWidth, 10);
    doc.setTextColor(0, 0, 0);
    metaY += 4;
  }

  return { margin, metaY, pageWidth };
}

/**
 * Stocktake variance PDF — simple ledger columns per product.
 */
export async function downloadStocktakeVariancePdf({ period, rows, company, locationName }) {
  const begin = period?.begin_period_date || period?.opened_at;
  const end = period?.end_period_date || period?.closed_at;
  const beginLabel = fmtDateFile(begin);
  const endLabel = fmtDateFile(end);
  const locationLabel = locationName || period?.location_name || '';

  const doc = new jsPDF('l', 'pt', 'a4');
  const { margin, metaY, pageWidth } = await drawStocktakeReportHeader(doc, {
    company,
    title: 'Stocktake Variance Report',
    locationLabel,
    periodLine: formatStocktakePeriodRange(begin, end),
    footnote: 'Current = Opening + Transfers In − Sales.\nVariance Qty = Closing (counted) − Current.\nAmount = unit price × variance (promo when active, else standard).',
  });

  const { body, totalAmount } = buildVariancePdfTableBody(rows);

  const tableEndY = renderSegmentedStocktakeTable(doc, {
    startY: metaY + 12,
    margin,
    colSpan: 10,
    head: [[
      'SKU',
      'Product',
      'Open',
      'Trans In',
      'Sales',
      'Current',
      'Closing',
      'Price',
      'Variance',
      'Amount',
    ]],
    body,
    foot: [[
      { content: '', colSpan: 8 },
      { content: 'Total', styles: { halign: 'center', fontStyle: 'bold' } },
      { content: fmtStocktakeCurrency(totalAmount), styles: { halign: 'center', fontStyle: 'bold' } },
    ]],
    tableOptions: {
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak', halign: 'center', valign: 'middle' },
      headStyles: {
        fillColor: [30, 90, 180],
        textColor: 255,
        fontSize: 7.5,
        halign: 'center',
        valign: 'middle',
        lineColor: [30, 90, 180],
      },
      footStyles: {
        fillColor: [255, 255, 255],
        textColor: [20, 20, 20],
        fontStyle: 'bold',
        halign: 'center',
        lineColor: [140, 140, 140],
      },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 36 },
        3: { cellWidth: 40 },
        4: { cellWidth: 36 },
        5: { cellWidth: 42 },
        6: { cellWidth: 42 },
        7: { cellWidth: 52 },
        8: { cellWidth: 44 },
        9: { cellWidth: 56 },
      },
      tableWidth: pageWidth - margin * 2,
    },
  }) ?? metaY + 16;
  doc.setPage(doc.internal.getNumberOfPages());
  drawStocktakeApprovalSignatures(doc, tableEndY + 22, margin, pageWidth);
  appendStocktakePageNumbers(doc);

  const filename = `Variance Report_${beginLabel}_${endLabel}.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * Products-list period stock PDF — Opening + Stock In − Sales = Current.
 */
export async function downloadProductsListVariancePdf({
  period,
  rows,
  company,
  locationName,
  filterLabel,
}) {
  const begin = period?.begin_period_date || period?.opened_at;
  const end = period?.end_period_date || period?.closed_at;
  const beginLabel = fmtDateFile(begin);
  const endLabel = fmtDateFile(end) || 'Open';
  const locationLabel = locationName || period?.location_name || '';
  const scopeLine = filterLabel ? `Scope: ${filterLabel}` : '';

  const doc = new jsPDF('p', 'pt', 'a4');
  const { margin, metaY } = await drawStocktakeReportHeader(doc, {
    company,
    title: 'Product List Stock Report',
    subtitle: scopeLine,
    locationLabel,
    periodLine: `Period: ${beginLabel} to ${endLabel}`,
    footnote: 'Opening + Stock In - Sales = Current Stock.\nStock In = inventory adjustments in + transfers in.',
  });

  const body = (rows || []).map((r) => [
    r.sku || '',
    r.product_name || '',
    fmtStocktakeQty(r.opening_stock_qty),
    fmtStocktakeQty(r.stock_in ?? r.adjustments_add),
    fmtStocktakeQty(r.sales),
    fmtStocktakeQty(r.current_stock_qty),
  ]);

  autoTable(doc, {
    startY: metaY + 16,
    head: [[
      'SKU',
      'Product',
      'Opening',
      'Stock In',
      'Sales',
      'Current',
    ]],
    body,
    styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak', halign: 'center', valign: 'middle' },
    headStyles: {
      fillColor: [30, 90, 180],
      textColor: 255,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      overflow: 'linebreak',
      cellWidth: 'wrap',
    },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 52 },
      3: { cellWidth: 52 },
      4: { cellWidth: 48 },
      5: { cellWidth: 52 },
    },
    margin: { left: margin, right: margin },
  });

  const safeScope = (filterLabel || 'filtered').replace(/[^\w-]+/g, '_').slice(0, 40);
  const filename = `Products_Variance_${beginLabel}_${safeScope}.pdf`;
  doc.save(filename);
  return filename;
}

const TICK_COLUMN_INDEX = 6;

/**
 * Pre-close count sheet — same layout as variance PDF, with system CURRENT and a blank tick box per row.
 */
function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export async function downloadStocktakeCountSheetPdf({
  period,
  rows,
  company,
  locationName,
  generatedAt,
  onProgress,
}) {
  const report = (pct, label) => onProgress?.({ phase: 'pdf', pct, label });
  const begin = period?.begin_period_date || period?.opened_at;
  const beginLabel = fmtDateFile(begin);
  const asOfLabel = fmtDateFile(generatedAt || new Date());
  const locationLabel = locationName || period?.location_name || '';
  const rowList = rows || [];

  report(5, 'Creating PDF document…');
  const doc = new jsPDF('p', 'pt', 'a4');
  report(15, 'Drawing header…');
  const { margin, metaY, pageWidth } = await drawStocktakeReportHeader(doc, {
    company,
    title: 'Stock Count Sheet',
    locationLabel,
    periodLine: `Period began: ${beginLabel} · System stock as at ${asOfLabel}`,
    footnote: 'Tick each row after you have physically verified that line. Current Stock = system stock before closing counts.',
  });

  const body = [];
  for (let i = 0; i < rowList.length; i += 1) {
    const r = rowList[i];
    body.push([
      r.sku || '',
      r.product_name || '',
      fmtStocktakeQty(r.opening_stock_qty),
      fmtStocktakeQty(r.transfers_in),
      fmtStocktakeQty(r.sales),
      fmtStocktakeQty(r.closing_stock_qty),
      '',
    ]);
    if (rowList.length > 80 && (i % 50 === 0 || i === rowList.length - 1)) {
      const pct = 20 + Math.floor(((i + 1) / rowList.length) * 45);
      report(pct, `Preparing rows ${i + 1} of ${rowList.length}…`);
      await yieldToMain();
    }
  }

  report(70, `Rendering table (${rowList.length} lines)…`);
  await yieldToMain();

  autoTable(doc, {
    startY: metaY + 16,
    head: [[
      'SKU',
      'Product',
      'Opening Stock',
      'Transfer In',
      'Sales',
      'Current Stock',
      'Tick',
    ]],
    body,
    styles: { fontSize: 9, cellPadding: 4, halign: 'center', valign: 'middle' },
    headStyles: {
      fillColor: [30, 90, 180],
      textColor: 255,
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 52 },
      3: { cellWidth: 48 },
      4: { cellWidth: 40 },
      5: { cellWidth: 52 },
      6: { cellWidth: 32 },
    },
    margin: { left: margin, right: margin },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== TICK_COLUMN_INDEX) return;
      const size = 11;
      const x = data.cell.x + (data.cell.width - size) / 2;
      const y = data.cell.y + (data.cell.height - size) / 2;
      doc.setDrawColor(40, 40, 40);
      doc.setLineWidth(0.75);
      doc.rect(x, y, size, size);
    },
  });

  const tableEndY = doc.lastAutoTable?.finalY ?? metaY + 16;
  doc.setPage(doc.internal.getNumberOfPages());
  drawStocktakeApprovalSignatures(doc, tableEndY + 22, margin, pageWidth);
  appendStocktakePageNumbers(doc);

  report(92, 'Saving PDF file…');
  await yieldToMain();
  const safeLocation = (locationLabel || 'location').replace(/[^\w-]+/g, '_');
  const filename = `Count Sheet_${safeLocation}_${asOfLabel}.pdf`;
  doc.save(filename);
  report(100, 'Download started — check your browser downloads.');
  return filename;
}
