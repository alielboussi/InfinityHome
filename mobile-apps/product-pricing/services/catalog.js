import {
  collection,
  deleteDoc,
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
import { requestImageEmbedding } from './visualSearch';

const PRODUCT_IMAGE_BUCKET = 'productimages';

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
  return String(product.image_url || joined || '').trim();
}

function mapProductRow(product, imageMap) {
  return {
    ...product,
    __isCombo: false,
    name: String(product.name || '').trim(),
    imageUrl: resolveImageUrl(product, imageMap),
  };
}

function mapComboRow(combo) {
  return {
    id: combo.id,
    name: String(combo.combo_name || '').trim(),
    combo_name: combo.combo_name,
    sku: combo.sku,
    price: combo.combo_price ?? combo.standard_price,
    promotional_price: combo.promotional_price,
    currency: combo.currency,
    picture_url: combo.picture_url,
    __isCombo: true,
    imageUrl: String(combo.picture_url || '').trim(),
  };
}

async function fetchProductImageMap(productIds = null) {
  const map = new Map();
  if (Array.isArray(productIds) && productIds.length === 1) {
    const pid = String(productIds[0]);
    const snap = await getDoc(doc(getDb(), 'product_images', pid));
    const url = String(snap.data()?.image_url || '').trim();
    if (url) map.set(pid, url);
    return map;
  }

  const snap = await getDocs(collection(getDb(), 'product_images'));
  snap.docs.forEach((row) => {
    const data = row.data() || {};
    const pid = String(data.product_id || row.id);
    const url = String(data.image_url || '').trim();
    if (url) map.set(pid, url);
  });
  return map;
}

