import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildDeliveryNotePrintHtml } from './buildDeliveryNotePrintHtml';
import { getDeliveryNoteCompanyLogoDataUri } from './deliveryNoteCompanyLogo';

/** Build A4 PDF from note fields and open the system share / viewer sheet. */
export async function openDeliveryNotePdf({
  deliveryNumber,
  driverName,
  dispatchedBy,
  driverSignatureSrc,
  submittedAt,
  printGroups,
  copies = 1,
}) {
  const companyLogoSrc = await getDeliveryNoteCompanyLogoDataUri().catch(() => '');
  const html = buildDeliveryNotePrintHtml({
    deliveryNumber,
    driverName,
    dispatchedBy,
    driverSignatureSrc,
    companyLogoSrc,
    submittedAt: submittedAt || new Date().toISOString(),
    printGroups,
    copies: Math.max(1, Math.min(10, Number(copies) || 1)),
  });
  const file = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('PDF viewer is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: deliveryNumber || 'Delivery note',
  });
}
