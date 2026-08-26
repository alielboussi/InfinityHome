import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { getDb, getFirebaseApp } from '../../shared/firebase';
import { readExpoExtra } from '../../shared/expoExtra';
import { isMissingDisplayableImage } from './imageProbe';

const PRODUCT_IMAGE_BUCKET = 'productimages';

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parsePriceInput(value, { allowEmpty = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return allowEmpty ? null : NaN;
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function storageBucketName() {
  const extra = readExpoExtra();
  return String(
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
    || extra.firebase?.storageBucket
    || 'bestrest-portal-system-43108.firebasestorage.app',
  ).trim();
}

function buildPublicUrl(objectPath) {
  const bucket = storageBucketName();
  const encodedPath = encodeURIComponent(`${PRODUCT_IMAGE_BUCKET}/${objectPath}`);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
}

function resolveImageUrl(product, imageByProductId) {
  const joined = imageByProductId.get(String(product.id));
  const raw = String(product.image_url || joined || '').trim();
  return raw;
}

function applyLocationPricing(product, locationId, priceMap) {
  const override = priceMap.get(`${String(product.id)}:${String(locationId)}`);
  return {
    ...product,
    price: override?.price != null && override?.price !== '' ? override.price : product.price,
    promotional_price: override?.promotional_price != null && override?.promotional_price !== ''
      ? override.promotional_price
      : product.promotional_price,
    _locationOverride: override || null,
  };
}

async function fetchProductImageMap(productIds) {
  const map = new Map();
  for (const chunk of chunkArray(productIds, 30)) {
    await Promise.all(chunk.map(async (productId) => {
      const pid = String(productId);
      const snap = await getDoc(doc(getDb(), 'product_images', pid));
      const url = String(snap.data()?.image_url || '').trim();
      if (url) map.set(pid, url);
    }));
  }
  return map;
}

async function fetchLocationPriceMap(locationId) {
  const map = new Map();
  const snap = await getDocs(query(
    collection(getDb(), 'product_location_prices'),
    where('location_id', '==', locationId),
  ));
  snap.docs.forEach((row) => {
    const data = row.data() || {};
    const key = `${String(data.product_id)}:${String(data.location_id)}`;
    map.set(key, { id: row.id, ...data });
  });
  return map;
}

export async function fetchCatalogProducts(locationId) {
  const snap = await getDocs(collection(getDb(), 'products'));
  const products = snap.docs
    .map((row) => ({ id: row.id, ...row.data() }))
    .filter((row) => row?.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const productIds = products.map((row) => row.id);
  const [imageMap, priceMap] = await Promise.all([
    fetchProductImageMap(productIds),
    fetchLocationPriceMap(locationId),
  ]);

  return products.map((product) => {
    const priced = applyLocationPricing(product, locationId, priceMap);
    return {
      ...priced,
      imageUrl: resolveImageUrl(product, imageMap),
    };
  });
}

export async function fetchProductById(productId, locationId) {
  const pid = String(productId || '').trim();
  if (!pid) return null;
  const snap = await getDoc(doc(getDb(), 'products', pid));
  if (!snap.exists()) return null;
  const product = { id: snap.id, ...snap.data() };
  const [imageMap, priceMap] = await Promise.all([
    fetchProductImageMap([pid]),
    fetchLocationPriceMap(locationId),
  ]);
  const priced = applyLocationPricing(product, locationId, priceMap);
  return {
    ...priced,
    imageUrl: resolveImageUrl(product, imageMap),
  };
}

export async function findProductBySku(sku, locationId) {
  const raw = String(sku || '').trim();
  if (!raw) return null;
  const candidates = [...new Set([raw, raw.toUpperCase(), raw.toLowerCase()])];
  for (const candidate of candidates) {
    const snap = await getDocs(query(collection(getDb(), 'products'), where('sku', '==', candidate)));
    if (!snap.empty) {
      const product = { id: snap.docs[0].id, ...snap.docs[0].data() };
      return fetchProductById(product.id, locationId);
    }
  }
  return null;
}

export function productHasImage(product, imageStatusById = {}) {
  return !isMissingDisplayableImage(product, imageStatusById);
}

export function filterCatalogProducts(products, searchText, options = {}) {
  const { missingImageOnly = false, imageStatusById = {} } = options;
  let rows = products || [];
  if (missingImageOnly) {
    rows = rows.filter((product) => isMissingDisplayableImage(product, imageStatusById));
  }
  const q = String(searchText || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((product) => {
    const name = String(product.name || '').toLowerCase();
    const sku = String(product.sku || '').toLowerCase();
    const price = String(product.price ?? '');
    const promo = String(product.promotional_price ?? '');
    return name.includes(q) || sku.includes(q) || price.includes(q) || promo.includes(q);
  });
}

export async function saveProductPrices({
  productId,
  locationId,
  standardPrice,
  promoPrice,
  baseProduct,
  locationOverride,
}) {
  const pid = String(productId || '').trim();
  const lid = String(locationId || '').trim();
  if (!pid || !lid) throw new Error('Product and location are required.');

  const parsedStandard = parsePriceInput(standardPrice);
  if (!Number.isFinite(parsedStandard) || parsedStandard < 0) {
    throw new Error('Enter a valid standard price.');
  }
  const promoRaw = String(promoPrice ?? '').trim();
  const parsedPromo = promoRaw === '' ? null : parsePriceInput(promoPrice, { allowEmpty: true });
  if (promoRaw !== '' && (!Number.isFinite(parsedPromo) || parsedPromo < 0)) {
    throw new Error('Enter a valid promo price or leave blank.');
  }

  const docId = `${pid}_${lid}`;
  const payload = {
    product_id: pid,
    location_id: lid,
    price: parsedStandard,
    promotional_price: parsedPromo,
    promo_start_date: locationOverride?.promo_start_date ?? baseProduct?.promo_start_date ?? null,
    promo_end_date: locationOverride?.promo_end_date ?? baseProduct?.promo_end_date ?? null,
    updated_at: new Date().toISOString(),
  };
  await setDoc(doc(getDb(), 'product_location_prices', docId), payload, { merge: true });

  await updateDoc(doc(getDb(), 'products', pid), {
    price: parsedStandard,
    promotional_price: parsedPromo,
    updated_at: new Date().toISOString(),
  });

  return payload;
}

async function purgeProductImages(productId) {
  const folderRef = ref(getStorage(getFirebaseApp()), `${PRODUCT_IMAGE_BUCKET}/products/${productId}`);
  try {
    const listed = await listAll(folderRef);
    await Promise.all(listed.items.map((item) => deleteObject(item)));
  } catch {
    // ignore missing folder
  }
}

export async function uploadProductImage(productId, localUri) {
  const pid = String(productId || '').trim();
  if (!pid) throw new Error('Product id is required.');
  if (!localUri) throw new Error('Choose an image first.');

  await purgeProductImages(pid);
  const nonce = Date.now();
  const objectPath = `products/${pid}/main-${nonce}.jpg`;
  const storagePath = `${PRODUCT_IMAGE_BUCKET}/${objectPath}`;

  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(getStorage(getFirebaseApp()), storagePath);
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });

  let publicUrl = buildPublicUrl(objectPath);
  try {
    publicUrl = await getDownloadURL(storageRef);
  } catch {
    // fallback to constructed URL
  }

  await setDoc(doc(getDb(), 'product_images', pid), {
    product_id: pid,
    image_url: publicUrl,
  }, { merge: true });

  await updateDoc(doc(getDb(), 'products', pid), {
    image_url: publicUrl,
    updated_at: new Date().toISOString(),
  });

  return publicUrl;
}

export { parsePriceInput, toNumber };
