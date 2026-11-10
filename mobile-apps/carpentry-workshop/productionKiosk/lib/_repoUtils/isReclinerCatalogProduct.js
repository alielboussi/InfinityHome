/** Warehouse categories used for recliner upholstery lines (Infinity Home catalog). */
const RECLINER_WAREHOUSE_CATEGORY_NAMES = new Set([
  '3 seaters',
  '2 seaters',
  'single seaters',
  'lounge chairs',
]);

/**
 * True when AI catalog retouch should use the recliner (ChatGPT-style) prompt block.
 */
export function isReclinerCatalogProduct({ productName, categoryName } = {}) {
  const name = String(productName || '');
  const cat = String(categoryName || '').trim().toLowerCase();
  if (/recliner/i.test(name) || /recliner/i.test(cat)) return true;
  if (RECLINER_WAREHOUSE_CATEGORY_NAMES.has(cat)) return true;
  return false;
}
