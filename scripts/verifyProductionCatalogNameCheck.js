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

if (productionNamesConflict('High Class Single Seater', 'High Class')) {
  console.error('[verifyProductionCatalogNameCheck] brand base High Class should allow Single Seater vs shop bare name');
  process.exit(1);
}

if (!productionNamesConflict('High Class Single Seater', 'High Class Single Seater')) {
  console.error('[verifyProductionCatalogNameCheck] identical High Class Single Seater should clash');
  process.exit(1);
}

if (productionNamesConflict('High Class Single Seater', 'High Class 3 Seater')) {
  console.error('[verifyProductionCatalogNameCheck] Single Seater vs 3 Seater on same line should be allowed');
  process.exit(1);
}

if (productionNamesConflict('High Class Single Seater', 'High Class 3Seater')) {
  console.error('[verifyProductionCatalogNameCheck] Single Seater vs mis-suffixed 3 Seater should be allowed');
  process.exit(1);
}

if (productionNamesConflict('High Class', 'High Class 3 Seater')) {
  console.error('[verifyProductionCatalogNameCheck] bare base probe vs existing 3 Seater should not clash');
  process.exit(1);
}

console.log('[verifyProductionCatalogNameCheck] ok');
