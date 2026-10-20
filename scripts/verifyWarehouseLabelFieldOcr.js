const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const modPath = path.join(__dirname, '../src/utils/warehouseLabelFieldOcr.js');

(async () => {
  const {
    extractWarehouseLabelFieldFromOcr,
    WAREHOUSE_LABEL_OCR_FIELD,
  } = await import(pathToFileURL(modPath).href);

  const serraPacketOcr = `
    12SRR2300P01DDFF
    Serra Kmdn Pk-1 Serra Gri/Serra Merme
    PRODUCT NAME
    SERRA GRI / SERRA MERMER
    YY99999999999912SRR2300P01DDFF
    X212SRR2300P01DDFF-252218013409
  `;

  const pktSku = extractWarehouseLabelFieldFromOcr(
    serraPacketOcr,
    WAREHOUSE_LABEL_OCR_FIELD.PACKET_SKU,
  );
  assert.strictEqual(pktSku.value, '12SRR2300P01DDFF');

  const pktName = extractWarehouseLabelFieldFromOcr(
    serraPacketOcr,
    WAREHOUSE_LABEL_OCR_FIELD.PACKET_NAME,
  );
  assert.ok(
    /SERRA GRI/i.test(pktName.value),
    `packet name expected English product name, got ${pktName.value}`,
  );

  const serraProductOcr = `
    UNITE KODU / UNIT CODE
    12SRR2300DDFF
    Serra Kmdn Pk-1 Serra Gri/Serra Merme
    12SRR2300P01DDFF
    YY9999999999999912SRR2300DDFF
    YY999912SRR2300DDFF
  `;

  const prodSku = extractWarehouseLabelFieldFromOcr(
    serraProductOcr,
    WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_SKU,
  );
  assert.strictEqual(
    prodSku.value,
    '12SRR2300DDFF',
    'prefer Unite Kodu family SKU over packet P01 and YY lot lines',
  );

  const prodTr = extractWarehouseLabelFieldFromOcr(
    `Serra Kmdn Pk-1 Serra Gri/Serra Merme\n12SRR2300P01DDFF`,
    WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_TURKISH,
  );
  assert.ok(
    /Serra/i.test(prodTr.value),
    `turkish title from label, got ${prodTr.value}`,
  );

  const lenorSku = extractWarehouseLabelFieldFromOcr(
    `LENOR ORTASEHPA 1B\n3002780951000060`,
    WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_SKU,
  );
  assert.strictEqual(lenorSku.value, '3002780951000060');

  const lenorPktSku = extractWarehouseLabelFieldFromOcr(
    `LENOR ORTASEHPA 1B\n3002780951000060`,
    WAREHOUSE_LABEL_OCR_FIELD.PACKET_SKU,
  );
  assert.strictEqual(lenorPktSku.value, '3002780951000060');

  const prizmaOcr = `
    PRIZMA SANDALYE
    2LI TURKUAZ
    TU20APRZMV600000002
  `;
  const prizmaProd = extractWarehouseLabelFieldFromOcr(
    prizmaOcr,
    WAREHOUSE_LABEL_OCR_FIELD.PRODUCT_SKU,
  );
  assert.strictEqual(prizmaProd.value, 'TU20APRZMV600000002');
  const prizmaPkt = extractWarehouseLabelFieldFromOcr(
    prizmaOcr,
    WAREHOUSE_LABEL_OCR_FIELD.PACKET_SKU,
  );
  assert.strictEqual(prizmaPkt.value, 'TU20APRZMV600000002');
  const prizmaName = extractWarehouseLabelFieldFromOcr(
    prizmaOcr,
    WAREHOUSE_LABEL_OCR_FIELD.PACKET_NAME,
  );
  assert.ok(/prizma/i.test(prizmaName.value) && /2li/i.test(prizmaName.value));

  console.log('verifyWarehouseLabelFieldOcr: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
