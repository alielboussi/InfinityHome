import jsPDF from 'jspdf';
import { drawStocktakeReportHeader } from './stocktakeVariancePdf';
import { appendStocktakePageNumbers } from './stocktakePdfPageNumbers';
import { renderSegmentedStocktakeTable } from './stocktakePdfSetGroups';
import { fmtStocktakeQty } from './stocktakePdfFormat';

function fmtDateFile(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Transfer line items PDF — same grid/chrome as variance report; columns SKU, Name, Transfer Route, Qty.
 */
export async function downloadTransferSessionItemsPdf({
  session,
  lines,
  company,
  routeLabel,
  fromName,
  toName,
}) {
  const ref = session?.delivery_number || session?.id || 'transfer';
  const when = session?.transfer_datetime || session?.created_at;
  const whenLabel = fmtDateTime(when);

  const doc = new jsPDF('l', 'pt', 'a4');
  const { margin, metaY, pageWidth } = await drawStocktakeReportHeader(doc, {
    company,
    title: 'Transfer Items',
    locationLabel: routeLabel || `${fromName || ''} → ${toName || ''}`,
    periodLine: `Reference: ${ref} · ${whenLabel}`,
    footnote: 'Transfer Route shows From location → To location for each line.',
  });

  const sorted = [...(lines || [])].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }),
  );
  const route = routeLabel || `${fromName || ''} → ${toName || ''}`;
  let totalQty = 0;
  const body = sorted.map((row) => {
    const qty = Number(row.qty || 0);
    totalQty += qty;
    return [
      row.sku || '',
      row.name || '',
      row.routeLabel || route,
      fmtStocktakeQty(qty),
    ];
  });

  renderSegmentedStocktakeTable(doc, {
    startY: metaY + 12,
    margin,
    colSpan: 4,
    head: [['SKU', 'Name', 'Transfer Route', 'Qty']],
    body,
    foot: [[
      { content: '', colSpan: 2 },
      { content: 'Total', styles: { halign: 'center', fontStyle: 'bold' } },
      { content: fmtStocktakeQty(totalQty), styles: { halign: 'center', fontStyle: 'bold' } },
    ]],
    tableOptions: {
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', halign: 'center', valign: 'middle' },
      headStyles: {
        fillColor: [30, 90, 180],
        textColor: 255,
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
        lineColor: [30, 90, 180],
      },
      footStyles: {
        fillColor: [255, 255, 255],
        textColor: [20, 20, 20],
        fontStyle: 'bold',
        halign: 'center',
        lineColor: [140, 140, 140],
      },
      columnStyles: {
        0: { cellWidth: 72 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 160 },
        3: { cellWidth: 48 },
      },
      tableWidth: pageWidth - margin * 2,
    },
  }) ?? metaY + 16;

  doc.setPage(doc.internal.getNumberOfPages());
  appendStocktakePageNumbers(doc);

  const stamp = fmtDateFile(when) || 'transfer';
  const safeRef = String(ref).replace(/[^\w-]+/g, '_').slice(0, 40);
  const filename = `Transfer_Items_${safeRef}_${stamp}.pdf`;
  doc.save(filename);
  return filename;
}
