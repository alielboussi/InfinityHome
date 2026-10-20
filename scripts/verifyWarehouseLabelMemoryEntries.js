const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const modPath = path.join(__dirname, '../src/utils/warehouseLabelMemoryEntries.js');

(async () => {
  const {
    buildTurkishSyncPayloadFromLabelMemory,
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

  const payload = buildTurkishSyncPayloadFromLabelMemory(store);
  assert.strictEqual(payload.entries.length, 3);
  assert.strictEqual(payload.productCount, 2);
  assert.strictEqual(payload.packetCount, 1);
  assert.ok(payload.entries.some((e) => e.turkish_name === 'Pkt only'));

  console.log('verifyWarehouseLabelMemoryEntries: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
