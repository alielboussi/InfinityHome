import jsPDF from 'jspdf';
import { rewriteLegacyStorageUrl } from './storageImageUrl';
import { formatStockPeriodRange } from './stocktakePeriodDisplay';
import {
  countPeriodLedgerProductLines,
  sumPeriodLedgerQty,
} from './periodPdfFromVariance';
import { appendStocktakePageNumbers } from './stocktakePdfPageNumbers';
import { renderSegmentedStocktakeTable } from './stocktakePdfSetGroups';
import {
  drawStocktakeApprovalSignatures,
  pdfSignatureBottomLimit,
  stocktakeSignatureBlockHeight,
  SIGNATURE_BOX_HEIGHT_PT,
} from './stocktakePdfSignatures';

function fmtDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || '');
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

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function aggregationTableBody(rows) {
  return (rows || [])
    .filter((row) => row.row_type !== 'set_header')
    .map((row) => [
      row.sku || '',
      row.name || row.product_name || '',
      Number(row.qty || 0),
    ]);
}

async function drawAggregationHeader(doc, {
  company,
  title,
  locationName,
  periodLine,
  subtitle,
}) {
  const companyName = company?.company_name || company?.name || 'Best Rest Furniture';
  const logoUrl = rewriteLegacyStorageUrl(company?.company_logo || company?.logo || '', { bucket: 'companylogos' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;

  const logoImg = await loadImage(logoUrl);
  if (logoImg) {
    try {
      const maxW = 70;
      const maxH = 48;
      const ratio = Math.min(maxW / logoImg.width, maxH / logoImg.height);
      doc.addImage(logoImg, 'PNG', margin, 22, logoImg.width * ratio, logoImg.height * ratio);
    } catch {
      // ignore logo failures
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(companyName, pageWidth / 2, 46, { align: 'center' });

  doc.setFontSize(15);
  doc.text(title, pageWidth / 2, 72, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  let metaY = 92;
  if (locationName) {
    doc.text(`Location: ${locationName}`, pageWidth / 2, metaY, { align: 'center' });
    metaY += 16;
  }
  if (periodLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(periodLine, pageWidth / 2, metaY, { align: 'center' });
    metaY += 16;
  }
  if (subtitle) {
    doc.setFontSize(10);
    doc.text(subtitle, pageWidth / 2, metaY, { align: 'center' });
    metaY += 14;
  }

  return { margin, metaY, pageWidth };
}

function renderAggregationTable(doc, { rows, startY, margin }) {
  const body = aggregationTableBody(rows);
  const lineCount = countPeriodLedgerProductLines(rows);
  const totalQty = sumPeriodLedgerQty(rows);

  return renderSegmentedStocktakeTable(doc, {
    startY,
    margin,
    colSpan: 3,
    head: [['SKU', 'PRODUCT', 'QTY']],
    body,
    foot: [['', 'TOTAL LINES', String(lineCount)], ['', 'SUM OF QTY', String(totalQty)]],
    tableOptions: {
      styles: { fontSize: 8, cellPadding: 3, halign: 'center', valign: 'middle' },
      headStyles: {
        fillColor: [30, 90, 180],
        textColor: 255,
        halign: 'center',
        valign: 'middle',
      },
      footStyles: {
        fillColor: [255, 255, 255],
        textColor: [20, 20, 20],
        fontStyle: 'bold',
        halign: 'center',
        lineColor: [140, 140, 140],
      },
      columnStyles: {
        0: { cellWidth: 72 },
        2: { cellWidth: 48 },
      },
    },
  });
}

function finalizeAggregationPdf(doc, tableEndY, margin, pageWidth) {
  appendAggregationSignOff(doc, tableEndY, margin, pageWidth);
  appendStocktakePageNumbers(doc);
}

/**
 * Professional PDF of aggregated stocktake counts (pre-submit review).
 */
export async function downloadStocktakeAggregationPdf({
  locationName,
  sessionLabel,
  rows,
  company,
  generatedAt = new Date(),
}) {
  const doc = new jsPDF('p', 'pt', 'a4');
  const { margin, metaY, pageWidth } = await drawAggregationHeader(doc, {
    company,
    title: 'Stock Count Aggregation',
    locationName,
    subtitle: sessionLabel ? sessionLabel : `Generated: ${fmtDateTime(generatedAt)}`,
  });

  const tableEndY = renderAggregationTable(doc, { rows, startY: metaY + 8, margin });
  finalizeAggregationPdf(doc, tableEndY, margin, pageWidth);

  const safeLocation = String(locationName || 'location').replace(/[^\w-]+/g, '_');
  const stamp = fmtDateTime(generatedAt).replace(/[,: ]+/g, '_');
  doc.save(`Stock_Aggregation_${safeLocation}_${stamp}.pdf`);
}

function appendAggregationSignOff(doc, tableEndY, margin, pageWidth) {
  const headingBlock = 14;
  const gapBeforeSignatures = 20;
  const bottomLimit = pdfSignatureBottomLimit(doc, margin);
  let y = tableEndY + 24;
  doc.setPage(doc.internal.getNumberOfPages());
  const blockNeed = headingBlock + gapBeforeSignatures + stocktakeSignatureBlockHeight(SIGNATURE_BOX_HEIGHT_PT);
  if (y + blockNeed > bottomLimit) {
    doc.addPage();
    y = margin + 12;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Sign-off', pageWidth / 2, y, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Print name on the line, then sign in the box.', pageWidth / 2, y + 11, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  drawStocktakeApprovalSignatures(doc, y + headingBlock + gapBeforeSignatures, margin, pageWidth);
}

/**
 * Opening stock for a closed/open period — aggregation layout with signature blocks for sign-off.
 */
export async function downloadPeriodOpeningAggregationPdf({
  period,
  rows,
  company,
  locationName,
}) {
  const doc = new jsPDF('p', 'pt', 'a4');
  const periodLine = formatStockPeriodRange(period);
  const { margin, metaY, pageWidth } = await drawAggregationHeader(doc, {
    company,
    title: 'Opening Stock',
    locationName,
    periodLine,
    subtitle: 'Please sign below after verifying counts.',
  });

  const tableEndY = renderAggregationTable(doc, { rows, startY: metaY + 8, margin });
  finalizeAggregationPdf(doc, tableEndY, margin, pageWidth);

  const begin = period?.begin_period_date || period?.opened_at;
  const beginStamp = begin ? fmtDateTime(begin).replace(/[,: ]+/g, '_') : 'period';
  const safeLocation = String(locationName || 'location').replace(/[^\w-]+/g, '_');
  doc.save(`Opening_Aggregation_${safeLocation}_${beginStamp}.pdf`);
}

/**
 * Closing stock counted at period end — same aggregation layout as opening (signatures).
 */
export async function downloadPeriodClosingAggregationPdf({
  period,
  rows,
  company,
  locationName,
}) {
  const doc = new jsPDF('p', 'pt', 'a4');
  const periodLine = formatStockPeriodRange(period);
  const { margin, metaY, pageWidth } = await drawAggregationHeader(doc, {
    company,
    title: 'Closing Stock',
    locationName,
    periodLine,
    subtitle: 'Counted quantities at period close — please sign below after verifying.',
  });

  const tableEndY = renderAggregationTable(doc, { rows, startY: metaY + 8, margin });
  finalizeAggregationPdf(doc, tableEndY, margin, pageWidth);

  const end = period?.end_period_date || period?.closed_at || period?.begin_period_date;
  const endStamp = end ? fmtDateTime(end).replace(/[,: ]+/g, '_') : 'period';
  const safeLocation = String(locationName || 'location').replace(/[^\w-]+/g, '_');
  doc.save(`Closing_Aggregation_${safeLocation}_${endStamp}.pdf`);
}
