#!/usr/bin/env node
/**
 * Writes docs/samples/storage-sale-label-sample.png (80×68 mm @ 10 px/mm).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'docs', 'samples', 'storage-sale-label-sample.png');

async function main() {
  const modUrl = pathToFileURL(path.join(root, 'server/lib/warehouseStorageSaleLabelImage.js')).href;
  const {
    buildWarehouseStorageSaleLabelPngBuffer,
    STORAGE_SALE_LABEL_SAMPLE,
  } = await import(modUrl);
  const buf = await buildWarehouseStorageSaleLabelPngBuffer(STORAGE_SALE_LABEL_SAMPLE);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length} bytes, 800×680 px = 80×68 mm)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
