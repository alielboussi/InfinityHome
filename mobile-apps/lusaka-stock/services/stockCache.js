import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';

const STOCK_CACHE_KEY = 'lusaka_stock_cache_v3';
const IMAGE_CACHE_DIR = `${FileSystem.cacheDirectory}lusaka-stock-images/`;

async function ensureImageDir() {
  const info = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
  }
}

function extensionFromUrl(url) {
  const match = String(url || '').match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
  if (!match) return '.jpg';
  const ext = match[1].toLowerCase();
  return ext === 'jpeg' ? '.jpg' : `.${ext}`;
}

async function localPathForUrl(remoteUrl) {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    String(remoteUrl),
  );
  return `${IMAGE_CACHE_DIR}${hash}${extensionFromUrl(remoteUrl)}`;
}

export async function resolveCachedImageUri(remoteUrl) {
  const url = String(remoteUrl || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    await ensureImageDir();
    const localPath = await localPathForUrl(url);
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) return localPath;
  } catch {
    // fall through to remote URL
  }
  return url;
}

export async function cacheImage(remoteUrl) {
  const url = String(remoteUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return url;
  try {
    await ensureImageDir();
    const localPath = await localPathForUrl(url);
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) return localPath;
    const result = await FileSystem.downloadAsync(url, localPath);
    return result.uri || localPath;
  } catch {
    return url;
  }
}

export async function hydrateRowsWithCachedImages(rows = []) {
  return Promise.all(rows.map(async (row) => {
    const imageUrl = String(row.imageUrl || '').trim();
    if (!imageUrl) {
      return { ...row, displayImageUrl: '' };
    }
    const cachedImageUrl = row.cachedImageUrl || await resolveCachedImageUri(imageUrl);
    return {
      ...row,
      cachedImageUrl: cachedImageUrl !== imageUrl ? cachedImageUrl : row.cachedImageUrl,
      displayImageUrl: cachedImageUrl || imageUrl,
    };
  }));
}

export async function cacheRowImages(rows = [], { batchSize = 6, onBatchComplete } = {}) {
  const nextRows = rows.map((row) => ({ ...row }));
  const pending = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => String(row.imageUrl || '').trim());

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    await Promise.all(batch.map(async ({ row, index }) => {
      const cachedImageUrl = await cacheImage(row.imageUrl);
      nextRows[index] = {
        ...nextRows[index],
        cachedImageUrl,
        displayImageUrl: cachedImageUrl || row.imageUrl,
      };
    }));
    onBatchComplete?.([...nextRows]);
  }

  return nextRows;
}

export async function clearStockCache() {
  await AsyncStorage.removeItem(STOCK_CACHE_KEY);
}

export async function loadStockCache() {
  try {
    const raw = await AsyncStorage.getItem(STOCK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.rows) || !parsed.rows.length) return null;
    const rows = await hydrateRowsWithCachedImages(parsed.rows);
    return {
      locationName: parsed.locationName || 'Lusaka',
      rows,
      syncedAt: parsed.syncedAt ? new Date(parsed.syncedAt) : null,
      fromCache: true,
    };
  } catch {
    return null;
  }
}

export async function saveStockCache({ locationName, rows, syncedAt }) {
  const payload = {
    locationName,
    syncedAt: syncedAt?.toISOString?.() || new Date().toISOString(),
    rows: rows.map((row) => ({
      key: row.key,
      type: row.type,
      id: row.id,
      name: row.name,
      sku: row.sku,
      qty: row.qty,
      imageUrl: row.imageUrl,
      cachedImageUrl: row.cachedImageUrl,
      standardPrice: row.standardPrice,
      promoPrice: row.promoPrice,
      standardPriceRaw: row.standardPriceRaw,
      promoPriceRaw: row.promoPriceRaw,
      components: row.components,
    })),
  };
  await AsyncStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(payload));
}
