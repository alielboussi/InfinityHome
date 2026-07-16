import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { deliveryLineQty } from './warehouseDelivery';

const toDMY = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const formatDateTimeDMY = (value) => {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  try {
    return d.toLocaleString('en-GB', {
      timeZone: 'Africa/Lusaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${toDMY(d)} ${time}`;
  }
};

const loadImageDataUrl = async (path) => {
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(b);
    });
  } catch {
    return null;
  }
};

/**
 * Hassan / admin delivery PDF.
 * Columns: Product Name | Transfer Quantity | Expected Stock at Destination
 * (no source-warehouse remaining column)
 */
export const buildWarehouseDeliveryPdf = async ({
  session,
  entries,
  fromName,
  toName,
  destStockMap,
  company,
}) => {
  const doc = new jsPDF('p', 'pt', 'a4');
  const page = doc.internal.pageSize;
  const width = page.getWidth();
  const height = page.getHeight();
  const cm = 28.346;
  const margin = cm;
  let y = margin + 12;

  const drawFrame = () => {
    doc.setLineWidth(2);
    doc.rect(cm / 2, cm / 2, width - cm, height - cm);
  };

  const drawWatermark = () => {
    const label = company?.company_name || company?.name || 'Best Rest Furniture';
    try { doc.saveGraphicsState && doc.saveGraphicsState(); } catch {}
    try {
      if (doc.setGState) doc.setGState(new doc.GState({ opacity: 0.22 }));
    } catch {}
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(140, 150, 165);
    doc.setFontSize(54);
    for (let y0 = margin; y0 < height - margin; y0 += 130) {
      for (let x0 = margin; x0 < width - margin; x0 += 170) {
        doc.text(label, x0, y0, { angle: 30 });
      }
    }
    doc.setTextColor(0, 0, 0);
    try { doc.restoreGraphicsState && doc.restoreGraphicsState(); } catch {}
  };

  drawFrame();
  drawWatermark();
  const drawnPages = new Set([1]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Warehouse Delivery', width / 2, y, { align: 'center' });
  y += 26;

  try {
    const logo = await loadImageDataUrl('/bestrest-logo.png');
    if (logo) {
      doc.addImage(logo, 'PNG', margin, y - 20, 40, 40);
      const textX = margin + 52;
      const topY = y - 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (company) doc.text(company.company_name || company.name || 'Company', textX, topY);
      doc.text(`Delivery #: ${session?.delivery_number || session?.id || '-'}`, textX, topY + 14);
      doc.text(`Status: ${session?.status || '-'}`, textX, topY + 28);
      doc.text(`From: ${fromName || '-'}`, textX, topY + 42);
      doc.text(`To: ${toName || '-'}`, textX, topY + 56);
      y = topY + 74;
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Delivery #: ${session?.delivery_number || session?.id || '-'}`, margin, y);
      doc.text(`Status: ${session?.status || '-'}`, margin, y + 14);
      doc.text(`From: ${fromName || '-'}`, margin, y + 28);
      doc.text(`To: ${toName || '-'}`, margin, y + 42);
      y += 60;
    }
  } catch {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Delivery #: ${session?.delivery_number || session?.id || '-'}`, margin, y);
    y += 20;
  }

  doc.setFontSize(10);
  doc.text(`Submitted by: ${session?.created_by_email || '-'}`, margin, y);
  y += 14;
  doc.text(`Submitted: ${formatDateTimeDMY(session?.submitted_at || session?.transfer_datetime || session?.created_at)}`, margin, y);
  y += 14;
  if (session?.accepted_at || session?.applied_at) {
    doc.text(`Accepted: ${formatDateTimeDMY(session?.accepted_at || session?.applied_at)}`, margin, y);
    y += 14;
  }
  if (session?.completed_at) {
    doc.text(`Completed: ${formatDateTimeDMY(session.completed_at)}`, margin, y);
    y += 14;
  }
  y += 8;

  const rows = [];
  let total = 0;
  (entries || []).forEach((it) => {
    const kind = it.kind || 'product';
    if (kind === 'set-parent') {
      rows.push([`${it.name || '-'} (Set)`, '-', '-']);
      return;
    }
    const qty = deliveryLineQty(it);
    const name = kind === 'set-component' ? `- ${it.name || '-'}` : (it.name || '-');
    let expected = it.expected_dest_stock;
    if (expected == null && it.product_id && destStockMap) {
      const before = Number(destStockMap.get(String(it.product_id)) || 0);
      expected = before + qty;
    }
    rows.push([name, String(qty), expected == null ? '-' : String(expected)]);
    if (kind !== 'set-parent') total += qty;
  });

  const printable = width - 2 * margin;
  const colWidths = [280, 100, 140];
  const sum = colWidths.reduce((a, b) => a + b, 0);
  const scale = Math.min(1, printable / sum);
  const scaled = colWidths.map((w) => w * scale);

  autoTable(doc, {
    startY: y,
    margin: { top: margin, bottom: margin, left: margin, right: margin },
    head: [['Product Name', 'Transfer Qty', 'Expected Stock at Destination']],
    body: rows,
    styles: { font: 'helvetica', fontSize: 10, halign: 'center', cellPadding: 4, lineWidth: 0.4, overflow: 'linebreak' },
    headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], halign: 'center' },
    columnStyles: {
      0: { cellWidth: scaled[0], halign: 'left' },
      1: { cellWidth: scaled[1] },
      2: { cellWidth: scaled[2] },
    },
    theme: 'grid',
    willDrawCell: () => {
      try {
        const num = doc.internal?.getCurrentPageInfo?.().pageNumber || 1;
        if (!drawnPages.has(num)) {
          drawFrame();
          drawWatermark();
          drawnPages.add(num);
        }
      } catch {}
    },
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : y;
  doc.setFont('helvetica', 'bold');
  doc.text(`Grand Total: ${total}`, margin, Math.min(finalY + 18, height - margin - 6));
  return doc.output('blob');
};

export const openPdfBlob = (blob, filename = 'warehouse-delivery.pdf') => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  }, 1500);
};
