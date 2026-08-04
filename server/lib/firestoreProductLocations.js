import { getFirestore, queryCollectionWhere, queryWhereIn } from './firestoreDb.js';
import { docIdFromOnConflict } from '../../src/db/docIds.js';

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

const coerceNumeric = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
};

function comboLocationKey(row) {
  return `${coerceNumeric(row.combo_id)}::${row.location_id}`;
}

function dedupeComboRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = comboLocationKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function upsertProductRows(db, rows) {
  for (const chunk of chunkArray(rows, 400)) {
    const batch = db.batch();
    for (const row of chunk) {
      const id = docIdFromOnConflict(row, 'product_id,location_id');
      batch.set(db.collection('product_locations').doc(id), row, { merge: true });
    }
    await batch.commit();
  }
}

async function upsertComboRows(db, rows) {
  const uniqueRows = dedupeComboRows(rows);
  for (const chunk of chunkArray(uniqueRows, 400)) {
    const batch = db.batch();
    for (const row of chunk) {
      const id = docIdFromOnConflict(row, 'combo_id,location_id');
      batch.set(db.collection('combo_locations').doc(id), row, { merge: true });
    }
    await batch.commit();
  }
  return uniqueRows.length;
}

async function insertComboRows(db, rows) {
  if (!rows.length) return;
  await upsertComboRows(db, rows);
}

async function deletePairsByLocation(db, table, idColumn, rows) {
  const byLocation = new Map();
  for (const row of rows) {
    const locId = row.location_id;
    const entityId = row[idColumn];
    if (!locId || entityId == null) continue;
    if (!byLocation.has(locId)) byLocation.set(locId, []);
    byLocation.get(locId).push(entityId);
  }

  let deleted = 0;
  for (const [locId, ids] of byLocation.entries()) {
    const uniqueIds = [...new Set(ids)];
    for (const idChunk of chunkArray(uniqueIds, 30)) {
      const matches = await queryCollectionWhere(db, table, [
        { field: 'location_id', op: '==', value: locId },
      ]);
      const idSet = new Set(idChunk.map(String));
      const toDelete = matches.filter((row) => idSet.has(String(row[idColumn])));
      if (!toDelete.length) continue;
      const batch = db.batch();
      toDelete.forEach((row) => batch.delete(db.collection(table).doc(String(row.id))));
      await batch.commit();
      deleted += toDelete.length;
    }
  }
  return deleted;
}

export async function getProductLocations(productId) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore not configured');
  return queryCollectionWhere(db, 'product_locations', [
    { field: 'product_id', op: '==', value: productId },
  ]);
}

export async function handleProductLocationsPost(body = {}) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore not configured');

  const action = String(body.action || body.a || '').trim().toLowerCase();

  if (action === 'combo') {
    const { rows, replaceComboId, deleteComboId, upsert, remove } = body;
    const cleanRows = (Array.isArray(rows) ? rows : [])
      .filter((row) => row?.combo_id && row?.location_id)
      .map((row) => ({
        combo_id: coerceNumeric(row.combo_id),
        location_id: row.location_id,
      }));

    const targetComboId = replaceComboId || deleteComboId || (cleanRows[0]?.combo_id ?? null);

    if (remove && cleanRows.length) {
      const count = await deletePairsByLocation(db, 'combo_locations', 'combo_id', cleanRows);
      return { ok: true, count };
    }

    if (upsert && cleanRows.length) {
      const count = await upsertComboRows(db, cleanRows);
      return { ok: true, count };
    }

    if (replaceComboId || deleteComboId) {
      if (targetComboId == null) {
        return { ok: false, status: 400, error: 'Missing combo id for replace/delete' };
      }
      const existing = await queryCollectionWhere(db, 'combo_locations', [
        { field: 'combo_id', op: '==', value: coerceNumeric(targetComboId) },
      ]);
      if (existing.length) {
        const batch = db.batch();
        existing.forEach((row) => batch.delete(db.collection('combo_locations').doc(String(row.id))));
        await batch.commit();
      }
    }

    if (!deleteComboId && cleanRows.length) {
      await insertComboRows(db, cleanRows);
    }

    return { ok: true, count: cleanRows.length };
  }

  const { rows, replaceProductId, remove } = body;
  if (!Array.isArray(rows)) {
    return { ok: false, status: 400, error: 'Missing rows' };
  }

  const cleanRows = rows
    .filter((row) => row?.product_id && row?.location_id)
    .map((row) => ({ product_id: row.product_id, location_id: row.location_id }));

  if (!cleanRows.length && !replaceProductId) {
    return { ok: false, status: 400, error: 'No valid rows to insert' };
  }

  if (remove) {
    if (!cleanRows.length) {
      return { ok: false, status: 400, error: 'No valid rows to remove' };
    }
    const count = await deletePairsByLocation(db, 'product_locations', 'product_id', cleanRows);
    return { ok: true, count };
  }

  if (replaceProductId) {
    const existing = await queryCollectionWhere(db, 'product_locations', [
      { field: 'product_id', op: '==', value: replaceProductId },
    ]);
    if (existing.length) {
      const batch = db.batch();
      existing.forEach((row) => batch.delete(db.collection('product_locations').doc(String(row.id))));
      await batch.commit();
    }
  }

  if (cleanRows.length > 0) {
    await upsertProductRows(db, cleanRows);
  }

  return { ok: true, count: cleanRows.length };
}

