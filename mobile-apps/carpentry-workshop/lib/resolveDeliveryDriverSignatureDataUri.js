import * as FileSystem from 'expo-file-system';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice);
  }
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  return '';
}

async function remoteUrlToDataUri(remote) {
  let timeoutId = null;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(''), 12000);
  });
  const work = async () => {
    try {
      const cachePath = `${FileSystem.cacheDirectory}delivery-sig-${Date.now()}.png`;
      const { uri, status } = await FileSystem.downloadAsync(remote, cachePath);
      if (status >= 200 && status < 300) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (base64) return `data:image/png;base64,${base64}`;
      }
    } catch {
      /* try fetch below */
    }

    try {
      const res = await fetch(remote);
      if (!res.ok) return '';
      const contentType = String(res.headers.get('content-type') || 'image/png').split(';')[0].trim()
        || 'image/png';
      const base64 = arrayBufferToBase64(await res.arrayBuffer());
      return base64 ? `data:${contentType};base64,${base64}` : '';
    } catch {
      return '';
    }
  };
  return Promise.race([work(), timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

/** Prefer inline data URI; never return https (broken in expo-print PDF). */
export function coerceInlineSignatureForPrint(src) {
  const s = String(src || '').trim();
  if (s.startsWith('data:image/')) return s;
  return '';
}

/**
 * expo-print HTML must embed signatures as data: URIs — remote https URLs show as broken images in PDF/print.
 */
export async function resolveDeliveryDriverSignatureDataUri({
  dataUri = '',
  url = '',
} = {}) {
  const inline = String(dataUri || '').trim();
  if (inline.startsWith('data:image/')) return inline;

  const remote = String(url || '').trim();
  if (remote.startsWith('data:image/')) return remote;
  if (!remote.startsWith('http')) return '';

  return remoteUrlToDataUri(remote);
}
