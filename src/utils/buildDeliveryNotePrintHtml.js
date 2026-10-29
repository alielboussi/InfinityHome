/** Shared delivery note A4 HTML — also used by Production app (re-export) and web print. */
import { formatZambiaDate, formatZambiaTime } from './zambiaDateTime.js';

const PAGE_BORDER = '#000';
const PAGE_BORDER_MM = 3;
const ROWS_PER_PAGE = 28;
const ROWS_PER_PAGE_LAST = 18;

export const DELIVERY_NOTE_DISCLAIMER =
  'By signing this document, the driver and dispatcher named above confirm that the goods listed have been verified, loaded onto the vehicle for delivery, and accept responsibility for the accuracy and completeness of this shipment.';

export const DELIVERY_NOTE_COMPANY_NAME = 'Bestrest Furniture';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCatDate(iso) {
  try {
    return formatZambiaDate(iso);
  } catch {
    return '—';
  }
}

function formatCatTime(iso) {
  try {
    return formatZambiaTime(iso);
  } catch {
    return '—';
  }
}

function normalizeBlocks(printGroups) {
  const blocks = [];
  for (const group of printGroups || []) {
    const units = Math.max(1, Number(group.units) || 1);
    const lines = group.lines || [];
    blocks.push({
      assembly_name: group.assembly_name,
      units,
      lines,
      elapsed_display: group.elapsed_display,
      rowCount: 1 + lines.length,
    });
  }
  return blocks;
}

function expandBlocksForPrint(blocks) {
  const maxPacketsPerChunk = ROWS_PER_PAGE - 1;
  const out = [];
  for (const block of blocks) {
    const lines = block.lines || [];
    if (lines.length <= maxPacketsPerChunk) {
      out.push({ ...block, rowCount: 1 + lines.length, packetLineCount: lines.length });
      continue;
    }
    for (let i = 0; i < lines.length; i += maxPacketsPerChunk) {
      const chunk = lines.slice(i, i + maxPacketsPerChunk);
      out.push({
        assembly_name: block.assembly_name,
        units: block.units,
        lines: chunk,
        rowCount: 1 + chunk.length,
        packetLineCount: chunk.length,
      });
    }
  }
  return out;
}

function blockNeedsFreshPageAfter(prev) {
  if (!prev) return false;
  return (prev.packetLineCount || prev.lines?.length || 0) >= 10;
}

export function paginateDeliveryNoteBlocks(printGroups) {
  const blocks = expandBlocksForPrint(normalizeBlocks(printGroups));
  if (!blocks.length) return [[]];

  const pages = [];
  let current = [];
  let used = 0;

  for (const block of blocks) {
    const need = block.rowCount;
    const prev = current[current.length - 1];
    const freshForNextProduct =
      current.length > 0
      && prev
      && prev.assembly_name !== block.assembly_name
      && blockNeedsFreshPageAfter(prev);

    if (freshForNextProduct || (current.length && used + need > ROWS_PER_PAGE)) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += need;
  }
  if (current.length) pages.push(current);

  while (pages.length > 1) {
    const last = pages[pages.length - 1];
    const rows = last.reduce((n, b) => n + b.rowCount, 0);
    if (rows <= ROWS_PER_PAGE_LAST) break;
    if (last.length <= 1) break;
    const moved = last.pop();
    pages.push([moved]);
  }

  return pages;
}

function renderBlockRows(block, { showElapsedColumn = false } = {}) {
  const elapsedCell = showElapsedColumn
    ? `<td class="elapsed">${escapeHtml(String(block.elapsed_display || '—'))}</td>`
    : '';
  const productRow = `
    <tr class="product-row">
      <td><strong>${escapeHtml(block.assembly_name)}</strong></td>
      ${elapsedCell}
      <td class="qty">${escapeHtml(String(block.units))}</td>
    </tr>`;
  const packetRows = (block.lines || []).map((line) => {
    const namePart = String(line.name || line.reason || 'Packet').trim();
    const label = line.line_kind === 'reason' || line.kind === 'reason'
      ? `-Reason ${namePart}`
      : `- ${namePart}`;
    return `
    <tr class="packet-row">
      <td class="packet-label">${escapeHtml(label)}</td>
      ${showElapsedColumn ? '<td class="elapsed"></td>' : ''}
      <td class="qty">${escapeHtml(String(line.qty ?? ''))}</td>
    </tr>`;
  });
  return productRow + packetRows.join('');
}

