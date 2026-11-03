import {
  assemblyImageUrlFromRow,
  isSeaterOrReclinerComponentSet,
  pickThreeSeaterCoverAssembly,
  resolveSeaterSetCoverImageUrl,
  resolveWarehouseCatalogAssemblyImageUri,
} from '../src/utils/warehouseSeaterSetCoverImage.js';
import { buildWarehouseCategoryIndex } from '../src/utils/warehouseCategoryLookup.js';

const categories = [
  { id: 'c3', name: '3 Seaters' },
  { id: 'c2', name: '2 Seaters' },
  { id: 'ct', name: 'Coffee Tables' },
];
const categoryIndex = buildWarehouseCategoryIndex(categories);

const three = {
  id: 'a3',
  name: 'Layla 3 Seater Recliner',
  category_id: 'c3',
  image_url: 'https://example.com/three.jpg',
};
const two = { id: 'a2', name: 'Layla 2 Seater Recliner', category_id: 'c2', image_url: '' };
const setAsm = { id: 'set1', name: 'Layla Set', image_url: 'https://example.com/wrong.jpg' };

if (!isSeaterOrReclinerComponentSet([three, two], categoryIndex)) {
  console.error('[verifyWarehouseSeaterSetCoverImage] expected seater set');
  process.exit(1);
}

const cover = resolveSeaterSetCoverImageUrl([three, two], categoryIndex);
if (cover !== 'https://example.com/three.jpg') {
  console.error('[verifyWarehouseSeaterSetCoverImage] expected 3-seater URL, got', cover);
  process.exit(1);
}

const display = resolveWarehouseCatalogAssemblyImageUri(setAsm, {
  setComponentAssemblies: [three, two],
  categoryIndex,
});
if (display !== 'https://example.com/three.jpg') {
  console.error('[verifyWarehouseSeaterSetCoverImage] display URI should prefer 3-seater');
  process.exit(1);
}

const table = { id: 't1', name: 'Amara Coffee Table', category_id: 'ct', image_url: 'https://example.com/table.jpg' };
if (resolveSeaterSetCoverImageUrl([three, table], categoryIndex) !== undefined) {
  console.error('[verifyWarehouseSeaterSetCoverImage] mixed set must not use seater cover rule');
  process.exit(1);
}

const pick = pickThreeSeaterCoverAssembly([two, three], categoryIndex);
if (!pick || assemblyImageUrlFromRow(pick) !== 'https://example.com/three.jpg') {
  console.error('[verifyWarehouseSeaterSetCoverImage] pickThreeSeaterCoverAssembly failed');
  process.exit(1);
}

console.log('verifyWarehouseSeaterSetCoverImage: ok');
