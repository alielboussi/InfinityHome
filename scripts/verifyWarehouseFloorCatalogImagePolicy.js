import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const kitweImg = read('src/utils/kitweCatalogFamilyCardImage.js');
const prodAttach = read('server/lib/warehouseProductionPhotoAttach.js');
const floor2Create = read('server/handlers/warehouse-mobile.js');

const errors = [];

if (kitweImg.includes('readWarehouseFloor2WipImageUrl')
  || kitweImg.includes('floor2_wip_image_url')) {
  errors.push('kitweCatalogFamilyCardImage must not use Floor 2 WIP images');
}
if (!kitweImg.includes('readFloor1CatalogImageUrl')) {
  errors.push('kitweCatalogFamilyCardImage must use readFloor1CatalogImageUrl');
}
if (prodAttach.includes('mergeWarehouseFloor2WipImageMetadata')) {
  errors.push('warehouseProductionPhotoAttach must not copy catalog photos to Floor 2 WIP');
}
if (!prodAttach.includes('mirrorCarpentryProductionCatalogToFloor2Wip')) {
  errors.push('warehouseProductionPhotoAttach must mirror carpentry catalog photos via mirrorCarpentryProductionCatalogToFloor2Wip');
}
const seater = read('src/utils/warehouseSeaterSetCoverImage.js');
if (!seater.includes('readFloor1CatalogImageUrl')) {
  errors.push('warehouseSeaterSetCoverImage must use readFloor1CatalogImageUrl for Floor 1');
}
const createFn = floor2Create.match(/async function opCatalogFloor2CreateProduct[\s\S]*?(?=async function op)/)?.[0] || '';
if (createFn.includes('attachProductionAssemblyCatalogPhoto')) {
  errors.push('catalog-floor2-create must not call attachProductionAssemblyCatalogPhoto');
}
if (!createFn.includes('saveAssemblyFloor2WipPhotoFromBase64')) {
  errors.push('catalog-floor2-create must use saveAssemblyFloor2WipPhotoFromBase64');
}

if (errors.length) {
  console.error('[verifyWarehouseFloorCatalogImagePolicy] FAILED');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('verifyWarehouseFloorCatalogImagePolicy: ok');