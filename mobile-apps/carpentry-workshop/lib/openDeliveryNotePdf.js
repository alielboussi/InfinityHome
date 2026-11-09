import * as Print from 'expo-print';
import { Platform } from 'react-native';
import { buildDeliveryNotePrintHtml } from './buildDeliveryNotePrintHtml';
import { getDeliveryNoteCompanyLogoDataUri } from './deliveryNoteCompanyLogo';
import {
  prepareShareableDeliveryNotePdfUri,
  previewOrSharePdfFile,
} from './deliveryNotePdfShare';
import { openDeliveryNoteHtmlInBrowser, withPrintTimeout } from './printDeliveryNoteHtml';
import { resolveDeliveryDriverSignatureDataUri, coerceInlineSignatureForPrint } from './resolveDeliveryDriverSignatureDataUri';

/** Build A4 PDF from note fields and open the system share / viewer sheet. */
export async function openDeliveryNotePdf({
  deliveryNumber,
  driverName,
  dispatchedBy,
  driverSignatureSrc,
  driverSignatureDataUri,
  driverSignatureUrl,
  submittedAt,
  printGroups,
  copies = 1,
}) {
  const companyLogoSrc = await getDeliveryNoteCompanyLogoDataUri().catch(() => '');
  const signatureSrc = await resolveDeliveryDriverSignatureDataUri({
    dataUri: driverSignatureDataUri,
    url: driverSignatureUrl,
  }) || coerceInlineSignatureForPrint(driverSignatureSrc);
  const html = buildDeliveryNotePrintHtml({
    deliveryNumber,
    driverName,
    dispatchedBy,
    driverSignatureSrc: signatureSrc,
    companyLogoSrc,
    submittedAt: submittedAt || new Date().toISOString(),
    printGroups,
    copies: Math.max(1, Math.min(10, Number(copies) || 1)),
  });
  if (Platform.OS === 'web') {
    openDeliveryNoteHtmlInBrowser(html, deliveryNumber || 'Delivery note');
    return;
  }
  const file = await withPrintTimeout(Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
  }));
  if (!file?.uri) {
    throw new Error('Could not build delivery note PDF.');
  }
  const shareUri = await prepareShareableDeliveryNotePdfUri(file.uri, deliveryNumber);
  await previewOrSharePdfFile(shareUri, deliveryNumber || 'Delivery note');
}
