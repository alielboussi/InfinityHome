/**
 * Build rounded launcher icons from Driver.png (safe inset, no mask clipping).
 */
const path = require('path');
const { postprocessWarehouseProductionIcons } = require('../../../scripts/warehouseProductionIconFrame');

const appRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(appRoot, 'Driver.png');
const assetsDir = path.join(appRoot, 'assets');

/** Slightly smaller than production so wide artwork stays inside Android adaptive safe zone. */
const MAIN_SCALE = 0.68;
const ADAPTIVE_SCALE = 0.62;

async function main() {
  const result = await postprocessWarehouseProductionIcons({
    sourcePath,
    assetsDir,
    contentScale: MAIN_SCALE,
    adaptiveContentScale: ADAPTIVE_SCALE,
  });
  console.log('[ensureDeliveryIcons] ok', result);
}

main().catch((err) => {
  console.error('[ensureDeliveryIcons]', err);
  process.exit(1);
});
