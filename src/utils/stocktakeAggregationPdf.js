import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { rewriteLegacyStorageUrl } from './storageImageUrl';

function fmtDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || '');
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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
  const companyName = company?.company_name || company?.name || 'Best Rest Furniture';
  const logoUrl = rewriteLegacyStorageUrl(company?.company_logo || company?.logo || '', { bucket: 'companylogos' });
  const doc = new jsPDF('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;

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
  doc.setFontSize(24);
  doc.text(companyName, pageWidth / 2, 46, { align: 'center' });

  doc.setFontSize(15);
  doc.text('Stock Count Aggregation', pageWidth / 2, 72, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Location: ${locationName || '—'}`, pageWidth / 2, 92, { align: 'center' });
  doc.text(`Generated: ${fmtDateTime(generatedAt)}`, pageWidth / 2, 108, { align: 'center' });
  if (sessionLabel) {
    doc.setFontSize(10);
    doc.text(sessionLabel, pageWidth / 2, 122, { align: 'center' });
  }

  const body = (rows || []).map((row) => {
    const typeLabel = row.row_type === 'set' ? 'Set' : 'Product';
    return [
      typeLabel,
      row.sku || '',
      row.name || '',
      Number(row.qty || 0),
    ];
  });

  const totalQty = (rows || []).reduce((sum, row) => sum + Number(row.qty || 0), 0);

  autoTable(doc, {
    startY: sessionLabel ? 134 : 120,
    head: [['TYPE', 'SKU', 'PRODUCT / SET', 'QTY']],
    body,
    foot: [['', '', 'TOTAL LINES', String((rows || []).length)], ['', '', 'SUM OF QTY', String(totalQty)]],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 90, 180], textColor: 255 },
    footStyles: { fillColor: [240, 244, 250], textColor: [20, 20, 20], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 52 },
      3: { halign: 'right' },
    },
  });

  const safeLocation = String(locationName || 'location').replace(/[^\w-]+/g, '_');
  const stamp = fmtDateTime(generatedAt).replace(/[,: ]+/g, '_');
  doc.save(`Stock_Aggregation_${safeLocation}_${stamp}.pdf`);
}
