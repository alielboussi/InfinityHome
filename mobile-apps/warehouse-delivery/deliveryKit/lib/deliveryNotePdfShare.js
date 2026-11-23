import { File, Paths } from 'expo-file-system';
import {
  cacheDirectory,
  copyAsync,
  deleteAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';

const NOTES_DIR = 'delivery-notes';

function safePdfBasename(name) {
  return String(name || 'delivery-note').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'delivery-note';
}

export async function prepareShareableDeliveryNotePdfUri(printUri, deliveryNumber) {
  const base = safePdfBasename(deliveryNumber);
  const dir = `${cacheDirectory}${NOTES_DIR}/`;
  const destUri = `${dir}${base}.pdf`;

  await makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  await deleteAsync(destUri, { idempotent: true }).catch(() => {});

  try {
    await copyAsync({ from: printUri, to: destUri });
    return destUri;
  } catch {
    const src = new File(printUri);
    const bytes = await src.bytes();
    const dest = new File(Paths.cache, NOTES_DIR, `${base}.pdf`);
    if (dest.exists) {
      dest.delete();
    }
    dest.create({ overwrite: true, intermediates: true });
    const stream = dest.writableStream();
    const writer = stream.getWriter();
    await writer.write(bytes);
    await writer.close();
    return dest.uri;
  }
}

export async function previewOrSharePdfFile(fileUri, dialogTitle, { forceShare = false } = {}) {
  const Sharing = await import('expo-sharing');
  const canShare = await Sharing.isAvailableAsync();
  if (forceShare || !(await File.canPreview(new File(fileUri)))) {
    if (!canShare) {
      throw new Error('Sharing is not available on this device.');
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: dialogTitle || 'Delivery note',
    });
    return;
  }
  const file = new File(fileUri);
  await File.preview(file, { title: dialogTitle });
}
