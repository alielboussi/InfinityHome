import * as XLSX from 'xlsx';

const SKU_HEADERS = ['sku', 'product_sku', 'barcode', 'code'];
const NAME_HEADERS = ['product_name', 'name', 'product', 'description'];
const QTY_HEADERS = [
  'quantity',
  'qty',
  'qty_counted',
  'counted_qty',
  'counted',
  'physical_count',
  'opening_qty',
  'stock_qty',
  'count',
  'stock',
];

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function findBestHeaderIndex(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseQuantity(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectHeaderRow(matrix, maxScan = 8) {
  let best = { rowIndex: 0, score: -1, headers: [] };
  const limit = Math.min(maxScan, matrix.length);
  for (let i = 0; i < limit; i += 1) {
    const headers = (matrix[i] || []).map(normalizeHeader);
    const skuIdx = findBestHeaderIndex(headers, SKU_HEADERS);
    const nameIdx = findBestHeaderIndex(headers, NAME_HEADERS);
    const qtyIdx = findBestHeaderIndex(headers, QTY_HEADERS);
    const score = (skuIdx >= 0 ? 1 : 0) + (nameIdx >= 0 ? 1 : 0) + (qtyIdx >= 0 ? 2 : 0);
    if (score > best.score) {
      best = { rowIndex: i, score, headers, skuIdx, nameIdx, qtyIdx };
    }
  }
  return best;
}

/**
 * Parse an Excel/CSV File into [{ sku, productName, quantity }].
 * Headers: SKU, Product Name, Quantity (row may not be the first line).
 */
export async function parseStocktakeQtyFile(file) {
  if (!file) throw new Error('Choose an Excel file first.');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no sheets.');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!matrix.length) throw new Error('File is empty.');

  const headerRow = detectHeaderRow(matrix);
  const { rowIndex, skuIdx, nameIdx, qtyIdx } = headerRow;
  if (skuIdx < 0 || nameIdx < 0 || qtyIdx < 0) {
    throw new Error('File must include SKU, Product Name, and Quantity columns. Sets are not allowed.');
  }

  const rows = [];
  const missingQty = [];
  for (let i = rowIndex + 1; i < matrix.length; i += 1) {
    const line = matrix[i] || [];
    const sku = String(line[skuIdx] ?? '').trim();
    const productName = String(line[nameIdx] ?? '').trim();
    if (!sku && !productName) continue;

    const quantity = parseQuantity(line[qtyIdx]);
    if (quantity === null) {
      if (sku || productName) missingQty.push(sku || productName);
      continue;
    }
    rows.push({ sku, productName, quantity });
  }

  if (!rows.length) {
    if (missingQty.length) {
      throw new Error(
        `No quantities found. Fill the Quantity column for each product (first missing: ${missingQty[0]}).`,
      );
    }
    throw new Error('No data rows found.');
  }

  if (missingQty.length) {
    const preview = missingQty.slice(0, 3).join(', ');
    throw new Error(
      `Some rows are missing a quantity (${missingQty.length} row${missingQty.length === 1 ? '' : 's'}). Example: ${preview}`,
    );
  }

  return rows;
}

export function downloadStocktakeQtySample({ rows = [], filename } = {}) {
  const stamp = new Date().toISOString().slice(0, 10);
  const outName = filename || `stocktake_qty_import_sample_${stamp}.xlsx`;
  const sheetRows = [
    ['SKU', 'Product Name', 'Quantity'],
    ...(rows.length
      ? rows.map((r) => [r.sku || '', r.name || r.productName || '', r.quantity === 0 || r.quantity ? r.quantity : ''])
      : [
          ['EXAMPLE-SKU-001', 'Example product name', 0],
          ['EXAMPLE-SKU-002', 'Another product (not a set)', 0],
        ]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!cols'] = [{ wch: 18 }, { wch: 40 }, { wch: 12 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Qty');
  XLSX.writeFile(workbook, outName);
}
