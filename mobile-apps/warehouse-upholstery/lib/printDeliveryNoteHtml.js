import { Platform } from 'react-native';
import * as Print from 'expo-print';

function assertWebDocument() {
  if (typeof document === 'undefined') {
    throw new Error('Print is not available in this environment.');
  }
}

/** Hidden iframe print — works on Expo web (localhost) and avoids broken printToFileAsync. */
export function printHtmlInBrowser(html) {
  assertWebDocument();
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'Delivery note print');
    frame.style.position = 'fixed';
    frame.style.left = '-12000px';
    frame.style.top = '0';
    frame.style.width = '210mm';
    frame.style.height = '297mm';
    frame.style.border = 'none';
    document.body.appendChild(frame);

    const doc = frame.contentWindow?.document;
    if (!doc) {
      try {
        document.body.removeChild(frame);
      } catch {
        // ignore
      }
      reject(new Error('Print frame unavailable.'));
      return;
    }

    const cleanup = () => {
      try {
        document.body.removeChild(frame);
      } catch {
        // ignore
      }
    };

    const runPrint = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        setTimeout(cleanup, 2000);
      }
    };

    doc.open();
    doc.write(html);
    doc.close();
    frame.onload = runPrint;
    setTimeout(runPrint, 900);
  });
}

/** Open note HTML in a new tab (View PDF / print from browser on web). */
export function openDeliveryNoteHtmlInBrowser(html, title = 'Delivery note') {
  assertWebDocument();
  const w = window.open('', '_blank');
  if (!w) {
    throw new Error('Allow pop-ups to view the delivery note, then use Print → Save as PDF.');
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  try {
    w.document.title = title;
  } catch {
    // ignore
  }
}

/**
 * Print delivery note HTML — Android/iOS system print, or browser print dialog on web.
 */
export async function printDeliveryNoteFromHtml(html) {
  if (Platform.OS === 'web') {
    await printHtmlInBrowser(html);
    return;
  }
  const file = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
  });
  if (!file?.uri) {
    throw new Error('Could not build print file.');
  }
  await Print.printAsync({ uri: file.uri });
}
