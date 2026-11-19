import { jsPDF } from 'jspdf';
import { buildPriceLabelFilename, renderLabelNodeToCanvas, waitForLayout } from './labelPdfCapture';
import { apiUrl, withApiHeaders } from './apiUrl';
import { sendLabelsWhatsApp } from '../services/whatsapp';
import { logUserActivity } from './userActivityLog';
import { normalizeLabelQty } from './priceLabelFormatters';

async function blobToBase64(pdfBlob) {
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function buildPriceLabelPdfFromNodes(labelNodes, locationName) {
  if (!labelNodes?.length) throw new Error('Nothing to render — labels are still loading.');
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title: 'Price Printing' });

  let first = true;
  for (const node of labelNodes) {
    // eslint-disable-next-line no-await-in-loop
    await waitForLayout();
    // eslint-disable-next-line no-await-in-loop
    const canvas = await renderLabelNodeToCanvas(node);
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    if (!first) doc.addPage();
    first = false;
    doc.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');
  }

  const pdfBlob = doc.output('blob');
  if (!pdfBlob || pdfBlob.size < 4096) {
    throw new Error('Generated PDF is empty. Please try again.');
  }
  const filename = `${buildPriceLabelFilename(locationName)}.pdf`;
  return { pdfBlob, filename, doc };
}

export async function uploadPriceLabelPdf({ pdfBlob, filename, folder = 'desktop' }) {
  const pdfBase64 = await blobToBase64(pdfBlob);
  const resp = await fetch(apiUrl('/api/labels'), {
    method: 'POST',
    headers: withApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fileName: filename, folder, pdfBase64 }),
  });
  const json = await resp.json().catch(() => ({}));
  const url = json?.signedUrl || json?.publicUrl || '';
  if (!resp.ok || !url) {
    throw new Error(json?.error || `Label upload failed (${resp.status})`);
  }
  return { url, pdfBase64 };
}

export function printPriceLabelsWithFilename({
  locationName,
  selectedCount,
  labelSummary,
  showExportHint = true,
}) {
  const oldTitle = document.title;
  const autoTitle = buildPriceLabelFilename(locationName);
  logUserActivity({
    actionType: 'price_label_print',
    actionLabel: showExportHint ? 'Price Labels Exported (PDF)' : 'Price Labels Printed',
    details: `${selectedCount} item${selectedCount === 1 ? '' : 's'} • ${labelSummary}`,
    reference: autoTitle,
    entityType: 'price_label_batch',
    entityId: String(selectedCount),
  });
  try {
    document.title = autoTitle;
  } catch {}
  window.print();
  setTimeout(() => {
    try { document.title = oldTitle; } catch {}
    if (showExportHint) {
      alert('Choose "Save as PDF" in the print dialog to export.');
    }
  }, 400);
}

export async function sendPriceLabelsWhatsAppBatch({
  sendRenderRef,
  locationName,
  selectedInAddOrder,
  getItemDisplayName,
}) {
  await waitForLayout();
  const container = sendRenderRef?.current;
  const labelNodes = container ? Array.from(container.querySelectorAll('.a4-pair')) : [];
  if (!labelNodes.length) {
    throw new Error('Nothing to send yet — labels are still rendering. Try again.');
  }

  const { pdfBlob, filename } = await buildPriceLabelPdfFromNodes(labelNodes, locationName);
  const { url, pdfBase64 } = await uploadPriceLabelPdf({ pdfBlob, filename, folder: 'desktop' });

  const expandedCount = (selectedInAddOrder || []).reduce(
    (sum, item) => sum + normalizeLabelQty(item.qty),
    0,
  );

  const sendResult = await sendLabelsWhatsApp({
    pdfUrl: url,
    pdfBase64,
    pdfFilename: filename,
    message: `Price labels — ${expandedCount} label${expandedCount === 1 ? '' : 's'}`,
  });
  if (!sendResult.ok) {
    throw new Error(sendResult.error || 'WhatsApp send failed');
  }

  const labelSummary = (selectedInAddOrder || []).map((item) => {
    const name = getItemDisplayName?.(item) || item.type;
    return `${name} x${normalizeLabelQty(item.qty)}`;
  }).join('; ');

  logUserActivity({
    actionType: 'price_label_print',
    actionLabel: 'Price Labels Sent (WhatsApp)',
    details: `${selectedInAddOrder.length} item${selectedInAddOrder.length === 1 ? '' : 's'} • ${labelSummary}`,
    reference: filename,
    entityType: 'price_label_batch',
    entityId: String(selectedInAddOrder.length),
  });

  return { filename, expandedCount };
}