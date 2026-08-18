import {
  applyExpectedQtyToInventoryRows,
  computeExpectedInventoryMap,
} from '../../src/utils/computedInventoryQty.js';
import {
  normalizeShopVariants,
  shopListingUsesVariants,
  shopVariantStockTotal,
} from '../../src/utils/shopVariants.js';
import {
  collectionRef,
  docIdForRow,
  getFirestore,
  queryCollectionWhere,
} from './firestoreDb.js';

export const LUSAKA_LOCATION_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';
const OPEN_STATUSES = new Set(['open', 'open_locked']);

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

async function fetchAllDocs(db, table) {
  const snap = await collectionRef(db, table).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function fetchDocsByIds(db, table, ids) {
  const unique = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))];
  if (!unique.length) return [];
  const rows = [];
  for (const chunk of chunkArray(unique, 30)) {
    await Promise.all(chunk.map(async (id) => {
      const snap = await collectionRef(db, table).doc(id).get();
      if (snap.exists) rows.push({ id: snap.id, ...snap.data() });
    }));
  }
  return rows;
}

function makeAdminDbAdapter(db) {
  return {
    from(table) {
      const state = { filters: [], orderCol: null, orderAsc: true, limitN: null };
      const api = {
        select() { return api; },
        eq(col, val) { state.filters.push({ type: 'eq', col, val }); return api; },
        in(col, vals) { state.filters.push({ type: 'in', col, vals }); return api; },
        gte(col, val) { state.filters.push({ type: 'gte', col, val }); return api; },
        lte(col, val) { state.filters.push({ type: 'lte', col, val }); return api; },
        is(col, val) { state.filters.push({ type: 'is', col, val }); return api; },
        not(col, op, val) { state.filters.push({ type: 'not', col, op, val }); return api; },
        order(col, opts = {}) {
          state.orderCol = col;
          state.orderAsc = opts.ascending !== false;
          return api;
        },
        limit(n) { state.limitN = n; return api; },
        async then(resolve, reject) {
          try {
            let rows = await fetchAllDocs(db, table);
            state.filters.forEach((filter) => {
              if (filter.type === 'eq') {
                rows = rows.filter((row) => String(row[filter.col]) === String(filter.val));
              } else if (filter.type === 'in') {
                const set = new Set((filter.vals || []).map(String));
                rows = rows.filter((row) => set.has(String(row[filter.col])));
              } else if (filter.type === 'gte') {
                rows = rows.filter((row) => String(row[filter.col] || '') >= String(filter.val));
              } else if (filter.type === 'lte') {
                rows = rows.filter((row) => String(row[filter.col] || '') <= String(filter.val));
              } else if (filter.type === 'is') {
                rows = rows.filter((row) => (filter.val == null ? row[filter.col] == null : row[filter.col] === filter.val));
              } else if (filter.type === 'not' && filter.op === 'is' && filter.val == null) {
                rows = rows.filter((row) => row[filter.col] != null);
              }
            });
            if (state.orderCol) {
              const col = state.orderCol;
              const asc = state.orderAsc;
              rows = [...rows].sort((a, b) => {
                const cmp = String(a[col] || '').localeCompare(String(b[col] || ''), undefined, { numeric: true });
                return asc ? cmp : -cmp;
              });
            }
            if (state.limitN != null) rows = rows.slice(0, state.limitN);
            resolve({ data: rows, error: null });
          } catch (err) {
            reject(err);
          }
        },
      };
      return api;
    },
  };
}

async function fetchActiveStockPeriod(db, locationId) {
  const periods = await queryCollectionWhere(db, 'stock_periods', [
    { field: 'location_id', op: '==', value: locationId },
  ]);
  return (periods || [])
    .filter((row) => OPEN_STATUSES.has(String(row?.status || '')))
    .sort((a, b) => new Date(b?.opened_at || 0) - new Date(a?.opened_at || 0))[0] || null;
}

