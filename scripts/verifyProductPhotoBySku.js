/**
 * Label QR photo resolver must include warehouse catalog assembly family_sku images.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(root, 'server/lib/productPhotoBySku.js'), 'utf8');

if (!src.includes('loadWarehouseAssemblyImageByFamilySku')) {
  console.error('[verifyProductPhotoBySku] missing assembly family_sku lookup');
  process.exit(1);
}
if (!src.includes('warehouse_assembly_packets')) {
  console.error('[verifyProductPhotoBySku] packet→assembly link lookup missing');
  process.exit(1);
}

console.log('verifyProductPhotoBySku: ok');
