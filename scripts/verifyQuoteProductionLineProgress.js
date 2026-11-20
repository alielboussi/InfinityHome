/**
 * Partial quote line progress + factory PDF title row (text only, no line photos).
 * Run: node scripts/verifyQuoteProductionLineProgress.js
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

async function main() {
  const root = path.join(__dirname, '..');
  const mod = await import(
    pathToFileURL(path.join(root, 'src/utils/quoteProductionLineProgress.js')).href
  );
  const meta = {};
  const patch = mod.applyPartialLineProgressPatch(meta, 'line-1', 7, { userId: 'u1' });
  assert.strictEqual(patch.line_progress['line-1'].completed_qty, 7);
  const line = mod.enrichProductionLineWithProgress(
    { id: 'line-1', name: 'Bed', quantity: 10, ordered_qty: 10, production_completed_qty: 7 },
    patch,
  );
  assert.strictEqual(line.production_remaining_qty, 3);
  assert.strictEqual(line.quantity, 3);

  const pdfSrc = fs.readFileSync(path.join(root, 'src/utils/quoteFactoryOrderPdf.js'), 'utf8');
  assert(pdfSrc.includes('prod-title-row'), 'factory PDF must use bilingual title row');
  assert(!pdfSrc.includes('prod-line-photo'), 'factory PDF must not embed line product photos');
  assert(!pdfSrc.includes('lineImageDataByKey'), 'factory PDF must not preload line images');

  const i18n = fs.readFileSync(
    path.join(root, 'mobile-apps/carpentry-workshop/lib/productionKioskI18n.js'),
    'utf8',
  );
  assert(i18n.includes("ar: 'كنسل'"), 'Consoles Arabic');
  assert(i18n.includes("presetBunkbeds"), 'Bunkbeds preset');

  console.log('verifyQuoteProductionLineProgress: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});