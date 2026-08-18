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

function fmtQty(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
}

/**
 * Stocktake variance PDF — simple ledger columns per product.
 */
export async function downloadStocktakeVariancePdf({ period, rows, company, locationName }) {
  const companyName = company?.company_name || company?.name || 'Best Rest Furniture';
  const logoUrl = rewriteLegacyStorageUrl(company?.company_logo || company?.logo || '', { bucket: 'companylogos' });
  const begin = period?.begin_period_date || period?.opened_at;
  const end = period?.end_period_date || period?.closed_at;
  const beginLabel = fmtDate(begin);
  const endLabel = fmtDate(end);
  const locationLabel = locationName || period?.location_name || '';

  const doc = new jsPDF('p', 'pt', 'a4');
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
  doc.text('Stocktake Variance Report', pageWidth / 2, 68, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let metaY = 86;
  if (locationLabel) {
    doc.text(`Location: ${locationLabel}`, pageWidth / 2, metaY, { align: 'center' });
    metaY += 14;
  }
  doc.text(`Period: ${beginLabel} to ${endLabel}`, pageWidth / 2, metaY, { align: 'center' });
  metaY += 14;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('Opening Stock + Inventory In − Inventory Out → Current Stock (counted)', pageWidth / 2, metaY, { align: 'center' });
  doc.setTextColor(0, 0, 0);

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
