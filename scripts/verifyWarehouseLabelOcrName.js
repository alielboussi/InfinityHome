const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const modPath = path.join(__dirname, '../src/utils/warehouseLabelOcrName.js');

(async () => {
  const { extractSuggestedNameFromLabelText } = await import(pathToFileURL(modPath).href);

  const packetLabel = `
X112VSK2600P03LCBO-252307009503
12VSK2600P03LCBO
Vista Portmanto PK-3 Lofty Ceviz /Misty
VISTAPORTMANTO
LOFTY CEVIZ / MISTY ANTRASIT
`;
  assert.strictEqual(
    extractSuggestedNameFromLabelText(packetLabel, { intent: 'packet' }),
    'Vista Portmanto PK-3 Lofty Ceviz /Misty',
  );

  const pckName = 'PCK.NAME : VISTA P12 LUNA GRI DUZ VENA 145-C155736/';
  assert.ok(
    extractSuggestedNameFromLabelText(pckName, { intent: 'packet' }).includes('VISTA P12'),
  );

  const unitLabel = `
22VSK2600LCBO
VISTAPORTMANTO
LOFTY CEVIZ / MISTY ANTRASIT
HOHER NUSSBAUM / NEBELIGES ANTHRAZIT
`;
  const tr = extractSuggestedNameFromLabelText(unitLabel, { intent: 'product_turkish' });
  assert.ok(tr.includes('CEVIZ') || tr.includes('VISTAPORTMANTO'));

  const lenor = `
    LENOR ORTASEHPA 1B
    BESTREST-Z-202507/3002780951
    3002780951000060
  `;
  assert.strictEqual(
    extractSuggestedNameFromLabelText(lenor, { intent: 'product_turkish' }),
    'LENOR ORTASEHPA 1B',
  );

  const prizma = `
    PRIZMA SANDALYE
    2LI TURKUAZ
    TU20APRZMV600000002
  `;
  assert.strictEqual(
    extractSuggestedNameFromLabelText(prizma, { intent: 'packet' }),
    'Prizma Sandalye 2LI Turkuaz',
  );

  console.log('verifyWarehouseLabelOcrName: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
