/**
 * Keep quote order print helpers in deliveryKit (standalone builds cannot import ../../../src).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const COPY_PAIRS = [
  ['quoteProductionItemFields.js', 'quoteProductionItemFields.js'],
  ['quoteProductionLineProgress.js', 'quoteProductionLineProgress.js'],
  ['warehouseAccessoryCatalog.js', 'warehouseAccessoryCatalog.js'],
];

function sha(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
  let copied = 0;
  let missing = false;
  for (const [srcName, destName] of COPY_PAIRS) {
    const srcQuote = path.join(repoRoot, 'src', 'utils', srcName);
    if (!fs.existsSync(srcQuote)) {
      console.warn('[ensureDeliveryQuotePrintUtils] missing', srcQuote);
      missing = true;
      continue;
    }
    const hash = sha(srcQuote);
    const targets = [
      path.join(appRoot, 'deliveryKit', 'lib', destName),
      path.join(appRoot, 'delivery-overlays', 'lib', destName),
    ];
    for (const dest of targets) {
      if (sha(dest) === hash) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(srcQuote, dest);
      copied += 1;
    }
  }
  if (missing) {
    console.warn('[ensureDeliveryQuotePrintUtils] incomplete — some src utils missing');
    return;
  }
  console.log(copied ? '[ensureDeliveryQuotePrintUtils] ok' : '[ensureDeliveryQuotePrintUtils] skip — up to date');
}

module.exports = { main };
if (require.main === module) main();
