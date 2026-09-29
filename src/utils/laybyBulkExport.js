import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import generateLaybyPdf from '../laybyPdf';
import { fetchLaybyStatement } from '../services/laybyStatement';
import { buildPooledCustomerPdfPayload } from './laybyRollup';

const formatCurrencyPlain = (amount, currency = 'K') => {
  const n = Number(amount || 0);
  const formatted = n % 1 === 0
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rawCode = String(currency || '').trim();
  const code = rawCode.toUpperCase();
  const label = (code === 'USD' || rawCode === '$') ? '$' : (rawCode || 'K');
  return `${label} ${formatted}`;
};

const formatGroupCell = (row, field) => {
  const entries = Object.entries(row?.totalsByCurrency || {});
  if (!entries.length) return '';
  return entries.map(([code, vals]) => formatCurrencyPlain(vals[field] || 0, code)).join(' | ');
};

const safeFileStem = (name) => (
  String(name || 'Customer').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_') || 'Customer'
);

async function buildRowPdfPayload(row) {
  const { statement, totalsByCurrency, pooledCustomerStatement } = buildPooledCustomerPdfPayload(row);
  if (statement.sales?.length || statement.payments?.length) {
    return { statement, totalsByCurrency, pooledCustomerStatement };
  }
  const { data, error } = await fetchLaybyStatement(row.customerId);
  if (error) throw error;
  const refreshed = {
    sales: data?.sales || [],
    items: data?.items || [],
    payments: data?.payments || [],
  };
  return {
    statement: refreshed,
    totalsByCurrency: row.totalsByCurrency || buildPooledCustomerPdfPayload({ ...row, fullStatement: refreshed }).totalsByCurrency,
    pooledCustomerStatement: true,
  };
}

export function exportLaybySummaryExcel(rows, filename) {
  const sheetRows = [
    ['Customer', 'Phone', 'Total Sale', 'Total Deposit', 'Total Discount', 'Total Due'],
    ...(rows || []).map((row) => ([
      row.customer?.name || row.customerId || '',
      row.customer?.phone || '',
      formatGroupCell(row, 'total'),
      formatGroupCell(row, 'paid'),
      formatGroupCell(row, 'discount'),
      formatGroupCell(row, 'due'),
    ])),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 18 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Layby Management');
  XLSX.writeFile(workbook, filename);
}

export async function exportAllLaybyPdfsZip(rows, { onProgress } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { ok: false, error: 'No layby rows to export.' };

  const zip = new JSZip();
  const usedNames = new Set();
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;

  for (let index = 0; index < list.length; index += 1) {
    const row = list[index];
    onProgress?.(index + 1, list.length, row.customer?.name || row.customerId);
    try {
      const { statement, totalsByCurrency, pooledCustomerStatement } = await buildRowPdfPayload(row);
      const primaryLayby = row.primaryLayby || (row.laybys || []).find((layby) => layby?.id) || null;
      const pdfLayby = {
        ...(primaryLayby || {}),
        id: primaryLayby?.id || null,
        sale_id: primaryLayby?.sale_id || null,
        customer_id: row.customerId,
        customerInfo: row.customer || {},
      };
      const blob = await generateLaybyPdf(pdfLayby, {
        statement,
        totalsByCurrency,
        pooledCustomerStatement,
        mode: 'blob',
      });
      if (!blob) continue;

      const currency = Object.keys(row.totalsByCurrency || {})[0] || 'K';
      let fileName = `${safeFileStem(row.customer?.name)}_Layby_Statement_${today}_${currency}.pdf`;
      if (usedNames.has(fileName)) {
        fileName = `${safeFileStem(row.customer?.name)}_${index + 1}_Layby_Statement_${today}_${currency}.pdf`;
      }
      usedNames.add(fileName);
      zip.file(fileName, blob);
      added += 1;
    } catch (err) {
      console.warn('Layby PDF export skipped:', row.customer?.name || row.customerId, err?.message || err);
    }
  }

  if (!added) return { ok: false, error: 'No layby PDFs could be generated.' };

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(zipBlob);
  link.download = `layby-statements_${today}.zip`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  return { ok: true, count: added };
}
