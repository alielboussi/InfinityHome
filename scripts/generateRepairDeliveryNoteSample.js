/**
 * Writes a static A4 HTML sample for repair deliveries with customer.
 * Run: node scripts/generateRepairDeliveryNoteSample.js
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const root = path.join(__dirname, '..');
  const outDir = path.join(root, 'docs', 'reference');
  fs.mkdirSync(outDir, { recursive: true });

  const { buildDeliveryNotePrintHtml } = await import(
    pathToFileURL(path.join(root, 'src/utils/buildDeliveryNotePrintHtml.js')).href
  );

  const submittedAt = '2026-11-10T18:45:00.000Z';
  const html = buildDeliveryNotePrintHtml({
    deliveryNumber: 'RO0000000001',
    driverName: 'John Driver',
    dispatchedBy: 'Ali',
    driverSignatureSrc: '',
    companyLogoSrc: '',
    submittedAt,
    documentKind: 'repair_delivery',
    customerName: 'Jane Customer',
    customerPhone: '+260 97 123 4567',
    printGroups: [{
      assembly_name: 'Test Product',
      units: 1,
      lines: [],
    }],
    copies: 1,
  });

  const outPath = path.join(outDir, 'repair-delivery-note-sample.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log('Wrote', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
