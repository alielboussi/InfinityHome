#!/usr/bin/env node
/**
 * Ensures core stocktake pipeline files keep STOCKTAKE_PIPELINE_LOCKED markers.
 * Run: node scripts/verifyStocktakeLockMarkers.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = 'STOCKTAKE_PIPELINE_LOCKED';

const files = [
  'src/utils/stocktakeVarianceLedger.js',
  'src/utils/stocktakeVarianceRows.js',
  'src/utils/stocktakeTransferSessions.js',
  'src/utils/stocktakePeriodPdfRows.js',
  'src/utils/periodPdfFromVariance.js',
  'src/utils/reconcileInventoryFromVariance.js',
  'src/components/StocktakePeriodPdfActions.js',
  'docs/stocktake-pdf-pipeline.md',
  '.cursor/rules/stocktake-pdf-lock.mdc',
];

let failed = false;
for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[verifyStocktakeLockMarkers] missing file: ${rel}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.includes(MARKER)) {
    console.error(`[verifyStocktakeLockMarkers] missing ${MARKER} in ${rel}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`[verifyStocktakeLockMarkers] OK — ${files.length} locked paths tagged.`);
