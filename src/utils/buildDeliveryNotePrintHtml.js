/** Shared delivery note A4 HTML — also used by Production app (re-export) and web print. */
import { formatZambiaDate, formatZambiaTime } from './zambiaDateTime.js';

const PAGE_BORDER = '#000';
const PAGE_BORDER_MM = 10;
const ROWS_PER_PAGE = 28;
const ROWS_PER_PAGE_LAST = 18;

export const DELIVERY_NOTE_DISCLAIMER =
  'By signing this document, the driver and dispatcher named above confirm that the goods listed have been verified, loaded onto the vehicle for delivery, and accept responsibility for the accuracy and completeness of this shipment.';

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

function renderBlockRows(block) {
  const productRow = `
    <tr class="product-row">
      <td><strong>${escapeHtml(block.assembly_name)}</strong></td>
      <td class="qty">${escapeHtml(String(block.units))}</td>
    </tr>`;
  const packetRows = (block.lines || []).map((line) => {
    const namePart = String(line.name || 'Packet').trim();
    const label = `- ${namePart}`;
    return `
    <tr class="packet-row">
      <td class="packet-label">${escapeHtml(label)}</td>
      <td class="qty">${escapeHtml(String(line.qty ?? ''))}</td>
    </tr>`;
  });
  return productRow + packetRows.join('');
}

function renderPageHeader(deliveryNumber, dateStr, timeStr, dispatchedBy, companyLogoSrc) {
  const logoSrc = String(companyLogoSrc || '').trim();
  const logoImg = logoSrc
    ? `<img class="company-logo" src="${logoSrc.replace(/"/g, '&quot;')}" alt="Best Rest Furniture" />`
    : '<div class="company-logo company-logo--placeholder"></div>';
  const dispatched = String(dispatchedBy || '').trim() || '—';
  return `
    <header class="doc-header">
      <div class="header-row">
        ${logoImg}
        <div class="header-main">
          <h1 class="title">Delivery Note</h1>
          <p class="delivery-num-label">Delivery No.</p>
          <p class="delivery-num">${escapeHtml(deliveryNumber)}</p>
          <p class="datetime"><span class="date">${escapeHtml(dateStr)}</span> · <span class="time">${escapeHtml(timeStr)} (Zambia)</span></p>
        </div>
      </div>
      <p class="dispatched-by"><strong>Dispatched by:</strong> ${escapeHtml(dispatched)}</p>
    </header>`;
}

function renderCartTableHead() {
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
  } = opts;
  const bodyRows = blocks.map(renderBlockRows).join('');
  const emptyRow = bodyRows ? '' : '<tr><td colspan="2" class="empty">No items</td></tr>';

  return `
    <section class="page">
      <div class="page-inner">
        ${renderPageHeader(deliveryNumber, dateStr, timeStr, dispatchedBy, companyLogoSrc)}
        <div class="cart-table-wrap">
        ${renderCartTableHead()}
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

export function buildDeliveryNotePrintHtml({
  deliveryNumber,
  driverName,
  dispatchedBy = '',
  driverSignatureSrc = '',
  companyLogoSrc = '',
  submittedAt,
  printGroups = [],
  copies = 1,
}) {
  const at = submittedAt || new Date().toISOString();
  const dateStr = formatCatDate(at);
  const timeStr = formatCatTime(at);
  const pages = paginateDeliveryNoteBlocks(printGroups);
  const pageTotal = pages.length;

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
      }))
    .join('');

  const copyCount = Math.max(1, Math.min(10, Number(copies) || 1));
  const bodyHtml = copyCount > 1 ? Array(copyCount).fill(pageHtml).join('\n') : pageHtml;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
      display: flex;
      align-items: flex-start;
      gap: 10mm;
      margin-bottom: 5mm;
    }
    .company-logo {
      width: 38mm;
      max-width: 38mm;
      height: auto;
      max-height: 22mm;
      object-fit: contain;
      object-position: left top;
      flex-shrink: 0;
    }
    .company-logo--placeholder { width: 38mm; height: 18mm; }
    .header-main { flex: 1; text-align: center; }
    .title {
      margin: 0 0 3mm;
      font-size: 20pt;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
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
