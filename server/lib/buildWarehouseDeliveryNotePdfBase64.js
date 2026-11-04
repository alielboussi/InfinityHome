import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DELIVERY_NOTE_DISCLAIMER } from '../../src/utils/buildDeliveryNotePrintHtml.js';
import { DELIVERY_NOTE_LOGO_DATA_URI } from '../../src/utils/deliveryNoteCompanyLogoEmbedded.js';
import { deliverySenderName } from '../../src/utils/warehouseDelivery.js';
import { buildDeliveryPrintGroupsFromEntries } from '../../src/utils/warehouseDeliveryPrintGroups.js';
import { createWarehouseDeliveryNameFormatter } from '../../src/utils/warehouseDeliveryDisplayName.js';
import { formatZambiaDate, formatZambiaTime } from '../../src/utils/zambiaDateTime.js';

function deliveryPrintSubrowIsPacketLine(line, assemblyName = '') {
  if (!line || typeof line !== 'object') return false;
  if (line.line_kind === 'reason' || line.kind === 'reason') return true;
  const packetNo = line.packet_number ?? line.metadata?.packet_number;
  if (packetNo != null && String(packetNo).trim() !== '') return true;
  if (line.packet_id || line.metadata?.packet_id) return true;
  const asm = String(assemblyName || '').trim().toLowerCase();
  const name = String(line.name || '').trim().toLowerCase();
  if (asm && name === asm) return false;
  return Boolean(name);
}

function formatPrintLineLabel(line, assemblyName = '') {
  const depth = Number(line.depth) || 0;
  const namePart = String(line.name || line.reason || 'Packet').trim();
  if (line.line_kind === 'reason' || line.kind === 'reason') {
    return `-Reason ${namePart}`;
  }
  if (depth === 2) return `-- ${namePart}`;
  if (depth === 1) return `- ${namePart}`;
  if (!deliveryPrintSubrowIsPacketLine(line, assemblyName)) return null;
  return `- ${namePart}`;
}

function tableBodyFromPrintGroups(printGroups) {
  const body = [];
  for (const group of printGroups || []) {
    const title = String(group.set_name || group.assembly_name || 'Product');
    const units = Math.max(1, Number(group.units) || 1);
    body.push([title, String(units)]);
    for (const line of group.lines || []) {
      const label = formatPrintLineLabel(line, title);
      if (label == null) continue;
      const qty = line.qty != null && line.qty !== '' ? String(line.qty) : '';
      body.push([label, qty]);
    }
  }
  return body.length ? body : [['—', '0']];
}

function logoFormatFromDataUri(dataUri) {
  const m = String(dataUri || '').match(/^data:image\/(jpeg|jpg|png);base64,/i);
  if (!m) return { format: 'JPEG', base64: '' };
  const format = m[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG';
  const base64 = dataUri.replace(/^data:image\/[^;]+;base64,/i, '');
  return { format, base64 };
}

/**
 * A4 delivery note PDF (Node) for WhatsApp — same line data as the print HTML note.
 */
export function buildWarehouseDeliveryNotePdfBase64({
  session,
  entries,
  copies = 1,
  printGroups: printGroupsOverride,
  assemblyColorContext = null,
} = {}) {
  const meta = session?.metadata || {};
  const formatter = assemblyColorContext
    ? createWarehouseDeliveryNameFormatter(assemblyColorContext)
    : null;
  const printGroups = printGroupsOverride || buildDeliveryPrintGroupsFromEntries(entries || [], formatter);
  const copyCount = Math.max(1, Math.min(3, Number(copies) || 1));
  const dn = String(session?.delivery_number || session?.id || '').trim() || 'Delivery';
  const at = session?.submitted_at || session?.created_at || new Date().toISOString();
  const dispatched = deliverySenderName(session) || '—';
  const driver = String(meta.driver_name || '').trim() || '—';

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;

  for (let copy = 0; copy < copyCount; copy += 1) {
    if (copy > 0) doc.addPage();

    let y = margin;
    const logo = logoFormatFromDataUri(DELIVERY_NOTE_LOGO_DATA_URI);
    if (logo.base64) {
      try {
        doc.addImage(logo.base64, logo.format, margin, y, 18, 18);
      } catch {
        /* logo optional */
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Delivery Note', pageW / 2, y + 6, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Bestrest Furniture', pageW / 2, y + 12, { align: 'center' });
    y += 22;

    doc.setFontSize(10);
    doc.text(`Delivery #: ${dn}`, margin, y);
    y += 5;
    doc.text(`Date: ${formatZambiaDate(at)}    Time: ${formatZambiaTime(at)}`, margin, y);
    y += 5;
    doc.text(`Dispatched by: ${dispatched}`, margin, y);
    y += 5;
    doc.text(`Driver: ${driver}`, margin, y);
    y += 4;

    autoTable(doc, {
      startY: y + 2,
      margin: { left: margin, right: margin },
      head: [['Product Name', 'Qty']],
      body: tableBodyFromPrintGroups(printGroups),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: pageW - 2 * margin - 22 },
        1: { cellWidth: 22, halign: 'center' },
      },
      theme: 'grid',
    });

    let footY = (doc.lastAutoTable?.finalY || y + 40) + 8;
    if (meta.driver_signature_url) {
      doc.setFontSize(9);
      doc.text('Driver signature: captured electronically', margin, footY);
      footY += 6;
    }

    doc.setFontSize(7);
    const disclaimer = doc.splitTextToSize(DELIVERY_NOTE_DISCLAIMER, pageW - 2 * margin);
    doc.text(disclaimer, margin, Math.min(footY, 270));

    if (copyCount > 1) {
      doc.setFontSize(8);
      doc.text(`Copy ${copy + 1} of ${copyCount}`, pageW - margin, 290, { align: 'right' });
    }
  }

  const dataUri = doc.output('datauristring');
  return String(dataUri).replace(/^data:application\/pdf[^,]*,/, '').replace(/\s+/g, '');
}
