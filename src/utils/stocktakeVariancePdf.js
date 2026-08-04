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

/**
 * Generate Stocktake Variance Report PDF (A4 portrait, blue border).
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
  const margin = 28;

  // Blue border
  doc.setDrawColor(30, 90, 180);
  doc.setLineWidth(2.5);
  doc.rect(14, 14, pageWidth - 28, pageHeight - 28);

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
  doc.setFontSize(28);
  doc.text(companyName, pageWidth / 2, 48, { align: 'center' });

  doc.setFontSize(16);
  doc.text('Stocktake Variance Report', pageWidth / 2, 78, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  let metaY = 96;
  if (locationLabel) {
    doc.text(`Location: ${locationLabel}`, pageWidth / 2, metaY, { align: 'center' });
    metaY += 14;
  }
  doc.text(`Period: ${beginLabel} to ${endLabel}`, pageWidth / 2, metaY, { align: 'center' });
  const tableStartY = metaY + 18;

  const body = (rows || []).map((r) => [
    r.sku || '',
    r.product_name || '',
    Number(r.opening_stock_qty || 0),
    Number(r.transfers_in || 0),
    Number(r.transfers_out || 0),
    Number(r.sales || 0),
    Number(r.expected_qty || 0),
    Number(r.closing_stock_qty || 0),
    Number(r.variance || 0),
    Number(r.variance_amount || 0).toFixed(2),
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [[
      'SKU',
      'PRODUCT NAME',
      'OPENING',
      'TRF IN',
      'TRF OUT',
      'SALES',
      'EXPECTED',
      'CLOSING',
      'VARIANCE',
      'VAR AMOUNT',
    ]],
    body,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [30, 90, 180], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  const filename = `Variance Report_${beginLabel}_${endLabel}.pdf`;
  doc.save(filename);
  return filename;
}
