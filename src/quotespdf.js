import jsPDF from 'jspdf';
import db from './dataClient';
import { formatCurrency } from './pdfTheme';
import { computeQuotationTotals } from './utils/quotationDisplay';
import { rewriteLegacyStorageUrl } from './utils/storageImageUrl';

function computeTotals(quote, items = []) {
  const subtotal = items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  return computeQuotationTotals({
    subtotal,
    discount: quote?.discount,
    vatApply: Boolean(quote?.vat_apply),
    vatRate: quote?.vat_rate,
  });
}
let cachedCompany = null;

function safe(val, fallback = '') {
  return (val === undefined || val === null) ? fallback : String(val);
}

function normalizeUnitAbbreviation(abbreviation, unitName = '') {
  const rawAbbr = safe(abbreviation, '').trim();
  const rawName = safe(unitName, '').trim();
  const repaired = rawAbbr
    .replace(/Â²/g, '²')
    .replace(/â²/gi, '²')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^m\s*²$/i.test(repaired)) return 'm²';

  const compactAbbr = repaired.toLowerCase().replace(/[\s._-]+/g, '').replace(/\^/g, '');
  if (compactAbbr === 'm2' || compactAbbr === 'ma2' || compactAbbr === 'sqm' || compactAbbr === 'sqmeter' || compactAbbr === 'sqmeters') {
    return 'm²';
  }

  const compactName = rawName.toLowerCase().replace(/[^a-z]/g, '');
  if (
    compactName.includes('metersquared') ||
    compactName.includes('metresquared') ||
    compactName.includes('meteresquared') ||
    compactName.includes('squaremeter') ||
    compactName.includes('squaremetre')
  ) {
    return 'm²';
  }

  const fallback = repaired || rawName;
  return fallback ? fallback.split(/\s+/)[0] : '-';
}

async function getCompanySettings() {
  if (cachedCompany) return cachedCompany;
  try {
    if (typeof window !== 'undefined' && window.companySettings) {
      cachedCompany = window.companySettings;
      return cachedCompany;
    }
  } catch {}
  try {
    const { data } = await db.from('company_settings').select('*').single();
    cachedCompany = data || {};
    if (typeof window !== 'undefined') window.companySettings = cachedCompany;
  } catch {
    cachedCompany = {};
  }
  return cachedCompany;
}

