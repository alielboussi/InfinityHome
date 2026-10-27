import {
  findProductionNameClash,
  productionNamesConflict,
} from '../server/lib/productionCatalogNameCheck.js';

if (!productionNamesConflict('Olivia Single Seater', 'Olivia')) {
  console.error('[verifyProductionCatalogNameCheck] catalog Olivia should block Olivia Single Seater');
  process.exit(1);
}
if (productionNamesConflict('Olivia Lounge Chair', 'Olivia Single Seater')) {
  console.error('[verifyProductionCatalogNameCheck] different presets on same base should be allowed');
  process.exit(1);
}
if (!productionNamesConflict('Olivia Single Seater', 'Olivia Single Seater')) {
  console.error('[verifyProductionCatalogNameCheck] identical full names should clash');
  process.exit(1);
}
if (!productionNamesConflict('Stella 3 Seater', 'Stella')) {
  console.error('[verifyProductionCatalogNameCheck] bare catalog name should block preset variant');
  process.exit(1);
}
if (productionNamesConflict('Maya 3 Seater', 'Olivia')) {
  console.error('[verifyProductionCatalogNameCheck] unrelated names should not clash');
  process.exit(1);
}

console.log('[verifyProductionCatalogNameCheck] ok');
