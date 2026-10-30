import { buildDeliveryNotePrintHtml } from './buildDeliveryNotePrintHtml';
import { getDeliveryNoteCompanyLogoDataUriWeb } from './deliveryNoteCompanyLogo';
import { buildDeliveryPrintGroupsFromEntries } from './warehouseDeliveryPrintGroups';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { waitForImages } from './labelPdfCapture';

export const DEFAULT_DELIVERY_NOTE_PRINT_COPIES = 2;

export { buildDeliveryPrintGroupsFromEntries } from './warehouseDeliveryPrintGroups';

export async function buildWarehouseDeliveryNoteHtml({
  session,
  entries,
  driverSignatureSrc = '',
  copies = DEFAULT_DELIVERY_NOTE_PRINT_COPIES,
}) {
  const meta = session?.metadata || {};
  const printGroups = buildDeliveryPrintGroupsFromEntries(entries);
  const companyLogoSrc = await getDeliveryNoteCompanyLogoDataUriWeb().catch(() => '');
  return buildDeliveryNotePrintHtml({
    deliveryNumber: session?.delivery_number || session?.id || '',
    driverName: meta.driver_name || '',
    dispatchedBy: meta.dispatched_by_name || session?.created_by_name || '',
    driverSignatureSrc: driverSignatureSrc || meta.driver_signature_url || '',
    companyLogoSrc,
    submittedAt: session?.submitted_at || session?.created_at || new Date().toISOString(),
    printGroups,
    copies,
  });
}

/**
 * Save the A4 delivery note HTML as a PDF download (no browser print dialog).
 */
export async function renderWarehouseDeliveryNotePdfBlob(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Delivery note PDF');
  frame.style.position = 'fixed';
  frame.style.left = '-12000px';
  frame.style.top = '0';
  frame.style.width = '210mm';
  frame.style.height = '297mm';
  frame.style.border = 'none';
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = win?.document;
  if (!doc) {
    document.body.removeChild(frame);
    throw new Error('PDF frame unavailable.');
  }

  doc.open();
  doc.write(html);
  doc.close();

  await new Promise((resolve) => {
    frame.onload = () => resolve();
    setTimeout(resolve, 800);
  });
  await waitForImages(doc.body);

  const pageNodes = doc.querySelectorAll('section.page');
  const targets = pageNodes.length ? [...pageNodes] : [doc.body];
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  for (let i = 0; i < targets.length; i += 1) {
    if (i > 0) pdf.addPage();
    const canvas = await html2canvas(targets[i], {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    const img = canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(img, 'JPEG', 0, 0, 210, 297);
  }

  const blob = pdf.output('blob');
  try {
    document.body.removeChild(frame);
  } catch {
    // ignore
  }
  return blob;
}

export async function downloadWarehouseDeliveryNotePdf(html, filename = 'delivery-note.pdf') {
  const blob = await renderWarehouseDeliveryNotePdfBlob(html);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @deprecated Prefer downloadWarehouseDeliveryNotePdf for Hassan deliveries.
 */
export function printWarehouseDeliveryNoteInBrowser(html) {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = 'none';
  document.body.appendChild(frame);

  const doc = frame.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(frame);
    throw new Error('Print frame unavailable.');
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    try {
      document.body.removeChild(frame);
    } catch {
      // ignore
    }
  };

  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      setTimeout(cleanup, 1500);
    }
  };
}

export async function resolveDeliverySignatureSrc(session, fetchAuthenticated) {
  const url = String(session?.metadata?.driver_signature_url || '').trim();
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (typeof fetchAuthenticated !== 'function') return url;
  try {
    const blob = await fetchAuthenticated(url);
    if (!blob) return url;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || url);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}
