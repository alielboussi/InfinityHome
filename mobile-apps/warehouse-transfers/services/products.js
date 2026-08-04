import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { getDb } from '../../shared/firebase';
import { FILTER_LOCATION_ID } from '../config';

const IN_CHUNK = 30;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function fetchWarehouseProducts() {
  const db = getDb();
  const locSnap = await getDocs(
    query(
      collection(db, 'product_locations'),
      where('location_id', '==', FILTER_LOCATION_ID),
    ),
  );

  const productIds = [];
  locSnap.forEach((docSnap) => {
    const productId = docSnap.data().product_id;
    if (productId) productIds.push(String(productId));
  });

  if (!productIds.length) return [];

  const products = [];
  for (const chunk of chunkArray([...new Set(productIds)], IN_CHUNK)) {
    const snap = await getDocs(
      query(collection(db, 'products'), where(documentId(), 'in', chunk)),
    );
    snap.forEach((docSnap) => {
      const row = docSnap.data();
      products.push({
        id: docSnap.id,
        name: row.name || '',
        sku: row.sku || '',
      });
    });
  }

  return products.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
