import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import db from '../dataClient';
import { preloadBrandAssets } from './brandAssets';
import { rewriteLegacyStorageUrl } from './storageImageUrl';

function fmtUsd(amount) {
  const n = Number(amount || 0);
  const abs = Math.abs(n);
  const formatted = abs % 1 === 0
    ? abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-$ ' : '$ '}${formatted}`;
}

function loadImageFromSrc(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}

async function getCompanySettings() {
  try {
    if (typeof window !== 'undefined' && window.companySettings) {
      return window.companySettings;
    }
  } catch {}
  try {
    const { data } = await db.from('company_settings').select('*').single();
    return data || {};
  } catch {
    return {};
  }
}

function drawLogoWatermark(doc, img, pageWidth, pageHeight) {
  if (!img) return;
  try {
    doc.saveGraphicsState && doc.saveGraphicsState();
    if (doc.GState) {
      try { doc.setGState(new doc.GState({ opacity: 0.06 })); } catch {}
    }
    const maxW = pageWidth * 0.72;
    const maxH = pageHeight * 0.72;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (pageWidth - w) / 2;
    const y = (pageHeight - h) / 2;
    doc.addImage(img, 'PNG', x, y, w, h);
    doc.restoreGraphicsState && doc.restoreGraphicsState();
  } catch {}
}

function drawHeaderLogos(doc, img, margin, pageWidth) {
  if (!img) return { logoBottom: margin };
  try {
    const logoMaxW = 72;
    const logoMaxH = 72;
    const scale = Math.min(logoMaxW / img.width, logoMaxH / img.height, 1);
    const w = Math.max(24, img.width * scale);
    const h = Math.max(24, img.height * scale);
    const y = margin - 4;
    doc.addImage(img, 'PNG', margin, y, w, h);
    doc.addImage(img, 'PNG', pageWidth - margin - w, y, w, h);
    return { logoBottom: y + h };
  } catch {
    return { logoBottom: margin };
  }
}

function addPageNumbers(doc) {
  try {
    const pageCount = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 18, { align: 'center' });
    }
    doc.setTextColor(0, 0, 0);
  } catch {}
}

function fmtLedgerDisplayDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getDate()).padStart(2, '0')}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function buildLedgerPdfFilename({
  dateFrom = '',
  dateTo = '',
  periodLabel = '',
} = {}) {
  const safeFrom = (dateFrom || 'all').replace(/[^0-9-/]/g, '');
  const safeTo = (dateTo || 'all').replace(/[^0-9-/]/g, '');
  const periodPart = periodLabel
    ? `${periodLabel.replace(/[^a-zA-Z0-9]+/g, '_')}_`
    : '';
  return `Ledger_CashBook_${periodPart}${safeFrom}_to_${safeTo}.pdf`;
}

