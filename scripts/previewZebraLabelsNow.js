import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWarehouseProductionLabelPngBuffer } from '../server/lib/warehouseProductionLabelImage.js';
import {
  buildWarehouseStorageSaleLabelPngBuffer,
  STORAGE_SALE_LABEL_SAMPLE,
} from '../server/lib/warehouseStorageSaleLabelImage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'docs', 'print-previews', 'zebra-labels');
const PRINTED_AT = new Date('2026-11-25T09:15:00+02:00');

async function main() {
  fs.mkdirSync(dir, { recursive: true });

  const files = [
    ['01-production-standard.png', await buildWarehouseProductionLabelPngBuffer({
      name: 'Farm Oak Dining Table',
      sku: 'WHF2-FARM-0144',
      printedAt: PRINTED_AT,
      photoFloor: 'floor2',
    })],
    ['02-production-color-box-dims.png', await buildWarehouseProductionLabelPngBuffer({
      name: 'Amara 3 Seater Recliner',
      sku: 'WHF2-AMARA-3S',
      color: 'Charcoal',
      boxUnitsPerCarton: 1,
      dimLength: 210,
      dimWidth: 95,
      dimHeight: 92,
      printedAt: PRINTED_AT,
    })],
    ['03-storage-sale.png', await buildWarehouseStorageSaleLabelPngBuffer({
      ...STORAGE_SALE_LABEL_SAMPLE,
      saleDate: PRINTED_AT,
    })],
    ['04-return-customer.png', await buildWarehouseStorageSaleLabelPngBuffer({
      name: 'Arena Nightstand',
      sku: 'WHF2-REPAIR-009',
      customerName: 'Jane Customer',
      customerPhone: '097 123 4567',
      saleDate: PRINTED_AT,
    })],
  ];

  for (const [name, buf] of files) {
    fs.writeFileSync(path.join(dir, name), buf);
    console.log('wrote', name, buf.length);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
