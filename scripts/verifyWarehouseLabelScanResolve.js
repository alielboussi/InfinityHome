const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const webPath = path.join(__dirname, '../src/utils/warehouseLabelScanResolve.js');

(async () => {
  const {
    resolveWarehouseLabelFromText,
    WAREHOUSE_LABEL_SCAN_MODE,
  } = await import(pathToFileURL(webPath).href);

  const packetLabel = `
    X112VSK2600P03LCBO-252307009503
    12VSK2600P03LCBO
    Vista Portmanto PK-3
    YY00103929941422VSK2600LCBO
    22VSK2600LCBO
    UNITE KODU 22VSK2600LCBO
  `;
  const packet = resolveWarehouseLabelFromText(
    packetLabel,
    WAREHOUSE_LABEL_SCAN_MODE.PACKET_CARTON,
  );
  assert.strictEqual(packet.sku, '12VSK2600P03LCBO');

  const family = resolveWarehouseLabelFromText(
    packetLabel,
    WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_BOM_FAMILY,
  );
  assert.strictEqual(family.sku, '22VSK2600LCBO');

  const lunaLabel = `
    23VSK62480220001
    VISTA LUNA
    YY00103869150023VSK62480220001
  `;
  const luna = resolveWarehouseLabelFromText(
    lunaLabel,
    WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO,
  );
  assert.strictEqual(luna.sku, '23VSK62480220001');

  const lenor = `
    LENOR ORTASEHPA
    3002780951000000
    BESTREST-Z-202507/3002780951
  `;
  const numeric = resolveWarehouseLabelFromText(
    lenor,
    WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO,
  );
  assert.strictEqual(numeric.sku, '3002780951000000');

  const lenorFull = `
    X2201LNOR2301000001-252305023389
    LENOR ORTASEHPA 1B
    X23A9LNOR2301000001-252305023389
    3002780951000060
    BESTREST-Z-202507/3002780951
  `;
  const lenorResolved = resolveWarehouseLabelFromText(
    lenorFull,
    WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO,
  );
  assert.strictEqual(lenorResolved.sku, '3002780951000060');

  const serraPacket = `
    12SRR2300P01DDFF
    X212SRR2300P01DDFF-252218013409
    Serra Kmdn Pk-1 Serra Gri/Serra Merme
    YY99999999999912SRR2300P01DDFF
    LOT NO 252218013409
  `;
  const serraPkt = resolveWarehouseLabelFromText(
    serraPacket,
    WAREHOUSE_LABEL_SCAN_MODE.PACKET_CARTON,
  );
  assert.strictEqual(serraPkt.sku, '12SRR2300P01DDFF');

  const serraAuto = resolveWarehouseLabelFromText(
    serraPacket,
    WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO,
  );
  assert.strictEqual(serraAuto.sku, '', 'carton labels are not finished numeric products');

  console.log('verifyWarehouseLabelScanResolve: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
