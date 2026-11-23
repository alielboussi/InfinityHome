/**
 * Warehouse accessories + upholstery quote subcategory picks (data-driven).
 * Usage: node scripts/verifyWarehouseAccessories.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

try {
  const util = read('src/utils/warehouseAccessoryCatalog.js');
  assert(util.includes('ACCESSORY_SUBCATEGORY'), 'subcategory role missing');
  assert(util.includes('normalizeAccessoryPicks'), 'picks helper missing');

  const actions = read('src/components/WarehouseCatalogCreateActions.js');
  assert(actions.includes('Accessory'), '+ Accessory button missing');

  const quote = read('src/utils/quoteProductionItemFields.js');
  assert(quote.includes('accessory_picks'), 'quote metadata must store accessory_picks');

  const create = read('src/Quotationer.js');
  assert(create.includes('QuoteLineAccessorySubcategoryFields'), 'customer order upholstery fields missing');

  const app = read('mobile-apps/warehouse-upholstery/shared/quoteProductionOrderUi.js');
  assert(app.includes('accessory_picks'), 'upholstery orders must render accessory_picks dynamically');

  const perProduct = read('src/components/QuoteLineAccessorySubcategoryFields.jsx');
  assert(perProduct.includes('Add subcategory to this product'), 'each order product must allow its own subcategories');
  const productEdit = read('src/WarehouseProductEditPage.js');
  assert(productEdit.includes('accessory_subcategory_ids'), 'warehouse products must store accessory subcategories');

  console.log('verifyWarehouseAccessories: OK');
} catch (e) {
  if (!process.exitCode) process.exitCode = 1;
}