export async function fetchCatalogProducts() {
  const [productsSnap, combosSnap, imageMap] = await Promise.all([
    getDocs(collection(getDb(), 'products')),
    getDocs(collection(getDb(), 'combos')),
    fetchProductImageMap(),
  ]);

  const products = productsSnap.docs
    .map((row) => mapProductRow({ id: row.id, ...row.data() }, imageMap))
    .filter((row) => row.name);

  const combos = combosSnap.docs
    .map((row) => mapComboRow({ id: row.id, ...row.data() }))
    .filter((row) => row.name);

  return [...products, ...combos].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function fetchCatalogItemById(itemId, { isCombo = false } = {}) {
  const id = String(itemId || '').trim();
  if (!id) return null;
  if (isCombo) return fetchComboById(id);
  return fetchProductById(id);
}

export async function fetchProductById(productId) {
  const pid = String(productId || '').trim();
  if (!pid) return null;
  const snap = await getDoc(doc(getDb(), 'products', pid));
  if (!snap.exists()) return null;
  const product = { id: snap.id, ...snap.data() };
  const imageMap = await fetchProductImageMap([pid]);
  return mapProductRow(product, imageMap);
}

export async function fetchComboById(comboId) {
  const cid = String(comboId || '').trim();
  if (!cid) return null;
  const snap = await getDoc(doc(getDb(), 'combos', cid));
  if (!snap.exists()) return null;
  return mapComboRow({ id: snap.id, ...snap.data() });
}

export async function fetchComboItems(comboId) {
  const cid = String(comboId || '').trim();
  if (!cid) return [];
  const snap = await getDocs(query(collection(getDb(), 'combo_items'), where('combo_id', '==', cid)));
  return snap.docs.map((row) => ({ id: row.id, ...row.data() }));
}

export async function fetchProductsLookup() {
  const snap = await getDocs(collection(getDb(), 'products'));
  return snap.docs
    .map((row) => ({ id: row.id, name: row.data()?.name, sku: row.data()?.sku }))
    .filter((row) => row.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function findProductBySku(sku) {
  const raw = String(sku || '').trim();
  if (!raw) return null;
  const candidates = [...new Set([raw, raw.toUpperCase(), raw.toLowerCase()])];
  for (const candidate of candidates) {
    const productSnap = await getDocs(query(collection(getDb(), 'products'), where('sku', '==', candidate)));
    if (!productSnap.empty) {
      return fetchProductById(productSnap.docs[0].id);
    }
    const comboSnap = await getDocs(query(collection(getDb(), 'combos'), where('sku', '==', candidate)));
    if (!comboSnap.empty) {
      return fetchComboById(comboSnap.docs[0].id);
    }
  }
  return null;
}

export function productHasImage(product, imageStatusById = {}) {
  return !isMissingDisplayableImage(product, imageStatusById);
}

export function catalogItemKey(item) {
  return `${item?.__isCombo ? 'combo' : 'product'}_${item?.id}`;
}

export function filterCatalogProducts(products, searchText, options = {}) {
  const { missingImageOnly = false, imageStatusById = {} } = options;
  let rows = products || [];
  if (missingImageOnly) {
    rows = rows.filter((product) => isMissingDisplayableImage(product, imageStatusById, catalogItemKey(product)));
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

async function purgeStorageFolder(folderPath) {
  const folderRef = ref(getStorage(getFirebaseApp()), `${PRODUCT_IMAGE_BUCKET}/${folderPath}`);
  try {
    const listed = await listAll(folderRef);
    await Promise.all(listed.items.map((item) => deleteObject(item)));
  } catch {
    // ignore missing folder
  }
}

export async function uploadProductImage(productId, localUri, { isCombo = false, itemMeta = {} } = {}) {
  const pid = String(productId || '').trim();
  if (!pid) throw new Error('Item id is required.');
  if (!localUri) throw new Error('Choose an image first.');

  const folder = isCombo ? `sets/${pid}` : `products/${pid}`;
  await purgeStorageFolder(folder);
  const nonce = Date.now();
  const objectPath = `${folder}/main-${nonce}.jpg`;
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

  if (isCombo) {
    await updateDoc(doc(getDb(), 'combos', pid), {
      picture_url: publicUrl,
      updated_at: new Date().toISOString(),
    });
    requestImageEmbedding({
      entityType: 'combo',
      entityId: pid,
      imageUrl: publicUrl,
      name: itemMeta.name,
      sku: itemMeta.sku,
    }).catch(() => {});
    return publicUrl;
  }

  await setDoc(doc(getDb(), 'product_images', pid), {
    product_id: pid,
    image_url: publicUrl,
  }, { merge: true });

  await updateDoc(doc(getDb(), 'products', pid), {
    image_url: publicUrl,
    updated_at: new Date().toISOString(),
  });

  requestImageEmbedding({
    entityType: 'product',
    entityId: pid,
    imageUrl: publicUrl,
    name: itemMeta.name,
    sku: itemMeta.sku,
  }).catch(() => {});

  return publicUrl;
}

export async function updateCatalogItemName(item, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Name cannot be empty.');
  const id = String(item?.id || '').trim();
  if (!id) throw new Error('Item id is required.');

  if (item?.__isCombo) {
    await updateDoc(doc(getDb(), 'combos', id), {
      combo_name: trimmed,
      updated_at: new Date().toISOString(),
    });
    return trimmed;
  }

  await updateDoc(doc(getDb(), 'products', id), {
    name: trimmed,
    updated_at: new Date().toISOString(),
  });
  return trimmed;
}

export async function saveComboItems(comboId, items) {
  const cid = String(comboId || '').trim();
  if (!cid) throw new Error('Set id is required.');

  const normalized = (items || [])
    .map((row) => ({
      product_id: String(row.product_id || '').trim(),
      quantity: Math.max(1, Number(row.quantity) || 1),
    }))
    .filter((row) => row.product_id);

  const existingSnap = await getDocs(query(collection(getDb(), 'combo_items'), where('combo_id', '==', cid)));
  await Promise.all(existingSnap.docs.map((row) => deleteDoc(doc(getDb(), 'combo_items', row.id))));

  await Promise.all(normalized.map((row) => {
    const docId = `${cid}_${row.product_id}`;
    return setDoc(doc(getDb(), 'combo_items', docId), {
      id: docId,
      combo_id: cid,
      product_id: row.product_id,
      quantity: row.quantity,
    });
  }));

  await updateDoc(doc(getDb(), 'combos', cid), {
    updated_at: new Date().toISOString(),
  });

  return normalized;
}

// Backwards-compatible exports
export const updateProductName = (productId, name) => updateCatalogItemName({ id: productId, __isCombo: false }, name);