function getLogoUrl(company) {
  const url = rewriteLegacyStorageUrl(company?.company_logo || company?.logo || '', { bucket: 'companylogos' });
  if (url) return url;
  try {
    if (typeof window !== 'undefined') return window.location.origin + '/bestrest-logo.png';
  } catch {}
  return '';
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

function formatName(val) {
  const s = safe(val, '').trim();
  if (!s) return '-';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDesc(val) {
  let s = safe(val, '').trim();
  if (!s) return '';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!s.startsWith('-')) s = `- ${s}`;
  else if (!s.startsWith('- ')) s = `- ${s.slice(1).trim()}`;
  if (!/[.!?]$/.test(s)) s += '.';
  return s;
}

function ensureSpace(doc, margin, needed) {
  const pageH = doc.internal.pageSize.getHeight();
  const lineH = needed || 40;
  if (doc.__cursorY + lineH > pageH - margin) {
    doc.addPage();
    doc.__cursorY = margin;
  }
}

export async function generateQuotePdf(quote = {}, items = [], opts = {}) {
  const { companyOverride = null, mode = 'blob', fileName, noPrices = false, headerTextOverride = null } = opts;
  const company = companyOverride || await getCompanySettings();
  const companyName = safe(company?.company_name || company?.name, 'Best Rest Furniture');
  const companyAddress = safe(company?.company_address || company?.address, '');
  const companyPhone = safe(company?.company_phone || company?.phone, '');
  const companyEmail = safe(company?.company_email || company?.email, '');
  const companyTPIN = safe(company?.company_tpin || company?.tpin, '');

  const logoUrl = getLogoUrl(company);
  const img = await loadImage(logoUrl);

  const doc = new jsPDF('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  doc.__cursorY = margin;

  // Header and subheader boxes
  const headerFont = { family: 'helvetica', style: 'bold', size: 22 };
  const subFont = { family: 'helvetica', style: 'bold', size: 16 };
  doc.setFont(headerFont.family, headerFont.style);
  doc.setFontSize(headerFont.size);
  const headerText = headerTextOverride || 'Quotation';
  const headerY = doc.__cursorY;
  doc.__cursorY += headerFont.size;

  doc.setFont(subFont.family, subFont.style);
  doc.setFontSize(subFont.size);
  const subY = doc.__cursorY + 10;
  doc.__cursorY = subY + 2;

  // Logo reserve
  let reservedLogoBottom = margin;
  let logoDraw = null;
  if (img) {
    try {
      const logoMaxW = 100;
      const logoMaxH = 100;
      let w = img.width;
      let h = img.height;
      const scale = Math.min(logoMaxW / w, logoMaxH / h, 1);
      w = Math.max(24, w * scale);
      h = Math.max(24, h * scale);
      const CM = 28.346;
      const lift = 2 * CM;
      const logoY = Math.max(6, (margin - 18) - lift);
      const logoX = margin;
      reservedLogoBottom = logoY + h;
      logoDraw = () => { try { doc.addImage(img, 'PNG', logoX, logoY, w, h); } catch {} };
    } catch {}
  }

  const afterHeadersY = margin + 70; // push content down to clear logo/header
  doc.__cursorY = Math.max(doc.__cursorY + 14, reservedLogoBottom + 18, afterHeadersY);

  // Optional page border disabled to match layby flags
  // Watermark grid behind everything
  try {
    doc.saveGraphicsState && doc.saveGraphicsState();
    if (doc.GState) { try { doc.setGState(new doc.GState({ opacity: 0.14 })); } catch {} }
    doc.setTextColor(175);
    doc.setFont('helvetica', 'bold');
    const wmFontSize = 38;
    doc.setFontSize(wmFontSize);
    const wm = companyName;
    const wmW = doc.getTextWidth(wm);
    const angle = 30;
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const wmH = wmFontSize + 4;
    const rotW = Math.abs(wmW * cos) + Math.abs(wmH * sin);
    const rotH = Math.abs(wmW * sin) + Math.abs(wmH * cos);
    const stepX = Math.max(180, rotW * 1.05);
    const stepY = Math.max(120, rotH * 1.35);
    const startX = -rotW;
    const startY = -rotH;
    for (let y = startY; y < pageHeight + rotH; y += stepY) {
      for (let x = startX; x < pageWidth + rotW; x += stepX) {
        doc.text(wm, x, y, { angle });
      }
    }
    doc.restoreGraphicsState && doc.restoreGraphicsState();
    doc.setTextColor(0);
  } catch {}

  // Draw headers on top
  doc.setFont(headerFont.family, headerFont.style);
  doc.setFontSize(headerFont.size);
  doc.text(headerText, pageWidth / 2, headerY, { align: 'center' });
  doc.setFont(subFont.family, subFont.style);
  doc.setFontSize(subFont.size);
  doc.text(companyName, pageWidth / 2, subY, { align: 'center' });
  if (logoDraw) logoDraw();

  // Left/Right blocks
  const customer = quote || {};
  const custName = safe(customer.customer_name || customer.name, '');
  const custPhone = safe(customer.customer_phone || customer.phone, '');
  const custEmail = safe(customer.customer_email || customer.email, '');
  const custCity = safe(customer.customer_city || customer.city, '');
  const custAddress = safe(customer.customer_address || customer.address || custCity, '');
  const custTpin = safe(customer.customer_tpin || customer.tpin, '');
  const quoteNumber = safe(customer.quote_number || customer.id, '-');
  const quoteDate = (() => {
    try { return new Date(customer.created_at || Date.now()).toLocaleDateString(); } catch { return ''; }
  })();

  const leftLines = [
    custName ? `Customer: ${custName}` : 'Customer: —',
    custPhone ? `Phone: ${custPhone}` : undefined,
    custEmail ? `Email: ${custEmail}` : undefined,
    custAddress ? `Address: ${custAddress}` : 'Address:',
    custTpin ? `TPIN: ${custTpin}` : undefined,
    `Quote #: ${quoteNumber}`,
    `Date: ${quoteDate}`,
  ].filter(Boolean);

  const rightX = pageWidth - margin;
  const rightLines = [
    companyName,
    companyAddress || undefined,
    companyPhone ? `Phone: ${companyPhone}` : undefined,
    companyEmail ? `Email: ${companyEmail}` : undefined,
    companyTPIN ? `TPIN: ${companyTPIN}` : undefined,
  ].filter(Boolean);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const lineH = 16;
  let yLeft = doc.__cursorY + 6;
  leftLines.forEach(line => { doc.text(line, margin, yLeft); yLeft += lineH; });
  let yRight = doc.__cursorY + 6;
  rightLines.forEach(line => { doc.text(line, rightX, yRight, { align: 'right' }); yRight += lineH; });
  doc.__cursorY = Math.max(yLeft, yRight) + 18;

  // Items table with borders
  const currencyLabel = quote?.currency || 'K';
  const tableX = margin;
  const tableYStart = doc.__cursorY;
  const totalWidth = pageWidth - margin * 2;
  const tableWidths = noPrices ? {
    item: Math.max(320, totalWidth * 0.7),
    qty: Math.max(110, totalWidth * 0.3),
  } : {
    item: Math.max(240, totalWidth * 0.45),
    qty: Math.max(90, totalWidth * 0.18),
    price: Math.max(110, totalWidth * 0.17),
    amount: Math.max(110, totalWidth * 0.20),
  };
  const colItem = tableX;
  const colQty = colItem + tableWidths.item;
  const colPrice = colQty + (tableWidths.qty || 0);
  const colAmt = colPrice + (tableWidths.price || 0);

  const tableHeaderH = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setFillColor(13, 110, 253); // blue header
  doc.setTextColor(255);
  doc.rect(tableX, tableYStart, tableWidths.item, tableHeaderH, 'F');
  doc.rect(colQty, tableYStart, tableWidths.qty, tableHeaderH, 'F');
  if (!noPrices) {
    doc.rect(colPrice, tableYStart, tableWidths.price, tableHeaderH, 'F');
    doc.rect(colAmt, tableYStart, tableWidths.amount, tableHeaderH, 'F');
  }
  const tableHeaderY = tableYStart + tableHeaderH - 6;
  doc.text('Item & Description', colItem + 6, tableHeaderY);
  doc.text('Qty / Unit', colQty + tableWidths.qty / 2, tableHeaderY, { align: 'center' });
  if (!noPrices) {
    doc.text('Price/Unit', colPrice + tableWidths.price / 2, tableHeaderY, { align: 'center' });
    doc.text('Amount', colAmt + tableWidths.amount / 2, tableHeaderY, { align: 'center' });
  }
  doc.setTextColor(0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let cursor = tableYStart + tableHeaderH;
  const rowLineH = 14;
  const descWidth = tableWidths.item - 10;

  const drawRow = ({ name, desc, qtyText, priceText, amtText }) => {
    const nameLines = doc.splitTextToSize(name || '-', descWidth);
    const descLines = desc ? doc.splitTextToSize(desc, descWidth) : [];
    const contentLines = [...nameLines, ...descLines];
    const rowHeight = Math.max(rowLineH * contentLines.length + 8, rowLineH + 8);
    ensureSpace(doc, margin, rowHeight + 12);
    // text only (no borders)
    let textY = cursor + 14;
    contentLines.forEach((ln) => {
      doc.text(ln, colItem + 6, textY);
      textY += rowLineH;
    });
    const centerY = cursor + rowHeight / 2 + 4;
    doc.text(qtyText, colQty + tableWidths.qty / 2, centerY - 2, { align: 'center' });
    if (!noPrices) {
      doc.text(priceText, colPrice + tableWidths.price / 2, centerY - 2, { align: 'center' });
      doc.text(amtText, colAmt + tableWidths.amount / 2, centerY - 2, { align: 'center' });
    }
    cursor += rowHeight;
  };

  (items || []).forEach(it => {
    const name = formatName(it.name_override || it.name || it.product_name || it.quote_product_name || it.description);
    const desc = formatDesc(it.description);
    const qty = safe(it.quantity, '');
    const unitAbbr = normalizeUnitAbbreviation(it.unit_abbr || it.abbreviation, it.unit_label || it.unit);
    const qtyText = `${qty} ${unitAbbr}`.trim();
    const unitPrice = formatCurrency(Number(it.unit_price || 0), currencyLabel);
    const amount = formatCurrency(Number(it.quantity || 0) * Number(it.unit_price || 0), currencyLabel);
    drawRow({ name, desc, qtyText, priceText: unitPrice, amtText: amount });
  });

  if (!noPrices) {
    // Totals as part of table
    const totals = computeTotals(quote, items);
    const vatDisplay = quote?.vat_apply ? formatCurrency(totals.vatAmount, currencyLabel) : '-';
    const totalLines = [
      ['Subtotal', formatCurrency(totals.subtotal, currencyLabel)],
      ['VAT @ 16%', vatDisplay],
      ['Total', formatCurrency(totals.total, currencyLabel)],
    ];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    totalLines.forEach(([label, val]) => {
      const rowHeight = rowLineH + 10;
      ensureSpace(doc, margin, rowHeight + 12);
      const centerY = cursor + rowHeight / 2 + 2;
      doc.text(label, colPrice + tableWidths.price / 2, centerY, { align: 'center' });
      doc.text(val, colAmt + tableWidths.amount / 2, centerY, { align: 'center' });
      cursor += rowHeight;
    });
  }
  doc.__cursorY = cursor + 12;

  // Terms
  const gapAfterTable = 28.346 * 3; // 3cm gap
  const termsBlockHeight = 140;
  ensureSpace(doc, margin, gapAfterTable + termsBlockHeight);
  doc.__cursorY += gapAfterTable;
  const centerX = pageWidth / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Terms & Conditions', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text('1. Period Of Validity: 7 Days After Issued Date', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 14;
  doc.text('2. Delivery Of Goods: Upon Completion Of Payment', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Banking Details', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text('Account Name: BEST REST FURNITURE', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 14;
  doc.text('Bank Name: First National Bank (FNB)', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 14;
  doc.text('Account Number: 62377271912', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 14;
  doc.text('Branch Location: Kitwe', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 14;
  doc.text('Branch Code: 260212', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 14;
  doc.text('SWIFT Code: FIRNZMLX', centerX, doc.__cursorY, { align: 'center' }); doc.__cursorY += 14;

  // Footer page numbers
  const totalPages = doc.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerText = `${i} of ${totalPages}`;
    doc.text(footerText, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
  }

  if (mode === 'download') {
    const filename = fileName || `Quote_${quoteNumber || 'quote'}.pdf`;
    doc.save(filename);
    return null;
  }
  if (mode === 'arraybuffer') return doc.output('arraybuffer');
  return doc.output('blob');
}

export default generateQuotePdf;
