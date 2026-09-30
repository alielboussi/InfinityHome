import { extractSkuCandidatesFromLabelText } from '../src/utils/warehouseLabelOcrSku.js';

const sample = `
Unit Code 12AYS3150P01ZIZI
22AYS3150ZIZI
LOT NO 252228006794
H/B 2050 W/E 1050
`;

const found = extractSkuCandidatesFromLabelText(sample);
if (!found.includes('22AYS3150ZIZI')) {
  console.error('Expected finished SKU 22AYS3150ZIZI in', found);
  process.exit(1);
}
console.log('warehouseLabelOcrSku OK:', found.join(', '));
