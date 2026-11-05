import {
  isKitweProductsPortalAssembly,
  kitweQtyByAssembly,
} from './kitweSetStock.js';

const KITWE_RETAIL_PRODUCT_SOURCES = new Set([
  'kitwe_delivery_accept',
  'kitwe_products_portal',
]);

/** Retail `products` row created for Kitwe portal / delivery accept only. */
export function isKitweCatalogRetailProduct(product) {
  const meta = product?.metadata || {};
  const source = String(meta.source || '').trim();
  return KITWE_RETAIL_PRODUCT_SOURCES.has(source);
}

/** Product ids linked to warehouse assemblies shown on /kitwe-products. */
export function buildProductsListExcludedRetailIds(assemblies, assemblyInventory) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  const ids = new Set();
  (assemblies || []).forEach((assembly) => {
    if (!isKitweProductsPortalAssembly(assembly, qtyByAssembly)) return;
    const rid = String(assembly.retail_product_id || '').trim();
    if (rid) ids.add(rid);
  });
  return ids;
}

export function filterProductsListCatalogProducts(products, assemblies, assemblyInventory) {
  const excludedIds = buildProductsListExcludedRetailIds(assemblies, assemblyInventory);
  return (products || []).filter((product) => {
    if (!product?.id) return false;
    if (excludedIds.has(String(product.id))) return false;
    if (isKitweCatalogRetailProduct(product)) return false;
    return true;
  });
}
