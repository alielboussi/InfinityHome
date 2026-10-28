const CAT_TZ = 'Africa/Lusaka';
const PAGE_BORDER = '#000';
/** ~tbody rows per page (product + packet lines); last page reserves signature block */
const ROWS_PER_PAGE = 28;
const ROWS_PER_PAGE_LAST = 20;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCatDate(iso) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: CAT_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso || Date.now()));
  } catch {
    return '—';
  }
}

function formatCatTime(iso) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: CAT_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso || Date.now()));
  } catch {
    return '—';
  }
}

function normalizeBlocks(printGroups) {
  const blocks = [];
  for (const group of printGroups || []) {
    const units = Math.max(1, Number(group.units) || 1);
    const lines = group.lines || [];
    const rowCount = 1 + lines.length;
    blocks.push({
      assembly_name: group.assembly_name,
      units,
      lines,
      rowCount,
    });
  }
  return blocks;
}

/** Split huge products so each chunk fits one page; product row repeats per chunk (no orphan packets). */
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
        productChunkIndex: Math.floor(i / maxPacketsPerChunk),
      });
    }
  }
  return out;
}

function blockNeedsFreshPageAfter(prev) {
  if (!prev) return false;
  return (prev.packetLineCount || prev.lines?.length || 0) >= 10;
}

/**
 * Pack product blocks onto pages; never split a chunk across pages.
 * After a product with many packets, the next product starts on a new page.
 */
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
    const label = line.packet_number
      ? `#${line.packet_number} ${line.name || ''}`.trim()
      : (line.name || 'Packet');
    return `
    <tr class="packet-row">
      <td class="packet-label">${escapeHtml(label)}</td>
      <td class="qty">${escapeHtml(String(line.qty ?? ''))}</td>
    </tr>`;
  });
  return productRow + packetRows.join('');
}

function renderPageHeader(deliveryNumber, dateStr, timeStr, dispatchedBy) {
  return `
    <header class="doc-header">
      <h1 class="title">Delivery</h1>
      <h2 class="subtitle">Delivery #</h2>
      <p class="delivery-num">${escapeHtml(deliveryNumber)}</p>
      <p class="datetime"><span class="date">${escapeHtml(dateStr)}</span> &nbsp;·&nbsp; <span class="time">${escapeHtml(timeStr)} CAT</span></p>
      <p class="dispatched-by">Dispatched By: ${escapeHtml(dispatchedBy || '—')}</p>
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
  const img = safeSrc
    ? `<img class="sig-image" src="${safeSrc.replace(/"/g, '&quot;')}" alt="Driver signature" />`
    : '';
  return `
    <footer class="signatures">
      <div class="sig-driver-block">
        <div class="sig-label">Driver Name: ${escapeHtml(driverName || '—')}</div>
        <div class="sig-line sig-left-line">
          <span class="sig-inline-label">Driver Signature :</span>
          ${img}
        </div>
      </div>
    </footer>`;
}

function renderPage({
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
}) {
  const bodyRows = blocks.map(renderBlockRows).join('');
  const emptyRow = bodyRows
    ? ''
    : '<tr><td colspan="2" class="empty">No items</td></tr>';

  return `
    <section class="page">
      ${renderPageHeader(deliveryNumber, dateStr, timeStr, dispatchedBy)}
      ${renderCartTableHead()}
        ${bodyRows || emptyRow}
      </tbody>
    </table>
      ${isLast ? renderDriverSignatureFooter(driverName, driverSignatureSrc) : ''}
      <p class="page-num">${pageIndex} of ${pageTotal}</p>
    </section>`;
}

/**
 * A4 portrait delivery note (HTML for expo-print).
 */
export function buildDeliveryNotePrintHtml({
  deliveryNumber,
  driverName,
  dispatchedBy = '',
  driverSignatureSrc = '',
  submittedAt,
  printGroups = [],
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
      }))
    .join('');

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
      padding: 14mm 16mm 18mm;
      border: 3px solid ${PAGE_BORDER};
      page-break-after: always;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    .page:last-child { page-break-after: auto; }
    .doc-header { text-align: center; margin-bottom: 10mm; }
    .title {
      margin: 0 0 4mm;
      font-size: 22pt;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .subtitle {
      margin: 0;
      font-size: 13pt;
      font-weight: 700;
      color: #333;
    }
    .delivery-num {
      margin: 2mm 0 4mm;
      font-size: 14pt;
      font-weight: 800;
      color: #111;
    }
    .datetime {
      margin: 0;
      font-size: 11pt;
      color: #333;
    }
    .dispatched-by {
      margin: 3mm 0 0;
      font-size: 11pt;
      color: #333;
    }
    .cart-table {
      width: 100%;
      border-collapse: collapse;
      flex: 1 0 auto;
    }
    .cart-table th,
    .cart-table td {
      border: 1px solid #333;
      padding: 5px 8px;
      vertical-align: top;
      text-align: left;
    }
    .cart-table th {
      background: transparent;
      font-weight: 700;
    }
    .cart-table .qty {
      width: 22mm;
      text-align: center;
    }
    .cart-table th:first-child,
    .product-row td:first-child,
    .packet-row td:first-child {
      text-align: center;
    }
    .product-row td { background: #fafafa; }
    .empty { text-align: center; color: #666; }
    .signatures {
      margin-top: 12mm;
    }
    .sig-driver-block { text-align: left; }
    .sig-label {
      font-size: 10.5pt;
      margin-bottom: 2mm;
      line-height: 1.35;
    }
    .sig-line {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.35em;
      margin-top: 2mm;
      font-size: 10.5pt;
      line-height: 1.35;
    }
    .sig-inline-label { white-space: nowrap; }
    .sig-image {
      height: 2cm;
      width: auto;
      max-width: 8cm;
      display: inline-block;
      vertical-align: middle;
    }
    .page-num {
      margin: 8mm 0 0;
      text-align: center;
      font-size: 10pt;
      color: #444;
    }
  </style>
</head>
<body>
  ${pageHtml}
</body>
</html>`;
}
