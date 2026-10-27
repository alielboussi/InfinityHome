/**
 * Production stock increase must not load the full warehouse catalog per save.
 */
import fs from 'fs';
import path from 'path';

const handlerPath = path.join(process.cwd(), 'server/handlers/warehouse-mobile.js');
const src = fs.readFileSync(handlerPath, 'utf8');

const fnMatch = src.match(/async function opProductionStockIncrease[\s\S]*?^}/m);
if (!fnMatch) {
  console.error('[verifyProductionStockIncrease] opProductionStockIncrease not found');
  process.exit(1);
}
const fn = fnMatch[0];

if (fn.includes('setAssemblyProductQuantityForMobile')) {
  console.error('[verifyProductionStockIncrease] finished assembly path must use upsertFinishedAssemblyInventoryQuantity');
  process.exit(1);
}
if (!fn.includes('upsertFinishedAssemblyInventoryQuantity')) {
  console.error('[verifyProductionStockIncrease] missing upsertFinishedAssemblyInventoryQuantity');
  process.exit(1);
}

console.log('[verifyProductionStockIncrease] ok');
