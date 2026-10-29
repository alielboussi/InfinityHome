/**
 * Embed public/bestrest-logo.jpg as a data URI for reliable expo-print / offline HTML.
 * Run: node scripts/embedDeliveryNoteLogo.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const logoPath = path.join(root, 'public', 'bestrest-logo.jpg');
if (!fs.existsSync(logoPath)) {
  console.error('Missing public/bestrest-logo.jpg');
  process.exit(1);
}
const b64 = fs.readFileSync(logoPath).toString('base64');
const dataUri = `data:image/jpeg;base64,${b64}`;
const contents = `/** Auto-generated from public/bestrest-logo.jpg — run: node scripts/embedDeliveryNoteLogo.js */
export const DELIVERY_NOTE_LOGO_DATA_URI = ${JSON.stringify(dataUri)};
`;

const targets = [
  path.join(root, 'mobile-apps/warehouse-production/lib/deliveryNoteCompanyLogoEmbedded.js'),
  path.join(root, 'src/utils/deliveryNoteCompanyLogoEmbedded.js'),
];
for (const file of targets) {
  fs.writeFileSync(file, contents);
  console.log('Wrote', path.relative(root, file));
}
