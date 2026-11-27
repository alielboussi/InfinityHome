import { buildDeliveryNotePrintHtml } from './buildDeliveryNotePrintHtml';
import { getDeliveryNoteCompanyLogoDataUri } from './deliveryNoteCompanyLogo';
import { openDeliveryNotePdf } from './openDeliveryNotePdf';
import { printDeliveryNoteFromHtml } from './printDeliveryNoteHtml';
import { resolveDeliveryDriverSignatureDataUri, coerceInlineSignatureForPrint } from './resolveDeliveryDriverSignatureDataUri';

export function isFarmDeliveryDocumentKind(kind) {
  return /farm/i.test(String(kind || ''));
}

async function buildNoteHtml(fields = {}) {
  const copies = Math.max(1, Math.min(10, Number(fields.copies) || 1));
  const companyLogoSrc = await getDeliveryNoteCompanyLogoDataUri().catch(() => '');
  const signatureSrc = await resolveDeliveryDriverSignatureDataUri({
    dataUri: fields.driverSignatureDataUri,
    url: fields.driverSignatureUrl,
  }) || coerceInlineSignatureForPrint(fields.driverSignatureSrc);
  return buildDeliveryNotePrintHtml({
    deliveryNumber: fields.deliveryNumber,
    driverName: fields.driverName,
    driverPhone: fields.driverPhone || '',
    dispatchedBy: fields.dispatchedBy || '',
    driverSignatureSrc: signatureSrc,
    companyLogoSrc,
    submittedAt: fields.submittedAt || new Date().toISOString(),
    printGroups: fields.printGroups || [],
    copies,
    documentKind: fields.documentKind,
    customerName: fields.customerName || '',
    customerPhone: fields.customerPhone || '',
  });
}

/**
 * Farm notes: share / send sheet.
 * Floor 1, orders, sold, sent reprints: Epson Email Print (no printer picker).
 */
export async function outputDeliveryNote(fields = {}) {
  if (isFarmDeliveryDocumentKind(fields.documentKind)) {
    return openDeliveryNotePdf({ ...fields, forceShare: true });
  }
  const html = await buildNoteHtml(fields);
  return printDeliveryNoteFromHtml(html, { deliveryNumber: fields.deliveryNumber });
}
