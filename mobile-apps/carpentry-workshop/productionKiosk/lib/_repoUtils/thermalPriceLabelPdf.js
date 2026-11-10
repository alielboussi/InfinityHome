import { jsPDF } from 'jspdf';

export const THERMAL_LABEL_WIDTH_MM = 80;
export const THERMAL_LABEL_HEIGHT_MM = 68;
const SIDE_MARGIN_MM = 2;

function wrapLines(text, maxChars = 24, maxLines = 2) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
      return;
    }
    lines.push(current);
    current = word;
    if (lines.length >= maxLines) current = '';
  });
  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines);
}

export function formatThermalLabelPrice(value, currency) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  const cur = String(currency || '').trim().toUpperCase();
  const sym = cur === 'USD' || cur === '$' ? '$' : 'K';
  return `${sym} ${Math.round(num).toLocaleString('en-US')}`;
}

export function thermalLabelHasPromo(standard, promo, printStandardOnly) {
  if (printStandardOnly) return false;
  const promoNum = Number(promo);
  const standardNum = Number(standard);
  if (!Number.isFinite(promoNum) || promoNum <= 0) return false;
  if (Number.isFinite(standardNum) && standardNum > 0 && promoNum >= standardNum) return false;
  return true;
}

function drawBarcodePreview(doc, sku, centerX, y, widthMm, heightMm) {
  const skuText = String(sku || '').trim();
  const barAreaW = widthMm * 0.72;
  const x0 = centerX - barAreaW / 2;
  const barCount = Math.max(48, Math.min(96, skuText.length * 4));
  const barW = barAreaW / barCount;
  let seed = 0;
  for (let i = 0; i < skuText.length; i += 1) seed += skuText.charCodeAt(i);

  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < barCount; i += 1) {
    if ((seed + i * 11) % 4 === 0) continue;
    doc.rect(x0 + i * barW, y, barW * 0.85, heightMm, 'F');
  }
}

function drawSingleThermalPriceLabel(doc, item, meta = {}) {
  const w = THERMAL_LABEL_WIDTH_MM;
  const h = THERMAL_LABEL_HEIGHT_MM;
  const m = SIDE_MARGIN_MM;
  const innerW = w - m * 2;
  const cx = w / 2;

  const printDate = meta.printDate || new Date().toLocaleDateString('en-GB');
  const printedBy = String(meta.printedBy || '').trim();

  const nameLines = wrapLines(item.name);
  const standardText = formatThermalLabelPrice(item.standard, item.currency);
  const promoText = formatThermalLabelPrice(item.promo, item.currency);
  const printStandardOnly = Boolean(item.printStandardOnly);
  const hasPromo = thermalLabelHasPromo(item.standard, item.promo, printStandardOnly);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(m, m, innerW, h - m * 2);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Bestrest Furniture', cx, 8, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(nameLines[0] || '', cx, 14.5, { align: 'center', maxWidth: innerW - 2 });
  if (nameLines[1]) {
    doc.text(nameLines[1], cx, 18.5, { align: 'center', maxWidth: innerW - 2 });
  }

  const barcodeY = 22;
  const barcodeH = 10;
  drawBarcodePreview(doc, item.sku, cx, barcodeY, innerW - 4, barcodeH);

  doc.setFontSize(7);
  doc.text(String(item.sku || ''), cx, barcodeY + barcodeH + 3.5, { align: 'center' });

  if (hasPromo && standardText && promoText) {
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(`Was: ${standardText}`, cx, h - 22, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`PROMO ${promoText}`, cx, h - 16, { align: 'center' });
  } else if (hasPromo && promoText) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`PROMO ${promoText}`, cx, h - 17, { align: 'center' });
  } else if (standardText) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(standardText, cx, h - 17, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(90, 90, 90);
  doc.text(printDate, cx, h - 9, { align: 'center' });
  if (printedBy) {
    doc.setFontSize(5.5);
    doc.text(printedBy, cx, h - 5.5, { align: 'center', maxWidth: innerW - 2 });
  }
}

/**
 * One PDF page per label copy (matches label worker behaviour).
 * @param {Array<object>} items — name, sku, qty, standard, promo, currency, printStandardOnly
 * @param {object} [meta] — printDate, printedBy, title
 * @returns {Blob}
 */
export function buildThermalPriceLabelPreviewPdf(items, meta = {}) {
  const rows = Array.isArray(items) ? items : [];
  const doc = new jsPDF({
    unit: 'mm',
    format: [THERMAL_LABEL_WIDTH_MM, THERMAL_LABEL_HEIGHT_MM],
    orientation: 'landscape',
  });
  doc.setProperties({
    title: meta.title || 'Thermal label preview',
  });

  let firstPage = true;
  rows.forEach((item) => {
    const copies = Math.max(1, Math.floor(Number(item.qty) || 1));
    for (let copy = 0; copy < copies; copy += 1) {
      if (!firstPage) {
        doc.addPage([THERMAL_LABEL_WIDTH_MM, THERMAL_LABEL_HEIGHT_MM], 'landscape');
      }
      firstPage = false;
      drawSingleThermalPriceLabel(doc, item, meta);
    }
  });

  if (firstPage) {
    drawSingleThermalPriceLabel(doc, { name: '(no items)', sku: '—', qty: 1 }, meta);
  }

  return doc.output('blob');
}

export function openThermalPriceLabelPreviewPdf(items, meta = {}) {
  const blob = buildThermalPriceLabelPreviewPdf(items, meta);
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('Pop-up blocked. Allow pop-ups for this site to view the PDF preview.');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  return blob;
}
