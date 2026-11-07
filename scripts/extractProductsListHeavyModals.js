/**
 * One-off helper: extracts factory / image / adjust modals from ProductsListPage
 * into a lazy-loaded chunk with `p.*` props.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pagePath = path.join(root, 'src/ProductsListPage.js');
const outPath = path.join(root, 'src/components/productsList/ProductsListHeavyModals.js');

const PROP_NAMES = [
  'factoryStorageModalOpen', 'factoryStorageModalProduct', 'factoryStorageModalRows', 'factoryStorageRowsLoading',
  'factoryStorageModalError', 'factoryStorageForm', 'factoryStorageSubmitting', 'factoryStorageReleaseDraft',
  'factoryStorageReleaseBusy', 'factoryStorageEditDraft', 'factoryStorageEditBusy', 'factoryStorageModalLabel',
  'factoryStorageModalIsCombo', 'factoryStorageComboHoldSets', 'modalFactoryHoldQty', 'factoryStorageComboPreview',
  'factoryStorageModalItemHeader', 'factoryStorageComboComponentMap', 'factoryStorageComboComponents',
  'closeFactoryStorageModal', 'handleFactoryStorageFormChange', 'handleCreateFactoryStorageEntry',
  'startFactoryStorageRelease', 'cancelFactoryStorageRelease', 'submitFactoryStorageRelease',
  'startFactoryStorageEdit', 'handleFactoryStorageEditChange', 'cancelFactoryStorageEdit', 'submitFactoryStorageEdit',
  'factoryModalInputStyle', 'canEditFactoryHolds', 'toDateInputValue',
  'imageEditModalOpen', 'imageEditProduct', 'imageEditBulkProducts', 'imageEditFile', 'imageEditLoading',
  'setImageEditModalOpen', 'setImageEditProduct', 'setImageEditBulkProducts', 'setImageEditFile', 'setImageEditLoading',
  'applyImageFileToItem', 'fetchAll', 'purgeExistingStorageImages', 'setToolbarNotice',
  'adjustModalOpen', 'adjustProduct', 'adjustSetMode', 'transferMode', 'selectedLocation', 'setSelectedLocation',
  'adjustQty', 'setAdjustQty', 'adjustLoading', 'locations', 'setAdjustSetMode', 'setTransferMode',
  'handleAdjustInventory', 'setAdjustModalOpen', 'canAdjustInventory', 'computeComboMaxQty', 'getStockForProduct',
  'comboItems', 'transferFrom', 'setTransferFrom', 'transferTo', 'setTransferTo', 'transferQty',
  'setTransferQty', 'transferBusy', 'manualTransferDate', 'setManualTransferDate',
  'resolveLocationUuid', 'canEditFactoryHolds', 'setBulkSelectionMap',
  'loadFactoryStorageRows', 'refreshFactoryStorageSummary', 'resolveFactoryStorageActor',
];

const s = fs.readFileSync(pagePath, 'utf8');
const start = s.indexOf('{factoryStorageModalOpen && factoryStorageModalProduct');
const end = s.indexOf('{/* ======== End fixed modals ======== */}');
if (start < 0 || end < 0) {
  console.error('modal markers missing');
  process.exit(1);
}
let block = s.slice(start, end);

const sortedProps = [...new Set(PROP_NAMES)].sort((a, b) => b.length - a.length);
for (const name of sortedProps) {
  const re = new RegExp(`(?<!p\\.)\\b${name}\\b`, 'g');
  block = block.replace(re, `p.${name}`);
}

const footer = `
    </>
  );
}
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
block = block.replace(/p\.products-/g, 'products-');
block = block.replace(/\.from\('p\.products'\)/g, ".from('products')");
block = block.replace(/Selected p\.products/g, 'Selected products');
block = block.replace(/\$\{p\.imageEditBulkProducts\.length\} p\.products\./g, '${p.imageEditBulkProducts.length} products.');

const header2 = `/* eslint-disable react/jsx-filename-extension */
import React from 'react';
import db from '../../dataClient';

const toDateInputValue = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  } catch {
    return String(value).slice(0, 10);
  }
};

export default function ProductsListHeavyModals(p) {
  return (
    <>
`;

fs.writeFileSync(outPath, header2 + block + footer);
console.log('Wrote', outPath, 'bytes', header2.length + block.length + footer.length);
