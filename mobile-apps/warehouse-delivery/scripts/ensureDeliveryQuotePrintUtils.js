/**
 * Keep quote order print helpers in deliveryKit (standalone builds cannot import ../../../src).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const srcQuote = path.join(repoRoot, 'src', 'utils', 'quoteProductionItemFields.js');
const targets = [
  path.join(appRoot, 'deliveryKit', 'lib', 'quoteProductionItemFields.js'),
  path.join(appRoot, 'delivery-overlays', 'lib', 'quoteProductionItemFields.js'),
];

function sha(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
  if (!fs.existsSync(srcQuote)) {
    console.warn('[ensureDeliveryQuotePrintUtils] skip — repo src util missing');
    return;
  }
  const hash = sha(srcQuote);
  let copied = 0;
  for (const dest of targets) {
    if (sha(dest) === hash) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcQuote, dest);
    copied += 1;
  }
  console.log(copied ? '[ensureDeliveryQuotePrintUtils] ok' : '[ensureDeliveryQuotePrintUtils] skip — up to date');
}

module.exports = { main };
if (require.main === module) main();