async function fetchQtyByProduct(db, locationId) {
  const inventoryRows = await queryCollectionWhere(db, 'inventory', [
    { field: 'location', op: '==', value: locationId },
  ]);
  const qtyByProduct = new Map();
  (inventoryRows || []).forEach((row) => {
    const pid = String(row?.product_id || '');
    if (!pid) return;
    qtyByProduct.set(pid, Number(row?.quantity || 0));
  });

  const period = await fetchActiveStockPeriod(db, locationId);
  if (!period?.id) return qtyByProduct;

  try {
    const adminDb = makeAdminDbAdapter(db);
    const expectedMap = await computeExpectedInventoryMap(adminDb, locationId);
    const computed = applyExpectedQtyToInventoryRows(
      (inventoryRows || []).map((row) => ({ ...row })),
      locationId,
      expectedMap,
    );
    computed.forEach((row) => {
      const pid = String(row?.product_id || '');
      if (!pid) return;
      qtyByProduct.set(pid, Number(row?.quantity ?? row?.expected_qty ?? 0));
    });
  } catch {
    // Keep raw inventory quantities
  }

  return qtyByProduct;
}

async function fetchShopListingMap(db, locationId, productIds = []) {
  const ids = new Set((productIds || []).map((id) => String(id)).filter(Boolean));
  if (!ids.size) return new Map();

  const listings = (await fetchAllDocs(db, 'shop_listings'))
    .filter((row) => String(row?.location_id || '') === String(locationId))
    .filter((row) => ids.has(String(row?.product_id || '')));

  return new Map(listings.map((row) => [String(row.product_id), row]));
}

function resolveVariantFromListing(listing, variantId) {
  const variants = normalizeShopVariants(listing?.variants);
  if (!variants.length) return null;
  const id = String(variantId || '').trim();
  if (!id) return null;
  return variants.find((row) => String(row.id) === id) || null;
}

export async function classifyWebOrderItems(db, locationId, items = []) {
  const normalized = (items || [])
    .map((item) => ({
      product_id: String(item?.product_id || item?.productId || '').trim(),
      variant_id: String(item?.variant_id || item?.variantId || '').trim(),
      display_name: String(item?.display_name || item?.name || 'Product').trim(),
      quantity: Math.max(1, Math.floor(Number(item?.quantity || 1))),
      unit_price: Number(item?.unit_price ?? item?.price ?? 0),
      currency: String(item?.currency || 'K').trim() || 'K',
    }))
    .filter((item) => item.product_id && item.display_name && item.quantity > 0);

  const listingMap = await fetchShopListingMap(
    db,
    locationId,
    normalized.map((item) => item.product_id),
  );

  const inventoryItems = [];
  const variantItems = [];

  normalized.forEach((item) => {
    const listing = listingMap.get(item.product_id);
    const hasVariants = shopListingUsesVariants(listing?.variants);
    if (hasVariants) {
      const variant = resolveVariantFromListing(listing, item.variant_id);
      if (!variant) {
        const err = new Error(`Choose a variant for ${item.display_name}`);
        err.status = 400;
        throw err;
      }
      variantItems.push({
        ...item,
        variant_id: variant.id,
        variant_name: variant.name,
        display_name: `${item.display_name} — ${variant.name}`,
      });
      return;
    }
    if (item.variant_id) {
      const err = new Error(`Variant is not available for ${item.display_name}`);
      err.status = 400;
      throw err;
    }
    inventoryItems.push(item);
  });

  return { inventoryItems, variantItems, listingMap };
}

export async function validateWebOrderStock(db, locationId, items = []) {
  const { inventoryItems, variantItems, listingMap } = await classifyWebOrderItems(db, locationId, items);

  if (!inventoryItems.length && !variantItems.length) {
    const err = new Error('Cart is empty');
    err.status = 400;
    throw err;
  }

  const shortages = [];

  if (inventoryItems.length) {
    const qtyByProduct = await fetchQtyByProduct(db, locationId);
    inventoryItems.forEach((item) => {
      const available = Math.max(0, Math.floor(Number(qtyByProduct.get(item.product_id) || 0)));
      if (item.quantity > available) {
        shortages.push({
          product_id: item.product_id,
          name: item.display_name,
          requested: item.quantity,
          available,
        });
      }
    });
  }

  variantItems.forEach((item) => {
    const listing = listingMap.get(item.product_id);
    const variant = resolveVariantFromListing(listing, item.variant_id);
    const available = Math.max(0, Math.floor(Number(variant?.stock_qty || 0)));
    if (item.quantity > available) {
      shortages.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        name: item.display_name,
        requested: item.quantity,
        available,
      });
    }
  });

  if (shortages.length) {
    const detail = shortages
      .map((row) => `${row.name} (need ${row.requested}, have ${row.available})`)
      .join('; ');
    const err = new Error(`Insufficient stock: ${detail}`);
    err.status = 409;
    err.code = 'INSUFFICIENT_STOCK';
    err.shortages = shortages;
    throw err;
  }
}

