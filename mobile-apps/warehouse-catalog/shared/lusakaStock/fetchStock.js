import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  documentId,
} from 'firebase/firestore';
import { getDb, API_BASE, ensureFirebaseAuthToken } from '../firebase';
import { LUSAKA_BRANCH_ID } from '../locationIds';
import {
  buildComboLocationPriceMap,
  buildProductLocationPriceMap,
  resolveComboLocationPricing,
  resolveProductLocationPricing,
} from './pricing';
import { formatLusakaPrice, resolveProductImageUrl, resolveProductRecordImageUrl } from './formatPrice';
import { getMaxSetQty } from './setInventory';
import { buildProductById, buildSetComponents } from './setComponents';
import {
  buildSetComponentProductIds,
  expandLusakaComboIds,
  filterComboItemsForCombos,
  mergeProductIdsForSets,
} from './setMatching';

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

async function fetchDocsWhere(table, field, value) {
  const snap = await getDocs(query(collection(getDb(), table), where(field, '==', value)));
  return snap.docs.map((row) => ({ id: row.id, ...row.data() }));
}

async function fetchDocsByIds(table, ids) {
  if (!ids.length) return [];
  const rows = [];
  for (const chunk of chunkArray(ids.map(String), 30)) {
    const snap = await getDocs(query(collection(getDb(), table), where(documentId(), 'in', chunk)));
    snap.docs.forEach((row) => rows.push({ id: row.id, ...row.data() }));
  }
  return rows;
}

async function fetchRowsByFieldIn(table, field, ids) {
  if (!ids.length) return [];
  const rows = [];
  for (const chunk of chunkArray(ids.map(String), 30)) {
    const snap = await getDocs(query(collection(getDb(), table), where(field, 'in', chunk)));
    snap.docs.forEach((row) => rows.push({ id: row.id, ...row.data() }));
  }
  return rows;
}

async function fetchProductImageMap(productIds) {
  const map = new Map();
  for (const chunk of chunkArray(productIds, 30)) {
    await Promise.all(chunk.map(async (productId) => {
      const pid = String(productId);
      const snap = await getDocs(query(
        collection(getDb(), 'product_images'),
        where('product_id', '==', pid),
      ));
      const first = snap.docs.find((row) => row.data()?.image_url);
      if (first?.data()?.image_url) {
        map.set(pid, String(first.data().image_url).trim());
      }
    }));
  }
  return map;
}

function mergeProductImages(productRows, imageByProductId) {
  return (productRows || []).map((product) => {
    const pid = String(product.id);
    const joinedUrl = imageByProductId.get(pid);
    if (!joinedUrl) return product;
    const existing = Array.isArray(product.product_images) ? product.product_images : [];
    if (existing.some((row) => row?.image_url === joinedUrl)) return product;
    return {
      ...product,
      product_images: [{ image_url: joinedUrl }, ...existing],
    };
  });
}

