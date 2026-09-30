import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { rewriteLegacyStorageUrl } from './storageImageUrl';

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function fmtQty(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
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

  doc.setDrawColor(30, 90, 180);
  doc.setLineWidth(2);
  doc.rect(14, 14, pageWidth - 28, pageHeight - 28);

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
  if (periodLine) {
    doc.text(periodLine, pageWidth / 2, metaY, { align: 'center' });
    metaY += 14;
  }
  if (subtitle) {
    doc.setFontSize(10);
    doc.text(subtitle, pageWidth / 2, metaY, { align: 'center' });
    metaY += 14;
  }
  if (footnote) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(footnote, pageWidth / 2, metaY, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    metaY += 14;
  }

  return { margin, metaY, pageWidth };
}

/**
 * Stocktake variance PDF — simple ledger columns per product.
 */
export async function downloadStocktakeVariancePdf({ period, rows, company, locationName }) {
  const begin = period?.begin_period_date || period?.opened_at;
  const end = period?.end_period_date || period?.closed_at;
  const beginLabel = fmtDate(begin);
  const endLabel = fmtDate(end);
  const locationLabel = locationName || period?.location_name || '';

  const doc = new jsPDF('p', 'pt', 'a4');
  const { margin, metaY } = await drawStocktakeReportHeader(doc, {
    company,
    title: 'Stocktake Variance Report',
    locationLabel,
    periodLine: `Period: ${beginLabel} to ${endLabel}`,
    footnote: 'Opening Stock + Inventory In − Inventory Out → Current Stock (counted)',
  });

  const body = (rows || []).map((r) => [
    r.sku || '',
    r.product_name || '',
    fmtQty(r.opening_stock_qty),
    fmtQty(r.inventory_in),
    fmtQty(r.inventory_out),
    fmtQty(r.closing_stock_qty),
    fmtQty(r.variance),
  ]);

  autoTable(doc, {
    startY: metaY + 16,
    head: [[
      'SKU',
      'PRODUCT',
      'OPENING',
      'INV IN',
      'INV OUT',
      'CURRENT',
      'VARIANCE',
    ]],
    body,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 90, 180], textColor: 255, fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 48 },
      3: { halign: 'right', cellWidth: 44 },
      4: { halign: 'right', cellWidth: 48 },
      5: { halign: 'right', cellWidth: 52 },
      6: { halign: 'right', cellWidth: 52 },
    },
    margin: { left: margin, right: margin },
  });

  const filename = `Variance Report_${beginLabel}_${endLabel}.pdf`;
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
  const beginLabel = fmtDate(begin);
  const asOfLabel = fmtDate(generatedAt || new Date());
  const locationLabel = locationName || period?.location_name || '';
  const rowList = rows || [];

  report(5, 'Creating PDF document…');
  const doc = new jsPDF('p', 'pt', 'a4');
  report(15, 'Drawing header…');
  const { margin, metaY } = await drawStocktakeReportHeader(doc, {
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
      fmtQty(r.opening_stock_qty),
      fmtQty(r.transfers_in),
      fmtQty(r.sales),
      fmtQty(r.closing_stock_qty),
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
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 90, 180], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 52 },
      3: { halign: 'right', cellWidth: 48 },
      4: { halign: 'right', cellWidth: 40 },
      5: { halign: 'right', cellWidth: 52 },
      6: { halign: 'center', cellWidth: 32 },
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

  report(92, 'Saving PDF file…');
  await yieldToMain();
  const safeLocation = (locationLabel || 'location').replace(/[^\w-]+/g, '_');
  const filename = `Count Sheet_${safeLocation}_${asOfLabel}.pdf`;
  doc.save(filename);
  report(100, 'Download started — check your browser downloads.');
  return filename;
}
