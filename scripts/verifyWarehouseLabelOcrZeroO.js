const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const modPath = path.join(__dirname, '../src/utils/warehouseLabelOcrZeroO.js');
const fieldPath = path.join(__dirname, '../src/utils/warehouseLabelFieldOcr.js');

(async () => {
  const {
    disambiguateZeroAndLetterOInSku,
    normalizeSlashedZeroGlyphs,
  } = await import(pathToFileURL(modPath).href);
  const {
    extractWarehouseLabelFieldFromOcr,
    WAREHOUSE_LABEL_OCR_FIELD,
  } = await import(pathToFileURL(fieldPath).href);

  assert.strictEqual(
    disambiguateZeroAndLetterOInSku('12LOE255OP030POP'),
    '12LOE2550P030POP',
  );
  assert.strictEqual(
    disambiguateZeroAndLetterOInSku('12LOE2550P03OPOP'),
    '12LOE2550P030POP',
  );
  assert.strictEqual(
    disambiguateZeroAndLetterOInSku('22LOE255OOPDX'),
    '22LOE25500PDX',
  );
  assert.strictEqual(
    disambiguateZeroAndLetterOInSku('12L0E2550P030POP'),
    '12LOE2550P030POP',
  );

  assert.strictEqual(normalizeSlashedZeroGlyphs('12LOE255ØP030POP'), '12LOE2550P030POP');

  const ocrBlob = `
    12LOE255OP030POP
    22LOE255OOPDX
    LOREAKONSOL
    OPAK BEYAZ
  `;
  const pkt = extractWarehouseLabelFieldFromOcr(ocrBlob, WAREHOUSE_LABEL_OCR_FIELD.PACKET_SKU);
  assert.strictEqual(pkt.value, '12LOE2550P030POP');

  const prod = extractWarehouseLabelFieldFromOcr(ocrBlob, WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_SKU);
  assert.strictEqual(prod.value, '22LOE25500PDX');

  console.log('verifyWarehouseLabelOcrZeroO: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
