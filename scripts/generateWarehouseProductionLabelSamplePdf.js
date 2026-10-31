/**
 * Visual sample of the 80×68 mm warehouse production label.
 * Run: node scripts/generateWarehouseProductionLabelSamplePdf.js
 */
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'samples');
const OUT_PDF = path.join(OUT_DIR, 'warehouse-production-label-sample.pdf');
const OUT_PNG = path.join(OUT_DIR, 'warehouse-production-label-sample.png');

const WIDTH_MM = 80;
const HEIGHT_MM = 68;

async function main() {
  const { buildWarehouseProductionLabelPngBuffer } = await import('../server/lib/warehouseProductionLabelImage.js');

  const pngBuffer = await buildWarehouseProductionLabelPngBuffer({
    name: 'Vanessa Dining Chair',
    sku: '3002791082000040',
    color: 'Walnut',
    boxUnitsPerCarton: 2,
    printedAt: new Date('2026-10-31T09:15:00+02:00'),
  });

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [WIDTH_MM, HEIGHT_MM],
  });
  const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
  doc.addImage(dataUri, 'PNG', 0, 0, WIDTH_MM, HEIGHT_MM);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PNG, pngBuffer);
  fs.writeFileSync(OUT_PDF, Buffer.from(doc.output('arraybuffer')));
  console.log(`Wrote ${OUT_PDF}`);
  console.log(`Wrote ${OUT_PNG}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
