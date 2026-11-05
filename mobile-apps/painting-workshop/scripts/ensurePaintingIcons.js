/**
 * Build rounded launcher icons from Painting.png (safe inset, no launcher mask clipping).
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(appRoot, 'Painting.png');
const assetsDir = path.join(appRoot, 'assets');
const frameScript = path.resolve(__dirname, '../../../scripts/warehouseProductionIconFrame.js');

/** Inset artwork so squircle / circle masks never clip edges. */
const MAIN_SCALE = 0.68;
const ADAPTIVE_SCALE = 0.62;
const BACKGROUND = '#4a148c';

async function main() {
  const iconPng = path.join(assetsDir, 'icon.png');
  const adaptivePng = path.join(assetsDir, 'adaptive-icon.png');
  if (fs.existsSync(iconPng) && fs.existsSync(adaptivePng) && !process.env.FORCE_PAINTING_ICONS) {
    console.log('[ensurePaintingIcons] skip — using committed assets/icon.png & adaptive-icon.png');
    return;
  }
  if (!fs.existsSync(sourcePath)) {
    console.error('[ensurePaintingIcons] missing source', sourcePath);
    process.exit(1);
  }
  if (!fs.existsSync(frameScript)) {
    if (fs.existsSync(iconPng) && fs.existsSync(adaptivePng)) {
      console.log('[ensurePaintingIcons] skip — using existing assets');
      return;
    }
    console.error('[ensurePaintingIcons] missing', frameScript);
    process.exit(1);
  }
  const { postprocessWarehouseProductionIcons } = require(frameScript);
  const result = await postprocessWarehouseProductionIcons({
    sourcePath,
    assetsDir,
    contentScale: MAIN_SCALE,
    adaptiveContentScale: ADAPTIVE_SCALE,
    backgroundHex: BACKGROUND,
  });
  console.log('[ensurePaintingIcons] ok', result);
}

main().catch((err) => {
  console.error('[ensurePaintingIcons]', err);
  process.exit(1);
});
