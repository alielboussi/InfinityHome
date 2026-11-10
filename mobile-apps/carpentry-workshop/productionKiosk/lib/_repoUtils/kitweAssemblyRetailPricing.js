import db from '../dataClient';
import { KITWE_LOCATION_ID } from '../_repoConstants/warehouseShowroomLocations';
import {
  applyProductLocationPricing,
  buildProductLocationPriceUpsert,
  resolveProductLocationPricing,
} from './locationPricing';
import { normalizeWarehouseProductSku } from './warehouseScanResolver';
import { isWarehouseSetAssembly } from './warehouseSetMath';
import { resolveProductRecordImageUrl } from './productImageUrl';

export function indexRetailProducts(products = []) {
  const byId = new Map();
  const bySku = new Map();
  (products || []).forEach((p) => {
    if (!p?.id) return;
    byId.set(String(p.id), p);
    const sku = String(p.sku || '').trim().toLowerCase();
    if (sku) bySku.set(sku, p);
  });
  return { byId, bySku };
}

export function resolveRetailProductForAssembly(assembly, index) {
  if (!assembly) return null;
  const rid = assembly.retail_product_id;
  if (rid && index.byId.has(String(rid))) return index.byId.get(String(rid));
  const skuKey = String(
    normalizeWarehouseProductSku(assembly.family_sku || '') || assembly.family_sku || '',
  ).trim().toLowerCase();
  if (skuKey && index.bySku.has(skuKey)) return index.bySku.get(skuKey);
  return null;
}

const PRODUCT_SELECT = 'id, name, sku, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, image_url, product_images(image_url)';
const IN_QUERY_CHUNK = 40;

