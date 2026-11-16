#!/usr/bin/env node
/**
 * Ensures Kitwe set display files keep KITWE_PRODUCTS_SET_DISPLAY_LOCKED markers.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const MARKER = 'KITWE_PRODUCTS_SET_DISPLAY_LOCKED';

const files = [
  'src/utils/kitweSetStock.js',
  'src/utils/kitweCatalogComponentVisibility.js',
  'src/KitweProductsPage.js',
  'docs/kitwe-products-set-display.md',
  'scripts/verifyKitweProductsSetDisplay.js',
  '.cursor/rules/kitwe-products-set-locked.mdc',
];

let failed = false;
for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[verifyKitweProductsSetLockMarkers] missing file: ${rel}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.includes(MARKER)) {
    console.error(`[verifyKitweProductsSetLockMarkers] missing ${MARKER} in ${rel}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`[verifyKitweProductsSetLockMarkers] OK — ${files.length} locked paths tagged.`);