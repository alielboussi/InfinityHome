/**
 * Production create must save warehouse finished products (no packet BOM), not orphan packets.
 */
import fs from 'fs';
import path from 'path';

const handlerPath = path.join(process.cwd(), 'server/handlers/warehouse-mobile.js');
const src = fs.readFileSync(handlerPath, 'utf8');

const fnMatch = src.match(/async function opProductionPacketCreate[\s\S]*?^}/m);
if (!fnMatch) {
  console.error('[verifyProductionFinishedCreate] opProductionPacketCreate not found');
  process.exit(1);
}
const fn = fnMatch[0];

if (!fn.includes('saveAssemblyForMobile')) {
  console.error('[verifyProductionFinishedCreate] production create must call saveAssemblyForMobile');
  process.exit(1);
}
if (!fn.includes("inventory_mode: 'finished'")) {
  console.error('[verifyProductionFinishedCreate] production create must use inventory_mode finished');
  process.exit(1);
}
if (fn.includes("from('warehouse_packets').insert")) {
  console.error('[verifyProductionFinishedCreate] production create must not insert warehouse_packets');
  process.exit(1);
}
if (!fn.includes('warehouse_assembly_inventory')) {
  console.error('[verifyProductionFinishedCreate] production create must upsert warehouse_assembly_inventory');
  process.exit(1);
}

const photoOp = src.includes("case 'production-assembly-photo'");
if (!photoOp || !src.includes('opProductionAssemblyPhoto')) {
  console.error('[verifyProductionFinishedCreate] production-assembly-photo op required for AI photo step');
  process.exit(1);
}

console.log('[verifyProductionFinishedCreate] ok');
