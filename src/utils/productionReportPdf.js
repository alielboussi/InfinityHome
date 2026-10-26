import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/** Matches Transfers Report PDF table header colour. */
const REPORT_HEAD_FILL = [0, 180, 216];

export function formatProductionReportDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export function productionLogUserLabel(row) {
  return row?.user_display_name || row?.user_email || '—';
}

export function formatProductionLogSource(row) {
  const raw = String(row?.source || '').trim();
  if (raw === 'warehouse_production_kiosk') return 'Web kiosk (retired)';
  if (raw === 'warehouse_production_app') return 'Upholstery Production app';
  if (!raw) return 'Upholstery Production app';
  return raw;
}

function writeTransfersStyleHeader(doc, { title, lines, startY = 40 }) {
  let y = startY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 40, y);
  y += 18;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  (lines || []).forEach((line) => {
    doc.text(String(line), 40, y);
    y += 14;
  });
  return y;
}

function autoTableTransfersStyle(doc, { startY, head, body }) {
  autoTable(doc, {
    startY,
    head,
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: REPORT_HEAD_FILL },
  });
}

/**
 * One PDF page per new production create (same structure as Transfers Report export).
 */
export function downloadProductionCreationsPdf({ rows, startDate, endDate }) {
  const doc = new jsPDF('p', 'pt', 'a4');
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return;

  list.forEach((row, index) => {
    if (index > 0) doc.addPage();
    const dateLabel = formatProductionReportDateTime(row.created_at);
    const userLabel = productionLogUserLabel(row);
    const y = writeTransfersStyleHeader(doc, {
      title: 'Production Report',
      lines: [
        'Report type: New seating items sent to warehouse',
        `Period: ${startDate || '—'} to ${endDate || '—'}`,
        `Entry ID: ${row.id || '—'}`,
        `Date: ${dateLabel}`,
        `User: ${userLabel}`,
        `Source: ${formatProductionLogSource(row)}`,
      ],
    });
    autoTableTransfersStyle(doc, {
      startY: y + 10,
      head: [['Product', 'SKU', 'Qty']],
      body: [[row.name || '—', row.sku || '—', String(row.qty_added ?? row.qty_after ?? 0)]],
    });
  });

  doc.save(`Production_Creates_${startDate || 'start'}_to_${endDate || 'end'}.pdf`);
}

export function groupStockIncreasesByDateUser(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const d = new Date(row.created_at);
    const day = Number.isNaN(d.getTime())
      ? '—'
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const user = productionLogUserLabel(row);
    const key = `${day}\0${user}`;
    if (!map.has(key)) {
      map.set(key, { date: day, user, items: [] });
    }
    map.get(key).items.push(row);
  });
  return Array.from(map.values()).sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.user.localeCompare(b.user);
  });
}

/**
 * One PDF page per user per date (Transfers Report page layout).
 */
export function downloadProductionStockIncreasesPdf({ rows, startDate, endDate }) {
  const doc = new jsPDF('p', 'pt', 'a4');
  const groups = groupStockIncreasesByDateUser(rows);
  if (!groups.length) return;

  groups.forEach((group, index) => {
    if (index > 0) doc.addPage();
    const totalQty = group.items.reduce(
      (sum, row) => sum + Math.max(0, Number(row.qty_added) || 0),
      0,
    );
    const y = writeTransfersStyleHeader(doc, {
      title: 'Production Report',
      lines: [
        'Report type: Stock increases on existing warehouse packets',
        `Period: ${startDate || '—'} to ${endDate || '—'}`,
        `Date: ${group.date}`,
        `User: ${group.user}`,
        `Total qty added: ${totalQty}`,
        `Sources: ${[...new Set(group.items.map(formatProductionLogSource))].join(', ')}`,
      ],
    });
    const body = group.items.map((row) => [
      row.name || '—',
      row.sku || '—',
      String(row.qty_added ?? 0),
    ]);
    autoTableTransfersStyle(doc, {
      startY: y + 10,
      head: [['Product', 'SKU', 'Qty added']],
      body,
    });
  });

  doc.save(`Production_Stock_Increases_${startDate || 'start'}_to_${endDate || 'end'}.pdf`);
}
