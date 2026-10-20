const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const modPath = path.join(__dirname, '../src/utils/warehouseLabelMemoryEntries.js');

(async () => {
  const {
    extractProductTurkishEntriesFromLabelMemory,
    parseLabelMemoryStore,
  } = await import(pathToFileURL(modPath).href);

  const store = parseLabelMemoryStore(JSON.stringify({
    bySku: {
      '22ays3150zizi': { productTurkishName: 'Test Ürün' },
      tu20aprzmv600000002: { productTurkishName: 'Prizma' },
      empty: { packetName: 'Pkt only' },
    },
  }));
  const entries = extractProductTurkishEntriesFromLabelMemory(store);
  assert.strictEqual(entries.length, 2);
  assert.ok(entries.some((e) => e.turkish_name === 'Test Ürün'));

  console.log('verifyWarehouseLabelMemoryEntries: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