export async function deductShopVariantStock(db, locationId, items = [], meta = {}) {
  const normalized = (items || [])
    .map((item) => ({
      product_id: String(item?.product_id || '').trim(),
      variant_id: String(item?.variant_id || '').trim(),
      quantity: Math.max(1, Math.floor(Number(item?.quantity || 1))),
    }))
    .filter((item) => item.product_id && item.variant_id && item.quantity > 0);

  if (!normalized.length) return { updated: 0 };

  const listingMap = await fetchShopListingMap(
    db,
    locationId,
    normalized.map((item) => item.product_id),
  );

  const usageByKey = new Map();
  normalized.forEach((item) => {
    const key = `${item.product_id}::${item.variant_id}`;
    usageByKey.set(key, (usageByKey.get(key) || 0) + item.quantity);
  });

  let updated = 0;
  for (const [key, usedQty] of usageByKey.entries()) {
    const [productId, variantId] = key.split('::');
    const listing = listingMap.get(productId);
    if (!listing) throw new Error(`Shop listing not found for product ${productId}`);

    const variants = normalizeShopVariants(listing.variants);
    const index = variants.findIndex((row) => String(row.id) === String(variantId));
    if (index < 0) throw new Error(`Shop variant not found for product ${productId}`);

    const currentQty = Math.max(0, Math.floor(Number(variants[index].stock_qty || 0)));
    if (usedQty > currentQty) {
      throw new Error(`Insufficient shop variant stock for ${variants[index].name}`);
    }

    variants[index] = {
      ...variants[index],
      stock_qty: currentQty - usedQty,
    };

    const payload = {
      ...listing,
      product_id: productId,
      location_id: String(listing.location_id || locationId),
      variants,
      updated_at: new Date().toISOString(),
    };
    const docId = docIdForRow('shop_listings', payload);
    await collectionRef(db, 'shop_listings').doc(docId).set(payload, { merge: true });
    updated += 1;
  }

  return { updated, orderId: meta?.orderId || null, saleId: meta?.saleId || null };
}

function normalizeCurrency(raw) {
  const val = String(raw || '').trim().toUpperCase();
  if (val === '$' || val === 'USD') return 'USD';
  return 'K';
}

function selectSellingPrice(promo, standard) {
  const promoValue = Number(promo);
  if (promo != null && promo !== '' && Number.isFinite(promoValue) && promoValue > 0) return promoValue;
  const standardValue = Number(standard);
  if (standard != null && standard !== '' && Number.isFinite(standardValue) && standardValue > 0) return standardValue;
  return 0;
}

function resolveLocationPrice(product, priceRows, locationId) {
  const match = (priceRows || []).find(
    (row) => String(row?.product_id) === String(product?.id) && String(row?.location_id) === String(locationId),
  );
  const promo = match?.promotional_price ?? product?.promotional_price;
  const standard = match?.price ?? product?.price ?? product?.unit_price;
  const price = selectSellingPrice(promo, standard);
  if (price > 0) {
    return { price, currency: normalizeCurrency(match?.currency || product?.currency) };
  }
  const fallback = Number(product?.price || product?.unit_price || 0);
  return { price: fallback, currency: normalizeCurrency(product?.currency) };
}

async function fetchShopSettings(db) {
  const snap = await collectionRef(db, 'shop_settings').doc('lusaka').get();
  if (!snap.exists) {
    return {
      storeName: 'Infinity Home',
      tagline: 'Quality furniture, appliances, and home essentials for every room.',
      whatsappE164: '',
      supportEmail: 'bestrest10@gmail.com',
    };
  }
  const data = snap.data() || {};
  return {
    storeName: data.store_name || 'Infinity Home',
    tagline: data.tagline || 'Quality furniture, appliances, and home essentials for every room.',
    whatsappE164: String(data.whatsapp_e164 || '').replace(/\D/g, ''),
    supportEmail: String(data.support_email || 'bestrest10@gmail.com').trim().toLowerCase(),
  };
}

export async function upsertShopSettings(settings = {}) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore is not configured');
  const payload = {
    store_name: String(settings.storeName || '').trim() || 'Infinity Home',
    tagline: String(settings.tagline || '').trim(),
    whatsapp_e164: String(settings.whatsappE164 || '').replace(/\D/g, ''),
    support_email: String(settings.supportEmail || 'bestrest10@gmail.com').trim().toLowerCase(),
    updated_at: new Date().toISOString(),
  };
  await collectionRef(db, 'shop_settings').doc('lusaka').set(payload, { merge: true });
  return fetchShopSettings(db);
}

