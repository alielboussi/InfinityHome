/**
 * Build visual previews of every Zebra label family and every A4 delivery-note kind.
 * Run: node scripts/generatePrintPreviewPack.js
 * Output: docs/print-previews/
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { jsPDF } = require('jspdf');
const bwipjs = require('bwip-js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'print-previews');
const zebraDir = path.join(outDir, 'zebra-labels');
const a4Dir = path.join(outDir, 'a4-delivery-notes');

const LABEL_W_MM = 80;
const LABEL_H_MM = 68;
const PRINTED_AT = new Date('2026-11-23T09:15:00+02:00');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || '';
}

function htmlToPdf(chromePath, htmlPath, pdfPath) {
  const url = pathToFileURL(htmlPath).href;
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--print-to-pdf=${pdfPath}`,
    '--no-pdf-header-footer',
    '--print-to-pdf-no-header',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=8000',
    url,
  ];
  const res = spawnSync(chromePath, args, { encoding: 'utf8' });
  if (res.status !== 0 || !fs.existsSync(pdfPath)) {
    throw new Error(res.stderr || res.stdout || `print-to-pdf failed (${res.status})`);
  }
}

function pngToLabelPdf(pngBuffer, pdfPath) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [LABEL_W_MM, LABEL_H_MM],
  });
  doc.addImage(`data:image/png;base64,${pngBuffer.toString('base64')}`, 'PNG', 0, 0, LABEL_W_MM, LABEL_H_MM);
  fs.writeFileSync(pdfPath, Buffer.from(doc.output('arraybuffer')));
}

const sampleSignatureSvg = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="70" viewBox="0 0 240 70">'
  + '<path d="M8 52 C35 8 55 58 85 28 S130 48 165 22 S210 40 232 30" stroke="#111" fill="none" stroke-width="2.2" stroke-linecap="round"/>'
  + '</svg>',
);
const driverSignatureSrc = `data:image/svg+xml,${sampleSignatureSvg}`;

const packetGroups = [
  {
    assembly_name: 'Arena Nightstand',
    units: 1,
    lines: [
      { name: 'Arena Sol Kmdn Pk-1', packet_number: 1, qty: 1 },
      { name: 'Arena Sol/Sag Kmdn Pk-2', packet_number: 2, qty: 1 },
    ],
  },
  {
    assembly_name: 'Amara 3 Seater',
    units: 2,
    lines: [
      { name: 'Amara Seat Carton', packet_number: 1, qty: 2 },
      { name: 'Amara Back Carton', packet_number: 2, qty: 2 },
    ],
  },
];

const finishedGroups = [
  { assembly_name: 'Farm Oak Dining Table', units: 2, lines: [] },
  { assembly_name: 'Farm Side Chair', units: 6, lines: [] },
];

async function barcodeDataUri(text) {
  const buf = await bwipjs.toBuffer({
    bcid: 'code128',
    text: String(text || 'SKU').toUpperCase(),
    scale: 3,
    height: 8,
    includetext: false,
  });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function returnCustomerLabelHtml({ sku, name, customerName, customerPhone, dateText, timeText, barcodeSrc }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Return customer label</title>
<style>
  @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .label {
    width: ${LABEL_W_MM}mm; height: ${LABEL_H_MM}mm;
    box-sizing: border-box;
    border: 0.6mm solid #1e3a5f;
    padding: 2mm;
    font-family: Helvetica, Arial, sans-serif;
    color: #111;
    position: relative;
  }
  .co { text-align: center; font-size: 11pt; font-weight: 800; margin: 0 0 1.4mm; }
  .bc { display: block; width: 40mm; height: 6.5mm; margin: 0 auto 1.1mm; object-fit: contain; }
  .row { display: grid; grid-template-columns: 26mm 1fr; gap: 1mm; min-height: 4mm; align-items: center; }
  .k { font-size: 8.5pt; font-weight: 700; }
  .v { font-size: 9pt; text-align: center; font-weight: 600; }
</style></head>
<body>
  <div class="label">
    <p class="co">Bestrest Furniture</p>
    <img class="bc" src="${barcodeSrc}" alt="Code 128"/>
    <div class="row"><div class="k">SKU:</div><div class="v">${sku}</div></div>
    <div class="row"><div class="k">Product Name:</div><div class="v">${name}</div></div>
    <div class="row"><div class="k">Customer Name:</div><div class="v">${customerName}</div></div>
    <div class="row"><div class="k">Customer #:</div><div class="v">${customerPhone}</div></div>
    <div class="row"><div class="k">Date:</div><div class="v">${dateText}</div></div>
    <div class="row"><div class="k">Time:</div><div class="v">${timeText}</div></div>
  </div>
</body></html>`;
}

function writeReadme() {
  const text = `# Print previews (Zebra + A4)

Generated by \`node scripts/generatePrintPreviewPack.js\` on ${new Date().toISOString()}.

Open **index.html** in a browser, or the PDFs in each subfolder.

## Zebra labels (80 × 68 mm)

Same physical size as the Zebra Weblink labels. PDFs are that paper size (not A4).

| File | When it prints |
|---|---|
| \`01-production-standard\` | Floor 2 WIP / carpentry / upholstery / painting / farm→Floor 2: name, SKU, Code 128, product-image QR, date+time |
| \`02-production-color-box-dims\` | Same family with Color, Pack, Dims rows |
| \`03-storage-sale\` | Sold / warehouse storage (Orders app) |
| \`04-return-customer\` | Repair/return customer pickup (no product QR; Code 128 + customer) |

Kitwe farm deliveries **do not** print Zebra labels.

## A4 delivery notes

Built from \`src/utils/buildDeliveryNotePrintHtml.js\` (the live print HTML).

| File | Kind |
|---|---|
| \`01-kitwe-floor1-delivery\` | Delivery Note (Floor 1 → Kitwe truck) |
| \`02-sold-delivery\` | Sold Delivery Note |
| \`03-farm-delivery\` | Farm Delivery Note (Floor 2 → Farm, legacy) |
| \`04-farm-return\` | Farm to Warehouse Delivery Note (Farm → Floor 2 or Kitwe) |
| \`05-repair-delivery\` | Repair Delivery Note (customer block) |
| \`06-return-note\` | Return Note (Hassan warehouse return) |
| \`07-return-shipment\` | Return Note (return shipment) |
| \`08-return-customer-delivery\` | Return Delivery Note |
| \`09-customer-order-delivery\` | Customer Order Delivery Note |
| \`10-showroom-order-delivery\` | Showroom Order Delivery Note (no customer block) |
| \`11-set-hierarchy-delivery\` | Delivery Note with set → product → packet lines |
`;
  fs.writeFileSync(path.join(outDir, 'README.md'), text, 'utf8');
}

async function main() {
  mkdirp(zebraDir);
  mkdirp(a4Dir);

  const { buildWarehouseProductionLabelPngBuffer } = await import('../server/lib/warehouseProductionLabelImage.js');
  const {
    buildWarehouseStorageSaleLabelPngBuffer,
    STORAGE_SALE_LABEL_SAMPLE,
  } = await import('../server/lib/warehouseStorageSaleLabelImage.js');
  const { formatProductionLabelBlockDate, formatProductionLabelBlockTime } = await import(
    '../server/lib/warehouseProductionLabelCatTime.js'
  );
  const { buildDeliveryNotePrintHtml } = await import('../src/utils/buildDeliveryNotePrintHtml.js');
  const { DELIVERY_NOTE_LOGO_DATA_URI } = await import('../src/utils/deliveryNoteCompanyLogoEmbedded.js');
  const { buildSetDeliveryPrintLines } = await import('../src/utils/warehouseDeliverySetHierarchy.js');

  const zebraEntries = [];

  const prodStd = await buildWarehouseProductionLabelPngBuffer({
    name: 'Farm Oak Dining Table',
    sku: 'WHF2-FARM-0144',
    printedAt: PRINTED_AT,
  });
  fs.writeFileSync(path.join(zebraDir, '01-production-standard.png'), prodStd);
  pngToLabelPdf(prodStd, path.join(zebraDir, '01-production-standard.pdf'));
  zebraEntries.push({
    id: '01-production-standard',
    title: 'Production / Floor 2 / Farm→Floor 2',
    png: 'zebra-labels/01-production-standard.png',
  });

  const prodFull = await buildWarehouseProductionLabelPngBuffer({
    name: 'Amara 3 Seater Recliner',
    sku: 'WHF2-AMARA-3S',
    color: 'Charcoal',
    boxUnitsPerCarton: 1,
    dimLength: 210,
    dimWidth: 95,
    dimHeight: 92,
    printedAt: PRINTED_AT,
  });
  fs.writeFileSync(path.join(zebraDir, '02-production-color-box-dims.png'), prodFull);
  pngToLabelPdf(prodFull, path.join(zebraDir, '02-production-color-box-dims.pdf'));
  zebraEntries.push({
    id: '02-production-color-box-dims',
    title: 'Production with Color / Pack / Dims',
    png: 'zebra-labels/02-production-color-box-dims.png',
  });

  const storagePng = await buildWarehouseStorageSaleLabelPngBuffer({
    ...STORAGE_SALE_LABEL_SAMPLE,
    printedAt: PRINTED_AT,
  });
  fs.writeFileSync(path.join(zebraDir, '03-storage-sale.png'), storagePng);
  pngToLabelPdf(storagePng, path.join(zebraDir, '03-storage-sale.pdf'));
  zebraEntries.push({
    id: '03-storage-sale',
    title: 'Sold / warehouse storage',
    png: 'zebra-labels/03-storage-sale.png',
  });

  const retSku = 'WHF2-REPAIR-009';
  const barcodeSrc = await barcodeDataUri(retSku);
  const returnHtml = returnCustomerLabelHtml({
    sku: retSku,
    name: 'Arena Nightstand',
    customerName: 'Jane Customer',
    customerPhone: '097 123 4567',
    dateText: formatProductionLabelBlockDate(PRINTED_AT),
    timeText: formatProductionLabelBlockTime(PRINTED_AT),
    barcodeSrc,
  });
  const returnHtmlPath = path.join(zebraDir, '04-return-customer.html');
  fs.writeFileSync(returnHtmlPath, returnHtml, 'utf8');
  zebraEntries.push({
    id: '04-return-customer',
    title: 'Return / repair customer pickup',
    html: 'zebra-labels/04-return-customer.html',
  });

  const combo = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 16;
  combo.setFontSize(16);
  combo.text('Zebra labels — 80 × 68 mm', 14, y);
  y += 8;
  combo.setFontSize(10);
  for (const entry of zebraEntries) {
    const pngPath = entry.png ? path.join(outDir, entry.png) : '';
    if (pngPath && fs.existsSync(pngPath)) {
      if (y + LABEL_H_MM + 14 > 290) {
        combo.addPage();
        y = 16;
      }
      combo.setFontSize(11);
      combo.text(entry.title, 14, y);
      y += 5;
      combo.addImage(
        `data:image/png;base64,${fs.readFileSync(pngPath).toString('base64')}`,
        'PNG',
        14,
        y,
        LABEL_W_MM,
        LABEL_H_MM,
      );
      y += LABEL_H_MM + 10;
    }
  }
  fs.writeFileSync(path.join(outDir, 'ALL-zebra-labels.pdf'), Buffer.from(combo.output('arraybuffer')));

  const a4Specs = [
    {
      file: '01-kitwe-floor1-delivery',
      documentKind: 'delivery',
      deliveryNumber: 'WHD0000000042',
      printGroups: packetGroups,
    },
    {
      file: '02-sold-delivery',
      documentKind: 'sold_delivery',
      deliveryNumber: 'SLD0000000003',
      customerName: 'Mwansa Banda',
      customerPhone: '096 555 0101',
      printGroups: finishedGroups,
    },
    {
      file: '03-farm-delivery',
      documentKind: 'farm_delivery',
      deliveryNumber: 'FRM0000000001',
      printGroups: finishedGroups,
    },
    {
      file: '04-farm-return',
      documentKind: 'farm_return',
      deliveryNumber: 'WFLR0000000001',
      printGroups: finishedGroups,
    },
    {
      file: '05-repair-delivery',
      documentKind: 'repair_delivery',
      deliveryNumber: 'RO0000000001',
      customerName: 'Jane Customer',
      customerPhone: '097 123 4567',
      printGroups: [{ assembly_name: 'Arena Nightstand (repair)', units: 1, lines: [] }],
    },
    {
      file: '06-return-note',
      documentKind: 'return',
      deliveryNumber: 'WHR0000000001',
      printGroups: [{ assembly_name: 'Amara Coffee Table', units: 1, lines: [] }],
    },
    {
      file: '07-return-shipment',
      documentKind: 'return_shipment',
      deliveryNumber: 'WHR0000000002',
      printGroups: [{ assembly_name: 'Amara Coffee Table', units: 1, lines: [] }],
    },
    {
      file: '08-return-customer-delivery',
      documentKind: 'return_customer_delivery',
      deliveryNumber: 'RCD0000000001',
      customerName: 'Jane Customer',
      customerPhone: '097 123 4567',
      printGroups: [{ assembly_name: 'Arena Nightstand', units: 1, lines: [] }],
    },
    {
      file: '09-customer-order-delivery',
      documentKind: 'order_delivery',
      deliveryNumber: 'QT-2026-0144',
      customerName: 'Hassan Showroom customer',
      customerPhone: '095 200 3344',
      printGroups: packetGroups,
    },
    {
      file: '10-showroom-order-delivery',
      documentKind: 'showroom_delivery',
      deliveryNumber: 'SR-2026-0088',
      printGroups: packetGroups,
    },
  ];

  const setHierarchy = buildSetDeliveryPrintLines({
    setAssembly: { id: 'set-1', name: 'Living Room Package A' },
    setUnits: 2,
    recipeLocationId: 'floor2',
    setItems: [
      { set_assembly_id: 'set-1', component_assembly_id: 'prod-sofa', location_id: 'floor2', quantity: 1 },
      { set_assembly_id: 'set-1', component_assembly_id: 'prod-table', location_id: 'floor2', quantity: 1 },
    ],
    assemblies: [
      { id: 'prod-sofa', name: 'Amara 3 Seater', item_kind: 'product' },
      { id: 'prod-table', name: 'Amara Coffee Table', item_kind: 'product' },
    ],
    assemblyPackets: [
      { assembly_id: 'prod-sofa', packet_id: 'pkt-1', qty_per_unit: 1 },
      { assembly_id: 'prod-sofa', packet_id: 'pkt-1b', qty_per_unit: 1 },
      { assembly_id: 'prod-table', packet_id: 'pkt-2', qty_per_unit: 1 },
    ],
    packets: [
      { id: 'pkt-1', name: 'Amara 3 Seater Carton A', packet_number: 1, qty_per_unit: 1 },
      { id: 'pkt-1b', name: 'Amara 3 Seater Carton B', packet_number: 2, qty_per_unit: 1 },
      { id: 'pkt-2', name: 'Amara Coffee Table Carton', packet_number: 1, qty_per_unit: 1 },
    ],
  });
  a4Specs.push({
    file: '11-set-hierarchy-delivery',
    documentKind: 'delivery',
    deliveryNumber: 'WHD0000000107',
    printGroups: [{
      set_name: setHierarchy.set_name,
      assembly_name: setHierarchy.set_name,
      units: setHierarchy.units,
      lines: setHierarchy.lines,
    }],
  });

  const a4Files = [];
  for (const spec of a4Specs) {
    const html = buildDeliveryNotePrintHtml({
      deliveryNumber: spec.deliveryNumber,
      driverName: 'Amos Mumba',
      dispatchedBy: 'Ali Elboussi',
      driverSignatureSrc,
      companyLogoSrc: DELIVERY_NOTE_LOGO_DATA_URI,
      submittedAt: PRINTED_AT.toISOString(),
      printGroups: spec.printGroups,
      copies: 1,
      documentKind: spec.documentKind,
      customerName: spec.customerName || '',
      customerPhone: spec.customerPhone || '',
    });
    const htmlPath = path.join(a4Dir, `${spec.file}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    a4Files.push({ ...spec, htmlRel: `a4-delivery-notes/${spec.file}.html`, pdfRel: `a4-delivery-notes/${spec.file}.pdf` });
  }

  const chrome = findChrome();
  const pdfNotes = [];
  if (chrome) {
    for (const spec of a4Files) {
      const htmlPath = path.join(outDir, spec.htmlRel);
      const pdfPath = path.join(outDir, spec.pdfRel);
      try {
        htmlToPdf(chrome, htmlPath, pdfPath);
        pdfNotes.push(spec.file);
      } catch (err) {
        console.warn(`[a4 pdf] ${spec.file}:`, err.message || err);
      }
    }
    try {
      htmlToPdf(chrome, returnHtmlPath, path.join(zebraDir, '04-return-customer.pdf'));
    } catch (err) {
      console.warn('[zebra pdf] return-customer:', err.message || err);
    }
  } else {
    console.warn('Chrome/Edge not found — HTML/PNG written; PDFs skipped except raster label PDFs.');
  }

  const indexHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Print previews</title>
<style>
  body { font-family: Segoe UI, sans-serif; margin: 24px; background: #e8eef4; color: #0f172a; }
  h1 { margin: 0 0 8px; }
  h2 { margin-top: 32px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; }
  .card img { width: 100%; max-width: 320px; height: auto; border: 1px solid #e2e8f0; background: #fff; }
  iframe { width: 100%; height: 480px; border: 1px solid #cbd5e1; background: #fff; }
  a { color: #1e3a5f; }
</style></head>
<body>
  <h1>Zebra labels + A4 delivery notes</h1>
  <p>Folder: <code>docs/print-previews</code>. Labels are 80×68 mm. Notes are A4 from live HTML.</p>
  <p><a href="ALL-zebra-labels.pdf">ALL-zebra-labels.pdf</a> · <a href="README.md">README</a></p>
  <h2>Zebra</h2>
  <div class="grid">
    ${zebraEntries.map((e) => `
      <div class="card">
        <strong>${e.title}</strong>
        ${e.png ? `<p><img src="${e.png}" alt="${e.title}"/></p>` : ''}
        ${e.html ? `<p><iframe src="${e.html}"></iframe></p>` : ''}
      </div>`).join('')}
  </div>
  <h2>A4 delivery notes</h2>
  ${a4Files.map((s) => `
    <div class="card" style="margin-bottom:16px">
      <strong>${s.file}</strong> · kind <code>${s.documentKind}</code> · ${s.deliveryNumber}
      <p><a href="${s.htmlRel}">HTML</a>${pdfNotes.includes(s.file) ? ` · <a href="${s.pdfRel}">PDF</a>` : ''}</p>
      <iframe src="${s.htmlRel}"></iframe>
    </div>`).join('')}
</body></html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml, 'utf8');
  writeReadme();
  console.log(`Wrote ${outDir}`);
  console.log(`A4 PDFs: ${pdfNotes.length}/${a4Files.length}${chrome ? '' : ' (no Chrome/Edge)'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
