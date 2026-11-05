/**
 * Build rounded launcher icons from Driver.png (safe inset, no mask clipping).
 * In EAS cloud builds, repo-root scripts/ may not be uploaded — skip if assets already exist.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(appRoot, 'Driver.png');
const assetsDir = path.join(appRoot, 'assets');
const frameScript = path.resolve(__dirname, '../../../scripts/warehouseProductionIconFrame.js');

const MAIN_SCALE = 0.68;
const ADAPTIVE_SCALE = 0.62;

async function main() {
  const iconPng = path.join(assetsDir, 'icon.png');
  const adaptivePng = path.join(assetsDir, 'adaptive-icon.png');
  if (fs.existsSync(iconPng) && fs.existsSync(adaptivePng) && !process.env.FORCE_DELIVERY_ICONS) {
    console.log('[ensureDeliveryIcons] skip — using committed assets/icon.png & adaptive-icon.png');
    return;
  }
  if (!fs.existsSync(frameScript)) {
    if (fs.existsSync(iconPng) && fs.existsSync(adaptivePng)) {
      console.log('[ensureDeliveryIcons] skip — using existing assets/icon.png & adaptive-icon.png');
      return;
    }
    console.error('[ensureDeliveryIcons] missing', frameScript);
    process.exit(1);
  }
  let postprocessWarehouseProductionIcons;
  try {
    ({ postprocessWarehouseProductionIcons } = require(frameScript));
  } catch (err) {
    if (fs.existsSync(iconPng) && fs.existsSync(adaptivePng)) {
      console.log('[ensureDeliveryIcons] skip — icon frame unavailable, using committed assets:', err?.message || err);
      return;
    }
    throw err;
  }
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
