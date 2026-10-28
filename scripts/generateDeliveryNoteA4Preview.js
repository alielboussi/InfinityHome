/**
 * Regenerate docs/preview/delivery-note-a4-template*.html from buildDeliveryNotePrintHtml.js
 * Run: node scripts/generateDeliveryNoteA4Preview.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildDeliveryNotePrintHtml } = await import('../src/utils/buildDeliveryNotePrintHtml.js');

function loadLogoDataUri() {
  const logoPath = path.join(root, 'public', 'bestrest-logo.jpg');
  if (!fs.existsSync(logoPath)) {
    console.warn('Missing public/bestrest-logo.jpg — preview without logo');
    return '';
  }
  const b64 = fs.readFileSync(logoPath).toString('base64');
  return `data:image/jpeg;base64,${b64}`;
}

const sampleSignatureSvg = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="70" viewBox="0 0 240 70">'
  + '<path d="M8 52 C35 8 55 58 85 28 S130 48 165 22 S210 40 232 30" stroke="#111" fill="none" stroke-width="2.2" stroke-linecap="round"/>'
  + '</svg>',
);
const driverSignatureSrc = `data:image/svg+xml,${sampleSignatureSvg}`;

const companyLogoSrc = loadLogoDataUri();
const submittedAt = '2026-10-28T09:21:00.000Z'; // 11:21 Kitwe (Africa/Lusaka)

const singlePageGroups = [
  {
    assembly_name: 'Arena Nightstand',
    units: 1,
    lines: [
      { name: 'Arena Sol Kmdn Pk-1 / Prsln Byz', packet_number: 1, qty: 1 },
      { name: 'Arena Sol/Sag Kmdn/Sifonyer Pk-2 / Ayak . Pk', packet_number: 2, qty: 1 },
    ],
  },
];

const multiPageGroups = [
  ...singlePageGroups,
  {
    assembly_name: 'C-Shape Wardrobe (Melamine Board)',
    units: 2,
    lines: Array.from({ length: 14 }, (_, i) => ({
      name: `Packet line ${i + 1} sample description`,
      packet_number: i + 1,
      qty: 2,
    })),
  },
];

function wrapForScreenPreview(innerHtml) {
  return innerHtml.replace(
    '<body>',
    '<body style="background:#888;padding:16px 0;">',
  );
}

const previewDir = path.join(root, 'docs', 'preview');
fs.mkdirSync(previewDir, { recursive: true });

const singleHtml = buildDeliveryNotePrintHtml({
  deliveryNumber: 'WHD0000000011',
  driverName: 'Amos Mumba',
  dispatchedBy: 'Ali Elboussi',
  driverSignatureSrc,
  companyLogoSrc,
  submittedAt,
  printGroups: singlePageGroups,
  copies: 1,
});

const multiHtml = buildDeliveryNotePrintHtml({
  deliveryNumber: 'WHD0000000099',
  driverName: 'Amos Mumba',
  dispatchedBy: 'Ali Elboussi',
  driverSignatureSrc,
  companyLogoSrc,
  submittedAt,
  printGroups: multiPageGroups,
  copies: 1,
});

fs.writeFileSync(path.join(previewDir, 'delivery-note-a4-template.html'), wrapForScreenPreview(singleHtml), 'utf8');
fs.writeFileSync(path.join(previewDir, 'delivery-note-a4-template-multipage.html'), wrapForScreenPreview(multiHtml), 'utf8');

console.log('Wrote docs/preview/delivery-note-a4-template.html');
console.log('Wrote docs/preview/delivery-note-a4-template-multipage.html');
