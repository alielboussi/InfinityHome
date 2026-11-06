import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const toDMY = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const formatDateTimeDMY = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${toDMY(d)} ${time}`;
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

export const buildTransferPdf = async ({
  title,
  transferNumber,
  capturedAt,
  fromLabel,
  toLabel,
  fromName,
  toName,
  items,
  remainingSrcMap,
  destCurrentMap,
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
      if (doc.setGState) {
        doc.setGState(new doc.GState({ opacity: 0.22 }));
      }
    } catch {}
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(140, 150, 165);
    doc.setFontSize(54);
    const stepX = 170;
    const stepY = 130;
    for (let y0 = margin; y0 < height - margin; y0 += stepY) {
      for (let x0 = margin; x0 < width - margin; x0 += stepX) {
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
  doc.text(title || 'Transfer', width / 2, y, { align: 'center' });
  y += 26;

  try {
    const logo = await loadImageDataUrl('/bestrest-logo.png');
    if (logo) {
      const logoH = 40;
      const logoW = 40;
      doc.addImage(logo, 'PNG', margin, y - 20, logoW, logoH);
      const textX = margin + logoW + 12;
      const topY = y - 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (company) {
        doc.text(company.company_name || company.name || 'Company', textX, topY);
      }
      doc.text(`Transfer #: ${transferNumber || '-'}`, textX, topY + 14);
      doc.text(`From: ${fromLabel || '-'}`, textX, topY + 28);
      doc.text(`To: ${toLabel || '-'}`, textX, topY + 42);
      doc.text(`Captured At: ${formatDateTimeDMY(capturedAt)}`, textX, topY + 56);
      y = topY + 74;
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (company) {
        doc.text(company.company_name || company.name || 'Company', margin, y - 6);
      }
      doc.text(`Transfer #: ${transferNumber || '-'}`, margin, y + 8);
      doc.text(`From: ${fromLabel || '-'}`, margin, y + 22);
      doc.text(`To: ${toLabel || '-'}`, margin, y + 36);
      doc.text(`Captured At: ${formatDateTimeDMY(capturedAt)}`, margin, y + 50);
      y += 66;
    }
  } catch {}

  doc.setFont('helvetica', 'bold');
  doc.text('Products:', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const fromCol = fromName ? `${fromName} Remaining Qty` : 'From Remaining Qty';
  const toCol = toName ? `${toName} Current Qty` : 'To Current Qty';

  const rows = [];
  let total = 0;
  (items || []).forEach((it) => {
    const kind = it.kind || 'product';
    const isParent = kind === 'set-parent';
    const isComponent = kind === 'set-component';
    const remainSrc = isParent ? '-' : (remainingSrcMap?.get(it.product_id) ?? '-');
    const destQty = isParent ? '-' : (destCurrentMap?.get(it.product_id) ?? '-');
    const qtyNumber = Number(it.qty) || 0;
    const tQty = isParent ? '-' : qtyNumber;
    const name = isComponent ? `- ${it.name}` : (isParent ? `${it.name} (Set)` : it.name);
    rows.push([it.sku || '-', name || '-', String(tQty), String(remainSrc), String(destQty)]);
    if (!isParent) total += qtyNumber;
  });

  const printable = width - 2 * margin;
  const colWidths = [90, 200, 70, 115, 115];
  const sum = colWidths.reduce((a, b) => a + b, 0);
  const scale = Math.min(1, printable / sum);
  const scaled = colWidths.map((w) => w * scale);

  autoTable(doc, {
    startY: y,
    margin: { top: margin, bottom: margin, left: margin, right: margin },
    head: [[ 'SKU', 'Product Name', 'Transfer Qty', fromCol, toCol ]],
    body: rows,
    styles: { font: 'helvetica', fontSize: 10, halign: 'center', cellPadding: 4, lineWidth: 0.4, overflow: 'linebreak' },
    headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], halign: 'center' },
    columnStyles: {
      0: { cellWidth: scaled[0] },
      1: { cellWidth: scaled[1], halign: 'left' },
      2: { cellWidth: scaled[2] },
      3: { cellWidth: scaled[3] },
      4: { cellWidth: scaled[4] },
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
    }
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : y;
  doc.setFont('helvetica', 'bold');
  doc.text(`Grand Total: ${total}`, margin, Math.min(finalY + 18, height - margin - 6));
  doc.setFont('helvetica', 'normal');
  return doc.output('blob');
};

export const triggerDownload = async (url, filename, forceBlob = false) => {
  try {
    let downloadUrl = url;
    let objectUrl = null;
    if (forceBlob && /^https?:/i.test(url)) {
      try {
        const resp = await fetch(url, { mode: 'cors' });
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        downloadUrl = objectUrl;
      } catch {}
    }
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename || 'transfer.pdf';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      } catch {}
    }, 1500);
  } catch {}
};