function safeImgSrc(value) {
  return String(value ?? '').trim().replace(/"/g, '&quot;');
}

function deliveryNoteTitle(documentKind = 'delivery') {
  const kind = String(documentKind || 'delivery').trim();
  if (kind === 'return' || kind === 'return_shipment') return 'Return Note';
  if (kind === 'sold_delivery') return 'Sold Delivery Note';
  /** Kitwe truck send + sent-delivery reprints only — never mix with sold_delivery. */
  return 'Delivery Note';
}

function deliveryNoteNumberLabel(documentKind = 'delivery') {
  const kind = String(documentKind || 'delivery').trim();
  if (kind === 'return' || kind === 'return_shipment') return 'Return No.';
  if (kind === 'sold_delivery') return 'Sold Delivery No.';
  return 'Delivery No.';
}

function deliveryNoteShowsCustomerBlock(documentKind = 'delivery') {
  return String(documentKind || '').trim() === 'sold_delivery';
}

function renderPageHeader(deliveryNumber, dateStr, timeStr, dispatchedBy, companyLogoSrc, documentKind = 'delivery', customerName = '', customerPhone = '') {
  const logoSrc = String(companyLogoSrc || '').trim();
  const logoImg = logoSrc
    ? `<img class="company-logo" src="${safeImgSrc(logoSrc)}" alt="${escapeHtml(DELIVERY_NOTE_COMPANY_NAME)}" />`
    : `<div class="company-logo company-logo--text">${escapeHtml(DELIVERY_NOTE_COMPANY_NAME)}</div>`;
  const dispatched = String(dispatchedBy || '').trim() || '—';
  const title = deliveryNoteTitle(documentKind);
  const numLabel = deliveryNoteNumberLabel(documentKind);
  const custName = String(customerName || '').trim();
  const custPhone = String(customerPhone || '').trim();
  const showCustomer = deliveryNoteShowsCustomerBlock(documentKind);
  const customerBlock = showCustomer && (custName || custPhone)
    ? `<p class="customer-line"><strong>Customer Name:</strong> ${escapeHtml(custName || '—')}</p>
      <p class="customer-line"><strong>Customer Phone Number:</strong> ${escapeHtml(custPhone || '—')}</p>`
    : '';
  return `
    <header class="doc-header">
      <div class="header-row">
        <div class="header-brand">${logoImg}</div>
        <div class="header-main">
          <h1 class="title">${escapeHtml(title)}</h1>
          <p class="company-name">${escapeHtml(DELIVERY_NOTE_COMPANY_NAME)}</p>
          <p class="delivery-num-label">${escapeHtml(numLabel)}</p>
          <p class="delivery-num">${escapeHtml(deliveryNumber)}</p>
          <p class="datetime"><span class="date">${escapeHtml(dateStr)}</span> · <span class="time">${escapeHtml(timeStr)} (Zambia)</span></p>
        </div>
        <div class="header-spacer" aria-hidden="true"></div>
      </div>
      <p class="dispatched-by"><strong>Dispatched by:</strong> ${escapeHtml(dispatched)}</p>
      ${customerBlock}
    </header>`;
}

function renderCartTableHead(showElapsedColumn = false) {
  if (showElapsedColumn) {
    return `
    <table class="cart-table">
      <thead>
        <tr>
          <th>Product Name</th>
          <th class="elapsed">Time</th>
          <th class="qty">Qty</th>
        </tr>
      </thead>
      <tbody>`;
  }
  return `
    <table class="cart-table">
      <thead>
        <tr>
          <th>Product Name</th>
          <th class="qty">Qty</th>
        </tr>
      </thead>
      <tbody>`;
}

function renderDriverSignatureFooter(driverName, signatureSrc) {
  const safeSrc = String(signatureSrc || '').trim();
  const safeName = String(driverName || '').trim() || '—';
  const img = safeSrc
    ? `<img class="sig-image" src="${safeSrc.replace(/"/g, '&quot;')}" alt="Driver signature" />`
    : '<span class="sig-missing">No signature image</span>';
  return `
    <footer class="signatures">
      <div class="sig-driver-block">
        <p class="sig-driver-name"><strong>Driver:</strong> ${escapeHtml(safeName)}</p>
        <div class="sig-line">
          <span class="sig-inline-label">Driver signature</span>
          ${img}
        </div>
      </div>
    </footer>`;
}

function renderDisclaimer() {
  return `<p class="disclaimer">${escapeHtml(DELIVERY_NOTE_DISCLAIMER)}</p>`;
}

function renderPage(opts) {
  const {
    deliveryNumber,
    dateStr,
    timeStr,
    blocks,
    pageIndex,
    pageTotal,
    isLast,
    driverName,
    dispatchedBy,
    driverSignatureSrc,
    companyLogoSrc,
    documentKind = 'delivery',
    showElapsedColumn = false,
    customerName = '',
    customerPhone = '',
  } = opts;
  const bodyRows = blocks.map((b) => renderBlockRows(b, { showElapsedColumn })).join('');
  const colSpan = showElapsedColumn ? 3 : 2;
  const emptyRow = bodyRows ? '' : `<tr><td colspan="${colSpan}" class="empty">No items</td></tr>`;

  return `
    <section class="page">
      <div class="page-inner">
        ${renderPageHeader(deliveryNumber, dateStr, timeStr, dispatchedBy, companyLogoSrc, documentKind, customerName, customerPhone)}
        <div class="cart-table-wrap">
        ${renderCartTableHead(showElapsedColumn)}
          ${bodyRows || emptyRow}
        </tbody>
      </table>
        </div>
        ${isLast ? renderDriverSignatureFooter(driverName, driverSignatureSrc) : ''}
        ${isLast ? renderDisclaimer() : ''}
        <p class="page-num">Page ${pageIndex} of ${pageTotal}</p>
      </div>
    </section>`;
}

export function deliveryNoteDocumentTitle(documentKind = 'delivery') {
  return deliveryNoteTitle(documentKind);
}

export function buildDeliveryNotePrintHtml({
  deliveryNumber,
  driverName,
  dispatchedBy = '',
  driverSignatureSrc = '',
  companyLogoSrc = '',
  submittedAt,
  printGroups = [],
  copies = 1,
  documentKind = 'delivery',
  showElapsedColumn = false,
  customerName = '',
  customerPhone = '',
}) {
  const at = submittedAt || new Date().toISOString();
  const dateStr = formatCatDate(at);
  const timeStr = formatCatTime(at);
  const pages = paginateDeliveryNoteBlocks(printGroups);
  const pageTotal = pages.length;
  const useElapsed = showElapsedColumn || documentKind === 'return' || documentKind === 'return_shipment';

  const pageHtml = pages
    .map((blocks, i) =>
      renderPage({
        deliveryNumber,
        dateStr,
        timeStr,
        blocks,
        pageIndex: i + 1,
        pageTotal,
        isLast: i === pageTotal - 1,
        driverName,
        dispatchedBy,
        driverSignatureSrc,
        companyLogoSrc,
        documentKind,
        showElapsedColumn: useElapsed,
        customerName,
        customerPhone,
      }))
    .join('');

  const copyCount = Math.max(1, Math.min(10, Number(copies) || 1));
  const bodyHtml = copyCount > 1 ? Array(copyCount).fill(pageHtml).join('\n') : pageHtml;
  const docTitle = deliveryNoteTitle(documentKind);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(docTitle)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Helvetica, Arial, sans-serif;
      color: #111;
      font-size: 11pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: ${PAGE_BORDER_MM}mm;
      border: ${PAGE_BORDER_MM}mm solid ${PAGE_BORDER};
      page-break-after: always;
      position: relative;
      background: #fff;
    }
    .page:last-child { page-break-after: auto; }
    .page-inner {
      min-height: calc(297mm - ${PAGE_BORDER_MM * 4}mm);
      display: flex;
      flex-direction: column;
      padding: 2mm 0 0;
    }
    .cart-table-wrap { flex: 0 0 auto; width: 100%; }
    .doc-header { margin-bottom: 8mm; }
    .header-row {
      display: grid;
      grid-template-columns: 42mm minmax(0, 1fr) 42mm;
      align-items: start;
      column-gap: 3mm;
      margin-bottom: 5mm;
    }
    .header-brand {
      grid-column: 1;
      justify-self: start;
      align-self: start;
    }
    .header-spacer {
      grid-column: 3;
    }
    .company-logo {
      display: block;
      width: 40mm;
      max-width: 40mm;
      height: auto;
      max-height: 24mm;
      object-fit: contain;
      object-position: left top;
    }
    .company-logo--text {
      width: 40mm;
      max-width: 40mm;
      font-size: 9pt;
      font-weight: 800;
      line-height: 1.25;
      color: #111;
    }
    .header-main {
      grid-column: 2;
      text-align: center;
      justify-self: center;
    }
    .title {
      margin: 0 0 1.5mm;
      font-size: 20pt;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .company-name {
      margin: 0 0 3mm;
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: #222;
    }
    .delivery-num-label {
      margin: 0;
      font-size: 10pt;
      font-weight: 700;
      color: #444;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .delivery-num {
      margin: 1mm 0 3mm;
      font-size: 15pt;
      font-weight: 800;
    }
    .datetime { margin: 0; font-size: 10.5pt; color: #333; }
    .dispatched-by {
      margin: 0;
      font-size: 11pt;
      text-align: left;
      border-top: 1px solid #333;
      padding-top: 3mm;
    }
    .customer-line {
      margin: 2mm 0 0;
      font-size: 11pt;
      text-align: left;
    }
    .cart-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .cart-table th, .cart-table td {
      border: 1px solid #333;
      vertical-align: middle;
      height: auto;
    }
    .cart-table th {
      background: #f4f4f4;
      font-weight: 700;
      padding: 1px 8px;
      line-height: 1.1;
    }
    .cart-table td {
      padding: 0;
      line-height: 1.1;
    }
    .cart-table .qty { width: 22mm; text-align: center; }
    .cart-table .elapsed { width: 28mm; text-align: center; font-size: 10pt; }
    .cart-table th:first-child, .product-row td:first-child { text-align: center; }
    .product-row td {
      background: #fafafa;
      padding: 1px 8px;
    }
    .product-row td.qty { padding: 1px 4px; }
    .packet-row td {
      padding: 0 6px 0 8px;
    }
    .packet-row td.qty { padding: 0 4px; }
    .packet-label { text-align: left !important; word-wrap: break-word; overflow-wrap: anywhere; }
    .product-row strong, .packet-row td { margin: 0; font-weight: inherit; }
    .product-row td:first-child strong { font-weight: 700; }
    .empty { text-align: center; color: #666; }
    .signatures {
      margin-top: 10mm;
      border-top: 1px solid #333;
      padding-top: 5mm;
    }
    .sig-driver-name { margin: 0 0 4mm; font-size: 11pt; }
    .sig-line { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 4mm; }
    .sig-inline-label { font-size: 10.5pt; font-weight: 700; }
    .sig-image {
      height: 22mm;
      max-width: 90mm;
      display: block;
      border-bottom: 1px solid #111;
    }
    .sig-missing { font-size: 10pt; color: #888; font-style: italic; }
    .disclaimer {
      margin: 8mm 0 0;
      padding: 4mm 0 0;
      border-top: 1px solid #999;
      font-size: 8.5pt;
      line-height: 1.45;
      color: #333;
      text-align: justify;
    }
    .page-num {
      margin: auto 0 0;
      padding-top: 6mm;
      text-align: center;
      font-size: 10pt;
      font-weight: 600;
      color: #444;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}
