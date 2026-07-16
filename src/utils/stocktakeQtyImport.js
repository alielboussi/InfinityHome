import * as XLSX from 'xlsx';

const SKU_HEADERS = ['sku', 'product_sku', 'barcode', 'code'];
const QTY_HEADERS = ['quantity', 'qty', 'stock', 'count', 'stock_qty'];
const NAME_HEADERS = ['product_name', 'name', 'product', 'description'];

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function findHeaderIndex(headers, aliases) {
  for (let i = 0; i < headers.length; i += 1) {
    if (aliases.includes(headers[i])) return i;
  }
  return -1;
}

/**
 * Parse an Excel/CSV File into [{ sku, productName, quantity }].
 * Headers: SKU, Product Name, Quantity.
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

  const headers = (matrix[0] || []).map(normalizeHeader);
  const skuIdx = findHeaderIndex(headers, SKU_HEADERS);
  const nameIdx = findHeaderIndex(headers, NAME_HEADERS);
  const qtyIdx = findHeaderIndex(headers, QTY_HEADERS);
  if (skuIdx < 0 || nameIdx < 0 || qtyIdx < 0) {
    throw new Error('File must include SKU, Product Name, and Quantity columns. Sets are not allowed.');
  }

  const rows = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const line = matrix[i] || [];
    const sku = String(line[skuIdx] ?? '').trim();
    const productName = String(line[nameIdx] ?? '').trim();
    if (!sku && !productName) continue;
    const quantity = Number(line[qtyIdx]);
    rows.push({ sku, productName, quantity });
  }
  if (!rows.length) throw new Error('No data rows found.');
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
