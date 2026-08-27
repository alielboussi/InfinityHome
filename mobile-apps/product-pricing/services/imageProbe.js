import { Image } from 'expo-image';

const PROBE_TIMEOUT_MS = 6000;
const PROBE_CONCURRENCY = 12;

export async function probeImageUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(raw, {
      method: 'GET',
      headers: { Range: 'bytes=0-511' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return false;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
      return false;
    }
    return true;
  } catch {
    try {
      await Image.prefetch(raw);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Probe each product image URL. Calls onStatus(productId, status) where status is:
 * none | checking | ok | broken
 */
export async function probeCatalogImageStatuses(products, onStatus) {
  const rows = products || [];
  rows.forEach((product) => {
    if (!String(product?.imageUrl || '').trim()) {
      onStatus(product.id, 'none');
    }
  });

  const queue = rows.filter((product) => String(product?.imageUrl || '').trim());
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const product = queue[index];
      onStatus(product.id, 'checking');
      const ok = await probeImageUrl(product.imageUrl);
      onStatus(product.id, ok ? 'ok' : 'broken');
    }
  }

  const workers = Array.from(
    { length: Math.min(PROBE_CONCURRENCY, Math.max(queue.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
}

export function isMissingDisplayableImage(product, imageStatusById = {}, statusKey = null) {
  const url = String(product?.imageUrl || product?.image_url || '').trim();
  if (!url) return true;
  const key = statusKey || product?.id;
  const status = imageStatusById[key];
  if (status === 'checking' || status === undefined) return false;
  return status === 'broken' || status === 'none';
}

export function countMissingDisplayableImages(products, imageStatusById = {}, keyFn) {
  const resolveKey = keyFn || ((product) => `${product?.__isCombo ? 'combo' : 'product'}_${product?.id}`);
  return (products || []).filter((product) => (
    isMissingDisplayableImage(product, imageStatusById, resolveKey(product))
  )).length;
}