async function fetchInventoryViaApi(locationId, apiBase) {
  const base = String(apiBase || API_BASE || '').replace(/\/+$/, '');
  const response = await fetch(`${base}/api/inventory-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'snapshot', locations: [locationId] }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Failed to load inventory snapshot.');
  }
  return payload?.data || [];
}

async function resolveLusakaProductIds(inventoryRows) {
  const ids = new Set();
  const linked = await fetchDocsWhere('product_locations', 'location_id', LUSAKA_BRANCH_ID);
  linked.forEach((row) => {
    if (row?.product_id) ids.add(String(row.product_id));
  });
  (inventoryRows || []).forEach((row) => {
    if (!row?.product_id) return;
    const loc = String(row.location || row.location_id || '');
    if (loc === String(LUSAKA_BRANCH_ID)) ids.add(String(row.product_id));
  });
  return Array.from(ids);
}

async function fetchAllDocs(table) {
  const snap = await getDocs(collection(getDb(), table));
  return snap.docs.map((row) => ({ id: row.id, ...row.data() }));
}

async function resolveLusakaComboIds() {
  const rows = await fetchDocsWhere('combo_locations', 'location_id', LUSAKA_BRANCH_ID);
  return Array.from(new Set(rows.map((row) => String(row.combo_id)).filter(Boolean)));
}

async function fetchMissingProducts(existingProducts, allProductIds, imageByProductId) {
  const existingIds = new Set((existingProducts || []).map((row) => String(row.id)));
  const missingIds = (allProductIds || []).filter((id) => !existingIds.has(String(id)));
  if (!missingIds.length) return existingProducts || [];
  const extraRows = await fetchDocsByIds('products', missingIds);
  const extraImages = await fetchProductImageMap(missingIds);
  extraImages.forEach((url, pid) => imageByProductId.set(pid, url));
  return mergeProductImages(
    [...(existingProducts || []), ...extraRows],
    imageByProductId,
  );
}

function buildStockByProduct(inventoryRows) {
  const map = new Map();
  (inventoryRows || []).forEach((row) => {
    if (String(row.location || row.location_id) !== String(LUSAKA_BRANCH_ID)) return;
    const pid = String(row.product_id);
    map.set(pid, (map.get(pid) || 0) + (Number(row.quantity) || 0));
  });
  return map;
}

function buildDisplayRows({
  products,
  combos,
  comboItems,
  stockByProduct,
  productLocationPriceMap,
  comboLocationPriceMap,
}) {
  const setComponentProductIds = buildSetComponentProductIds(combos, comboItems);

  const setQtyByCombo = new Map();
  (combos || []).forEach((combo) => {
    const items = (comboItems || []).filter((row) => String(row.combo_id) === String(combo.id));
    if (!items.length) {
      setQtyByCombo.set(String(combo.id), 0);
      return;
    }
    const stock = {};
    items.forEach((item) => {
      stock[String(item.product_id)] = stockByProduct.get(String(item.product_id)) || 0;
    });
    setQtyByCombo.set(String(combo.id), getMaxSetQty(items, stock));
  });

  const productById = buildProductById(products);

  const sets = (combos || []).map((combo) => {
    const pricing = resolveComboLocationPricing(combo, LUSAKA_BRANCH_ID, comboLocationPriceMap);
    const standardRaw = pricing.combo_price ?? pricing.standard_price;
    const promoRaw = pricing.promotional_price;
    return {
      key: `set-${combo.id}`,
      type: 'set',
      id: combo.id,
      name: combo.combo_name || combo.sku || 'Set',
      sku: combo.sku || '',
      qty: setQtyByCombo.get(String(combo.id)) || 0,
      imageUrl: resolveProductImageUrl(combo.picture_url),
      standardPrice: formatLusakaPrice(standardRaw, combo.currency),
      promoPrice: formatLusakaPrice(promoRaw, combo.currency),
      standardPriceRaw: Number(standardRaw) || 0,
      promoPriceRaw: Number(promoRaw) || 0,
      components: buildSetComponents(combo.id, comboItems, productById, stockByProduct),
    };
  });

  const items = (products || [])
    .filter((product) => !setComponentProductIds.has(String(product.id)))
    .map((product) => {
      const pricing = resolveProductLocationPricing(product, LUSAKA_BRANCH_ID, productLocationPriceMap);
      return {
        key: `product-${product.id}`,
        type: 'product',
        id: product.id,
        name: product.name || product.sku || 'Product',
        sku: product.sku || '',
        qty: stockByProduct.get(String(product.id)) || 0,
        imageUrl: resolveProductRecordImageUrl(product),
        standardPrice: formatLusakaPrice(pricing.price, product.currency),
        promoPrice: formatLusakaPrice(pricing.promotional_price, product.currency),
        standardPriceRaw: Number(pricing.price) || 0,
        promoPriceRaw: Number(pricing.promotional_price) || 0,
      };
    });

  return [...sets, ...items]
    .filter((row) => Number(row.qty) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function filterStockRows(rows, search) {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return rows;
  const numericTerm = term.replace(/[^0-9.]/g, '');
  return rows.filter((row) => {
    if (row.name.toLowerCase().includes(term)) return true;
    if (String(row.sku || '').toLowerCase().includes(term)) return true;
    if (String(row.standardPrice || '').toLowerCase().includes(term)) return true;
    if (String(row.promoPrice || '').toLowerCase().includes(term)) return true;
    if (row.type === 'set' && Array.isArray(row.components)) {
      if (row.components.some((component) =>
        String(component.name || '').toLowerCase().includes(term)
        || String(component.sku || '').toLowerCase().includes(term))) {
        return true;
      }
    }
    if (numericTerm) {
      if (String(row.standardPriceRaw || '').includes(numericTerm)) return true;
      if (String(row.promoPriceRaw || '').includes(numericTerm)) return true;
    }
    return false;
  });
}

export async function fetchLusakaStockData(apiBase = API_BASE) {
  await ensureFirebaseAuthToken(false);
  const locSnap = await getDoc(doc(getDb(), 'locations', LUSAKA_BRANCH_ID));
  const locationName = locSnap.exists() ? (locSnap.data()?.name || 'Lusaka') : 'Lusaka';

  let inventoryRows = [];
  try {
    inventoryRows = await fetchInventoryViaApi(LUSAKA_BRANCH_ID, apiBase);
  } catch {
    inventoryRows = await fetchDocsWhere('inventory', 'location', LUSAKA_BRANCH_ID);
  }

  const [productIdList, linkedComboIds] = await Promise.all([
    resolveLusakaProductIds(inventoryRows),
    resolveLusakaComboIds(),
  ]);

  const [allCombos, allComboItems, productPriceRows, comboPriceRows] = await Promise.all([
    fetchAllDocs('combos'),
    fetchAllDocs('combo_items'),
    fetchDocsWhere('product_location_prices', 'location_id', LUSAKA_BRANCH_ID),
    fetchDocsWhere('combo_location_prices', 'location_id', LUSAKA_BRANCH_ID),
  ]);

  const [productRows, imageByProductId] = await Promise.all([
    fetchDocsByIds('products', productIdList),
    fetchProductImageMap(productIdList),
  ]);

  const preliminaryProducts = mergeProductImages(productRows, imageByProductId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

  let expandedComboIds = expandLusakaComboIds(linkedComboIds, preliminaryProducts, allCombos);
  let comboItemRows = filterComboItemsForCombos(allComboItems, expandedComboIds);
  const fullProductIdList = mergeProductIdsForSets(productIdList, comboItemRows, expandedComboIds);

  let products = preliminaryProducts;
  if (fullProductIdList.length > productIdList.length) {
    products = await fetchMissingProducts(preliminaryProducts, fullProductIdList, imageByProductId);
    products.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    expandedComboIds = expandLusakaComboIds(linkedComboIds, products, allCombos);
    comboItemRows = filterComboItemsForCombos(allComboItems, expandedComboIds);
  }

  const comboRows = allCombos.filter((combo) => expandedComboIds.includes(String(combo.id)));

  const combos = comboRows.sort((a, b) =>
    String(a.combo_name || '').localeCompare(String(b.combo_name || ''), undefined, { sensitivity: 'base' }));
  const stockByProduct = buildStockByProduct(inventoryRows);
  const productLocationPriceMap = buildProductLocationPriceMap(productPriceRows);
  const comboLocationPriceMap = buildComboLocationPriceMap(comboPriceRows);

  const rows = buildDisplayRows({
    products,
    combos,
    comboItems: comboItemRows,
    stockByProduct,
    productLocationPriceMap,
    comboLocationPriceMap,
  });

  const totalQty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);

  return {
    locationName,
    rows,
    totalQty,
    syncedAt: new Date(),
  };
}