export async function fetchShopCatalog({
  locationId = LUSAKA_LOCATION_ID,
  publishedOnly = true,
} = {}) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore is not configured');

  const listings = (await fetchAllDocs(db, 'shop_listings'))
    .filter((row) => String(row?.location_id || '') === String(locationId))
    .filter((row) => (publishedOnly ? Boolean(row?.is_published) : true));

  const productIds = listings.map((row) => String(row.product_id)).filter(Boolean);
  if (!productIds.length) {
    return { locationId, products: [], categories: [], settings: await fetchShopSettings(db) };
  }

  const [products, priceRows, qtyByProduct, categoryRows] = await Promise.all([
    fetchDocsByIds(db, 'products', productIds),
    queryCollectionWhere(db, 'product_location_prices', [
      { field: 'location_id', op: '==', value: locationId },
    ]),
    fetchQtyByProduct(db, locationId),
    fetchAllDocs(db, 'categories'),
  ]);

  const categoryById = new Map(
    (categoryRows || []).map((row) => [String(row.id), String(row.name || '').trim()]),
  );

  const listingByProduct = new Map(listings.map((row) => [String(row.product_id), row]));
  const productById = new Map(products.map((row) => [String(row.id), row]));

  const catalogProducts = productIds
    .map((productId) => {
      const product = productById.get(String(productId));
      const listing = listingByProduct.get(String(productId));
      if (!product || !listing) return null;
      const pricing = resolveLocationPrice(product, priceRows, locationId);
      const variants = normalizeShopVariants(listing?.variants);
      const hasVariants = variants.length > 0;
      const qty = hasVariants
        ? shopVariantStockTotal(variants)
        : Math.max(0, Math.floor(Number(qtyByProduct.get(String(productId)) || 0)));
      const imageUrls = Array.isArray(listing?.image_urls)
        ? listing.image_urls.filter(Boolean)
        : [];
      const categoryId = product?.category_id ? String(product.category_id) : '';
      const categoryName = categoryId ? (categoryById.get(categoryId) || '') : '';
      return {
        id: String(product.id),
        sku: product.sku || product.product_code || '',
        name: listing.shop_title || product.name || product.product_name || 'Product',
        description: listing.shop_description || product.description || '',
        price: pricing.price,
        currency: pricing.currency,
        qty,
        hasVariants,
        variants: variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          imageUrls: variant.image_urls,
          stockQty: variant.stock_qty,
        })),
        imageUrls,
        sortOrder: Number(listing?.sort_order || 0),
        isPublished: Boolean(listing?.is_published),
        categoryId,
        categoryName,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });

  const categoryCounts = new Map();
  catalogProducts.forEach((product) => {
    if (!product.categoryId) return;
    categoryCounts.set(product.categoryId, (categoryCounts.get(product.categoryId) || 0) + 1);
  });
  const categories = Array.from(categoryCounts.entries())
    .map(([id, count]) => ({
      id,
      name: categoryById.get(id) || 'Other',
      slug: String(categoryById.get(id) || 'other')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
      productCount: count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return {
    locationId,
    products: catalogProducts,
    categories,
    settings: await fetchShopSettings(db),
  };
}

export async function upsertShopListing(row = {}) {
  const db = getFirestore();
  if (!db) throw new Error('Firestore is not configured');
  const productId = String(row?.product_id || '').trim();
  const locationId = String(row?.location_id || LUSAKA_LOCATION_ID).trim();
  if (!productId) throw new Error('product_id is required');

  const payload = {
    product_id: productId,
    location_id: locationId,
    image_urls: Array.isArray(row.image_urls) ? row.image_urls.filter(Boolean) : [],
    shop_title: String(row.shop_title || '').trim(),
    shop_description: String(row.shop_description || '').trim(),
    is_published: Boolean(row.is_published),
    sort_order: Number(row.sort_order || 0),
    variants: normalizeShopVariants(row.variants),
    updated_at: new Date().toISOString(),
  };

  const id = docIdForRow('shop_listings', payload);
  await collectionRef(db, 'shop_listings').doc(id).set(payload, { merge: true });
  return { id, ...payload };
}
