import { formatProductionNameClashMessage } from '../src/utils/productionNameClashUi.js';

const msgCatalog = formatProductionNameClashMessage({
  existing: 'High Class',
  existing_kind: 'catalog',
  reason: 'base_name_in_use',
});
if (!msgCatalog.includes('Products List')) {
  console.error('[verifyProductionNameClashUi] expected shop catalog hint');
  process.exit(1);
}

const msgAssembly = formatProductionNameClashMessage({
  existing: 'High Class Single Seater',
  existing_kind: 'assembly',
  reason: 'exact_name',
});
if (!msgAssembly.includes('do not create')) {
  console.error('[verifyProductionNameClashUi] expected block message for exact warehouse name');
  process.exit(1);
}

console.log('[verifyProductionNameClashUi] ok');
