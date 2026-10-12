const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

const webPath = path.join(__dirname, '../src/utils/warehouseScanResolver.js');
const mobilePath = path.join(__dirname, '../mobile-apps/shared/warehouseScanResolver.js');

function extractFnBody(src, name) {
  const re = new RegExp(`function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = src.match(re);
  return m ? m[1].trim() : null;
}

const webSrc = fs.readFileSync(webPath, 'utf8');
const mobileSrc = fs.readFileSync(mobilePath, 'utf8');

for (const fn of [
  'stripFactoryLotSuffix',
  'stripProductLotPrefix',
  'stripIstikbalXDigitScanPrefix',
]) {
  const a = extractFnBody(webSrc, fn);
  const b = extractFnBody(mobileSrc, fn);
  assert(a && b, `missing ${fn}`);
  assert.strictEqual(a.replace(/\r\n/g, '\n'), b.replace(/\r\n/g, '\n'), `${fn} out of sync between web and mobile-apps/shared`);
}

(async () => {
  const webMod = path.join(__dirname, '../src/utils/warehouseScanResolver.js');
  const mobileMod = path.join(__dirname, '../mobile-apps/shared/warehouseScanResolver.js');
  const {
    normalizeWarehousePacketScan,
    normalizeWarehouseProductSku,
    normalizeWarehouseCatalogSearchQuery,
  } = await import(pathToFileURL(webMod).href);
  const mobile = await import(pathToFileURL(mobileMod).href);

  const lot = '24281300451612AYS2300P020000';
  assert.strictEqual(
    normalizeWarehouseProductSku(lot),
    normalizeWarehouseProductSku(lot.slice(14)),
  );
  assert.strictEqual(
    normalizeWarehouseCatalogSearchQuery('X213TAI'),
    normalizeWarehousePacketScan('X213TAI'),
  );
  assert.strictEqual(
    normalizeWarehousePacketScan('X112VEM3300P01COCZ'),
    mobile.normalizeWarehousePacketScan('X112VEM3300P01COCZ'),
  );

  console.log('verifyWarehouseScanResolver: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
