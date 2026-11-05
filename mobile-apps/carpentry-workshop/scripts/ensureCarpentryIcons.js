/**
 * Build rounded launcher icons from carpentry.png (safe inset, no mask clipping).
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(appRoot, 'carpentry.png');
const assetsDir = path.join(appRoot, 'assets');
const frameScript = path.resolve(__dirname, '../../../scripts/warehouseProductionIconFrame.js');

/** Slightly inset so squircle masks never clip saw teeth or wood corners. */
const MAIN_SCALE = 0.68;
const ADAPTIVE_SCALE = 0.62;

async function main() {
  const iconPng = path.join(assetsDir, 'icon.png');
  const adaptivePng = path.join(assetsDir, 'adaptive-icon.png');
  if (fs.existsSync(iconPng) && fs.existsSync(adaptivePng) && !process.env.FORCE_CARPENTRY_ICONS) {
    console.log('[ensureCarpentryIcons] skip — using committed assets/icon.png & adaptive-icon.png');
    return;
  }
  if (!fs.existsSync(sourcePath)) {
    console.error('[ensureCarpentryIcons] missing source', sourcePath);
    process.exit(1);
  }
  if (!fs.existsSync(frameScript)) {
    if (fs.existsSync(iconPng) && fs.existsSync(adaptivePng)) {
      console.log('[ensureCarpentryIcons] skip — using existing assets');
      return;
    }
    console.error('[ensureCarpentryIcons] missing', frameScript);
    process.exit(1);
  }
  const { postprocessWarehouseProductionIcons } = require(frameScript);
  const result = await postprocessWarehouseProductionIcons({
    sourcePath,
    assetsDir,
    contentScale: MAIN_SCALE,
    adaptiveContentScale: ADAPTIVE_SCALE,
    backgroundHex: '#0d47a1',
  });
  console.log('[ensureCarpentryIcons] ok', result);
}

main().catch((err) => {
  console.error('[ensureCarpentryIcons]', err);
  process.exit(1);
});
