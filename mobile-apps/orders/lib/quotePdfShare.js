import { Platform, Share } from 'react-native';
import { File } from 'expo-file-system';
import {
  cacheDirectory,
  deleteAsync,
  EncodingType,
  getContentUriAsync,
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

  const file = new File(fileUri);
  if (await File.canPreview(file)) {
    await File.preview(file, { title: 'Share quote PDF' });
    return;
  }

  const shareUrl = Platform.OS === 'android'
    ? await getContentUriAsync(fileUri)
    : fileUri;

  const result = await Share.share(
    Platform.OS === 'ios'
      ? { url: shareUrl, title: 'Share quote PDF' }
      : { message: 'Quote PDF', url: shareUrl, title: 'Share quote PDF' },
  );
  if (result.action === Share.dismissedAction) {
    return;
  }
}