export async function fetchPosCatalog({ locationId, requestedProductIds = [] }) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore not configured');

  const [combos, comboLocations, comboItems, productLocations] = await Promise.all([
    fetchAllOrdered(db, 'combos', 'combo_name'),
    fetchAll(db, 'combo_locations'),
    fetchAll(db, 'combo_items'),
    locationId
      ? queryCollectionWhere(db, 'product_locations', [{ field: 'location_id', op: '==', value: locationId }])
      : Promise.resolve([]),
  ]);

  const derivedProductIds = [
    ...requestedProductIds,
    ...productLocations.map((row) => row.product_id),
    ...comboItems.map((row) => row.product_id),
  ];

  const products = await selectProductsByIds(db, derivedProductIds);
  const { productMap, comboMap } = await fetchLocationPriceMaps(db, locationId);
  const pricedProducts = products.map((row) => applyProductLocationPricing(row, locationId, productMap));
  const pricedCombos = combos.map((row) => applyComboLocationPricing(row, locationId, comboMap));

  return {
    combos: pricedCombos,
    combo_locations: comboLocations,
    combo_items: comboItems,
    product_locations: productLocations,
    products: pricedProducts,
  };
}

export async function fetchPosLocations() {
  const db = getFirestore();
  if (!db) throw new Error('Firestore not configured');
  const rows = await fetchAllOrdered(db, 'locations', 'name');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

async function fetchAll(db, table) {
  const snap = await db.collection(table).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchAllOrdered(db, table, orderField) {
  const rows = await fetchAll(db, table);
  return rows.sort((a, b) => String(a[orderField] || '').localeCompare(String(b[orderField] || '')));
}

async function selectProductsByIds(db, productIds) {
  const ids = Array.from(new Set((productIds || []).map((value) => String(value || '').trim()).filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))));
  if (!ids.length) {
    const rows = await fetchAllOrdered(db, 'products', 'name');
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      price: row.price,
      promotional_price: row.promotional_price,
      currency: row.currency,
    }));
  }

  const rows = await queryWhereIn(db, 'products', 'id', ids);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    price: row.price,
    promotional_price: row.promotional_price,
    currency: row.currency,
  }));
}

function locationPriceKey(entityId, locationId) {
  return `${String(entityId || '').trim()}:${String(locationId || '').trim()}`;
}

function applyProductLocationPricing(product, locationId, priceMap) {
  const override = locationId ? priceMap.get(locationPriceKey(product?.id, locationId)) : null;
  return {
    ...product,
    price: override?.price != null ? override.price : product.price,
    promotional_price: override?.promotional_price != null
      ? override.promotional_price
      : product.promotional_price,
  };
}

function applyComboLocationPricing(combo, locationId, priceMap) {
  const override = locationId ? priceMap.get(locationPriceKey(combo?.id, locationId)) : null;
  const globalStandard = combo.combo_price ?? combo.standard_price ?? null;
  const comboPrice = override?.combo_price != null ? override.combo_price : globalStandard;
  return {
    ...combo,
    combo_price: comboPrice,
    standard_price: comboPrice,
    promotional_price: override?.promotional_price != null
      ? override.promotional_price
      : combo.promotional_price,
  };
}

async function fetchLocationPriceMaps(db, locationId) {
  if (!locationId) {
    return { productMap: new Map(), comboMap: new Map() };
  }
  const [productRows, comboRows] = await Promise.all([
    queryCollectionWhere(db, 'product_location_prices', [{ field: 'location_id', op: '==', value: locationId }]),
    queryCollectionWhere(db, 'combo_location_prices', [{ field: 'location_id', op: '==', value: locationId }]),
  ]);
  const productMap = new Map();
  productRows.forEach((row) => {
    productMap.set(locationPriceKey(row.product_id, row.location_id), row);
  });
  const comboMap = new Map();
  comboRows.forEach((row) => {
    comboMap.set(locationPriceKey(row.combo_id, row.location_id), row);
  });
  return { productMap, comboMap };
}
