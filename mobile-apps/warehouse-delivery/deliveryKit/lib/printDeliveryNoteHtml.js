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

/** 30-second timeout for printing before prompting skip or retry. */
export const DELIVERY_PRINT_TIMEOUT_MS = 30_000;
export const PRINT_TIMEOUT_CODE = 'print_timeout';
export const PRINT_TIMEOUT_MESSAGE = 'Print timed out after 30 seconds due to connectivity. Please check your printer connection, then tap Retry or Skip printing.';

export function isPrintConnectivityFailure(err) {
  const code = String(err?.code || '').toLowerCase();
  if (code === PRINT_TIMEOUT_CODE) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return /timed out|timeout|network|connectivity|econnreset|enotfound|ehostunreach|failed to connect|socket|unreachable|connection refused/i.test(msg);
}

export function withPrintTimeout(promise, timeoutMs = DELIVERY_PRINT_TIMEOUT_MS) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(PRINT_TIMEOUT_MESSAGE);
      err.code = PRINT_TIMEOUT_CODE;
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Print delivery note HTML — Android/iOS system print, or browser print dialog on web.
 * Enforces a 30-second timeout on connectivity/spooler hangs.
 */
export async function printDeliveryNoteFromHtml(html, { timeoutMs = DELIVERY_PRINT_TIMEOUT_MS } = {}) {
  const run = async () => {
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
  };
  await withPrintTimeout(run(), timeoutMs);
}
