import {
  cacheDirectory,
  deleteAsync,
  EncodingType,
  makeDirectoryAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { fetchOrdersQuotePdf } from '../services/ordersApi';

function safeBasename(name) {
  return String(name || 'quote').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'quote';
}

export async function shareQuotePdfToWhatsApp(quoteId) {
  const { pdf_base64, filename } = await fetchOrdersQuotePdf(quoteId);
  const base = safeBasename(filename || `quote-${quoteId}`);
  const dir = `${cacheDirectory}quote-pdfs/`;
  const fileUri = `${dir}${base.endsWith('.pdf') ? base : `${base}.pdf`}`;
  await makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  await deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  await writeAsStringAsync(fileUri, pdf_base64, { encoding: EncodingType.Base64 });
  const Sharing = await import('expo-sharing');
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Share quote PDF',
  });
}
