/**
 * Example A4: partial customer delivery (3 of 8) + type labels.
 * Run: node scripts/generatePartialDeliveryNotePreview.js
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'previews');

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || '';
}

function htmlToPdf(chrome, htmlPath, pdfPath) {
  const fileUrl = pathToFileURL(htmlPath).href;
  const result = spawnSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    '--print-to-pdf-no-header',
    fileUrl,
  ], { encoding: 'utf8', timeout: 45000 });
  if (result.status !== 0 || !fs.existsSync(pdfPath)) {
    throw new Error(result.stderr || result.stdout || `pdf failed ${result.status}`);
  }
}

const { buildDeliveryNotePrintHtml } = await import('../src/utils/buildDeliveryNotePrintHtml.js');
const { DELIVERY_NOTE_LOGO_DATA_URI } = await import('../src/utils/deliveryNoteCompanyLogoEmbedded.js');

const sampleSignatureSvg = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="70" viewBox="0 0 240 70">'
  + '<path d="M8 52 C35 8 55 58 85 28 S130 48 165 22 S210 40 232 30" stroke="#111" fill="none" stroke-width="2.2" stroke-linecap="round"/>'
  + '</svg>',
);

const printGroups = [{
  assembly_name: 'Basyouni 3 Seater (partial 3 of 8)',
  units: 3,
  lines: [
    { name: 'Fabric: charcoal', kind: 'field', qty: '' },
    { name: 'Ordered 8 · this send 3', kind: 'field', qty: '' },
  ],
}];

fs.mkdirSync(outDir, { recursive: true });

const html = buildDeliveryNotePrintHtml({
  deliveryNumber: 'QT-2026-BASYOUNI',
  driverName: 'Amos Mumba',
  driverPhone: '097 000 1122',
  dispatchedBy: 'Ali Elboussi',
  driverSignatureSrc: `data:image/svg+xml,${sampleSignatureSvg}`,
  companyLogoSrc: DELIVERY_NOTE_LOGO_DATA_URI,
  submittedAt: '2026-11-23T10:15:00.000Z',
  printGroups,
  copies: 1,
  documentKind: 'order_delivery',
  customerName: 'Basyouni',
  customerPhone: '096 123 4567',
  partialDelivery: true,
});

const htmlPath = path.join(outDir, 'partial-customer-delivery-note.html');
const pdfPath = path.join(outDir, 'partial-customer-delivery-note.pdf');
fs.writeFileSync(htmlPath, html, 'utf8');

const chrome = findChrome();
if (!chrome) {
  console.error('Chrome/Edge not found');
  process.exit(1);
}
htmlToPdf(chrome, htmlPath, pdfPath);
console.log(pdfPath);