async function buildLedgerPdfDoc({
  openingBalance = 0,
  rows = [],
  dateFrom = '',
  dateTo = '',
  personFilter = '',
  periodLabel = '',
} = {}) {
  const company = await getCompanySettings();
  const companyName = company?.company_name || company?.name || 'Best Rest Furniture';
  const brand = await preloadBrandAssets({ client: db, includeStamp: false });
  const logoUrl = rewriteLegacyStorageUrl(company?.company_logo || company?.logo || '', { bucket: 'companylogos' });
  const logoImg = await loadImageFromSrc(brand?.logoSrc || logoUrl);

  const doc = new jsPDF('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  drawLogoWatermark(doc, logoImg, pageWidth, pageHeight);
  const { logoBottom } = drawHeaderLogos(doc, logoImg, margin, pageWidth);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const titleY = Math.max(logoBottom + 14, margin + 52);
  doc.text('Cashbook', pageWidth / 2, titleY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  let metaY = titleY + 18;
  doc.text(companyName, pageWidth / 2, metaY, { align: 'center' });
  metaY += 16;

  const rangeParts = [];
  if (periodLabel) rangeParts.push(periodLabel);
  if (dateFrom) rangeParts.push(`From ${dateFrom}`);
  if (dateTo) rangeParts.push(`To ${dateTo}`);
  const rangeLabel = rangeParts.length ? rangeParts.join(' · ') : 'All dates';
  doc.setFontSize(10);
  doc.text(rangeLabel, pageWidth / 2, metaY, { align: 'center' });
  metaY += 14;

  if (personFilter) {
    doc.text(`Person: ${personFilter}`, pageWidth / 2, metaY, { align: 'center' });
    metaY += 14;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Opening balance (${dateFrom || 'start'}): ${fmtUsd(openingBalance)}`, pageWidth / 2, metaY, { align: 'center' });
  metaY += 18;

  const tableBody = (rows || []).map((row) => {
    const isCredit = row.direction === 'credit';
    const deposit = isCredit ? fmtUsd(row.amount) : '';
    const payment = !isCredit ? fmtUsd(row.amount) : '';
    return [
      fmtLedgerDisplayDate(row.created_at),
      row.person_name || '—',
      row.reason || '',
      deposit,
      payment,
      fmtUsd(row.balanceAfter),
    ];
  });

  const tableWidth = pageWidth - (margin * 2);
  const columnWidths = {
    date: 72,
    person: 76,
    paidIn: 60,
    paidOut: 60,
    balance: 68,
  };
  const descriptionWidth = tableWidth
    - columnWidths.date
    - columnWidths.person
    - columnWidths.paidIn
    - columnWidths.paidOut
    - columnWidths.balance;

  autoTable(doc, {
    startY: metaY,
    head: [['Date', 'Person', 'Description', 'Paid In', 'Paid Out', 'Balance']],
    body: tableBody,
    tableWidth,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      overflow: 'linebreak',
      halign: 'center',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [0, 132, 170],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      minCellHeight: 18,
    },
    columnStyles: {
      0: { cellWidth: columnWidths.date, halign: 'center' },
      1: { cellWidth: columnWidths.person, halign: 'center' },
      2: { cellWidth: descriptionWidth, halign: 'center' },
      3: { cellWidth: columnWidths.paidIn, halign: 'center' },
      4: { cellWidth: columnWidths.paidOut, halign: 'center' },
      5: { cellWidth: columnWidths.balance, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        data.cell.styles.halign = 'center';
        data.cell.styles.valign = 'middle';
      }
    },
    alternateRowStyles: { fillColor: [250, 252, 253] },
    didDrawPage: () => {
      drawLogoWatermark(doc, logoImg, pageWidth, pageHeight);
      drawHeaderLogos(doc, logoImg, margin, pageWidth);
    },
  });

  const closingBalance = rows.length
    ? rows[rows.length - 1].balanceAfter
    : openingBalance;
  const finalY = (doc.lastAutoTable?.finalY || metaY) + 14;
  if (finalY < pageHeight - 40) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Closing balance: ${fmtUsd(closingBalance)}`, pageWidth - margin, finalY, { align: 'right' });
  }

  addPageNumbers(doc);

  return doc;
}

export async function createLedgerPdfBlob(options = {}) {
  const doc = await buildLedgerPdfDoc(options);
  const fileName = buildLedgerPdfFilename(options);
  const blob = doc.output('blob');
  return { blob, fileName };
}

export async function createLedgerPdfBase64(options = {}) {
  const doc = await buildLedgerPdfDoc(options);
  const fileName = buildLedgerPdfFilename(options);
  const dataUri = doc.output('datauristring');
  const base64 = String(dataUri || '').replace(/^data:application\/pdf;filename=.*?;base64,/i, '').replace(/^data:application\/pdf;base64,/i, '');
  return { base64, fileName };
}

/**
 * A4 portrait cash-book PDF with opening balance, running balance, logos, and watermark.
 */
export async function downloadLedgerPdf(options = {}) {
  const doc = await buildLedgerPdfDoc(options);
  const fileName = buildLedgerPdfFilename(options);
  doc.save(fileName);
  return true;
}

export default downloadLedgerPdf;