function chunkList(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

async function fetchProductsBySkus(skus) {
  const list = [...new Set([...skus].map((s) => String(s || '').trim()).filter(Boolean))];
  if (!list.length) return [];
  const rows = [];
  for (const chunk of chunkList(list, IN_QUERY_CHUNK)) {
    const { data } = await db.from('products').select(PRODUCT_SELECT).in('sku', chunk);
    if (data?.length) rows.push(...data);
  }
  const found = new Set(rows.map((r) => String(r.sku || '').trim().toLowerCase()));
  const missing = list.filter((sku) => !found.has(sku.toLowerCase()));
  await Promise.all(missing.map(async (sku) => {
    const { data } = await db.from('products').select(PRODUCT_SELECT).eq('sku', sku).limit(1);
    if (data?.[0]) rows.push(data[0]);
  }));
  return rows;
}

async function fetchProductsByIds(ids) {
  const list = [...new Set([...ids].map((id) => String(id || '').trim()).filter(Boolean))];
  if (!list.length) return [];
  const rows = [];
  for (const chunk of chunkList(list, IN_QUERY_CHUNK)) {
    const { data } = await db.from('products').select(PRODUCT_SELECT).in('id', chunk);
    if (data?.length) rows.push(...data);
  }
  return rows;
}

/** Kitwe catalog price cells — uses location overrides even before full retail row is loaded. */
export function resolveKitweAssemblyCatalogPricing(assembly, retailIndex, priceMap, locationId) {
  const retail = resolveRetailProductForAssembly(assembly, retailIndex);
  const pricingProduct = retail
    || (assembly?.retail_product_id ? { id: assembly.retail_product_id } : null);
  if (!pricingProduct?.id) {
    return { price: null, promotional_price: null };
  }
  return resolveProductLocationPricing(pricingProduct, locationId, priceMap);
}

/**
 * Merge POS/catalog product rows with any extra retail rows needed for Kitwe assemblies.
 */
export async function loadRetailProductsForAssemblies(assemblies, seedProducts = []) {
  const index = indexRetailProducts(seedProducts);
  const needIds = new Set();
  const needSkus = new Set();
  (assemblies || []).forEach((assembly) => {
    const rid = assembly?.retail_product_id;
    if (rid && !index.byId.has(String(rid))) needIds.add(String(rid));
    const sku = String(
      normalizeWarehouseProductSku(assembly?.family_sku || '') || assembly?.family_sku || '',
    ).trim();
    if (sku && !index.bySku.has(sku.toLowerCase())) needSkus.add(sku);
  });
  const extra = [
    ...(await fetchProductsByIds(needIds)),
    ...(await fetchProductsBySkus(needSkus)),
  ];
  return indexRetailProducts([...(seedProducts || []), ...extra]);
}

export function applyKitweAssemblyPosPricing({
  assembly,
  stock,
  locationId,
  productLocationPriceMap,
  retailIndex,
  categoriesById,
  isSet = false,
  kitweComponents = [],
}) {
  const retail = resolveRetailProductForAssembly(assembly, retailIndex);
  const categoryId = assembly?.category_id || retail?.category_id || null;
  const categoryName = categoryId ? (categoriesById?.get(String(categoryId)) || '') : '';
  const pricedBase = retail
    ? applyProductLocationPricing(retail, locationId, productLocationPriceMap)
    : {
      price: null,
      promotional_price: null,
      currency: 'K',
      promo_start_date: null,
      promo_end_date: null,
    };

  const imageUrl = assembly?.image_url
    ? String(assembly.image_url)
    : (retail ? resolveProductRecordImageUrl(retail) : '');

  const common = {
    name: assembly?.name || retail?.name || 'Product',
    sku: assembly?.family_sku || retail?.sku || '',
    stock: Math.max(0, Number(stock) || 0),
    stockState: (Number(stock) || 0) > 0 ? 'in-stock' : 'out',
    posCatalogSource: 'kitwe_warehouse',
    warehouseAssemblyId: assembly.id,
    retail_product_id: retail?.id || assembly?.retail_product_id || null,
    category_id: categoryId,
    category_name: categoryName,
    price: pricedBase.price,
    promotional_price: pricedBase.promotional_price,
    promo_start_date: pricedBase.promo_start_date,
    promo_end_date: pricedBase.promo_end_date,
    currency: pricedBase.currency || retail?.currency || 'K',
    imageUrl,
    image_url: assembly?.image_url || retail?.image_url,
  };

  if (isSet) {
    return {
      ...common,
      id: `kitwe-set-${assembly.id}`,
      kitweWarehouseSet: true,
      isSet: true,
      combo_name: common.name,
      kitweComponents: kitweComponents || [],
    };
  }

  return {
    ...common,
    id: `kitwe-wh-${assembly.id}`,
  };
}

/**
 * Find or create a Products List row for Kitwe pricing (same SKU as warehouse family_sku).
 */
export async function ensureRetailProductForKitweAssembly(assembly) {
  const rid = assembly?.retail_product_id;
  if (rid) {
    const fetched = await fetchProductsByIds([rid]);
    if (fetched[0]) return fetched[0];
  }

  const sku = String(
    normalizeWarehouseProductSku(assembly?.family_sku || '') || assembly?.family_sku || '',
  ).trim();
  if (!sku) throw new Error('Product SKU is required before setting prices.');

  const bySku = await fetchProductsBySkus([sku]);
  if (bySku[0]) {
    if (!assembly.retail_product_id) {
      await db.from('warehouse_assemblies').update({
        retail_product_id: bySku[0].id,
        updated_at: new Date().toISOString(),
      }).eq('id', assembly.id);
    }
    return bySku[0];
  }

  const now = new Date().toISOString();
  const { data: created, error } = await db.from('products').insert({
    name: String(assembly.name || sku).trim(),
    sku,
    category_id: assembly.category_id || null,
    price: null,
    promotional_price: null,
    currency: 'K',
    created_at: now,
    updated_at: now,
    metadata: { source: 'kitwe_products_portal', assembly_id: assembly.id },
  }).select('*').single();
  if (error) throw new Error(error.message || 'Failed to create retail product for pricing');

  await db.from('warehouse_assemblies').update({
    retail_product_id: created.id,
    updated_at: now,
  }).eq('id', assembly.id);

  await db.from('product_locations').upsert({
    product_id: created.id,
    location_id: KITWE_LOCATION_ID,
    updated_at: now,
  }, { onConflict: 'product_id,location_id' });

  return created;
}

export async function saveKitweAssemblyLocationPrice(assembly, { price, promotionalPrice }) {
  const retail = await ensureRetailProductForKitweAssembly(assembly);
  const row = buildProductLocationPriceUpsert({
    productId: retail.id,
    locationId: KITWE_LOCATION_ID,
    price: price === '' || price == null ? null : Number(price),
    promotionalPrice: promotionalPrice === '' || promotionalPrice == null ? null : Number(promotionalPrice),
  });
  const { upsertProductLocationPrices } = await import('../services/locationPricing');
  await upsertProductLocationPrices(db, [row]);
  return retail;
}

export function filterKitweSellableAssemblies(assemblies) {
  return (assemblies || []).filter((a) => !isWarehouseSetAssembly(a));
}
