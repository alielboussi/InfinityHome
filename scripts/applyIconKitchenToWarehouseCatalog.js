/**
 * Copies IconKitchen-Output into warehouse-catalog Expo assets.
 * Run: node scripts/applyIconKitchenToWarehouseCatalog.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { postprocessWarehouseCatalogIcons } = require('./warehouseCatalogIconFrame');

const root = path.resolve(__dirname, '..');
const ik = path.join(root, 'IconKitchen-Output');
const assets = path.join(root, 'mobile-apps/warehouse-catalog/assets');

async function main() {
  if (!fs.existsSync(path.join(ik, 'ios/AppIcon~ios-marketing.png'))) {
    throw new Error('Extract IconKitchen-Output.zip to repo root first.');
  }

  const marketing = path.join(ik, 'ios/AppIcon~ios-marketing.png');
  const fg = path.join(ik, 'android/res/mipmap-xxxhdpi/ic_launcher_foreground.png');
  const bg = path.join(ik, 'android/res/mipmap-xxxhdpi/ic_launcher_background.png');

  const rawIcon = path.join(assets, 'icon-source-raw.png');
  await sharp(marketing).png().toFile(rawIcon);

  const bgPx = await sharp(bg).resize(1, 1).raw().toBuffer();
  const backgroundColor =
    `#${[bgPx[0], bgPx[1], bgPx[2]].map((x) => x.toString(16).padStart(2, '0')).join('')}`;

  await postprocessWarehouseCatalogIcons({
    sourcePath: rawIcon,
    assetsDir: assets,
    backgroundHex: backgroundColor,
  });

  const appConfigPath = path.join(root, 'mobile-apps/warehouse-catalog/app.config.js');
  let appConfig = fs.readFileSync(appConfigPath, 'utf8');
  appConfig = appConfig.replace(
    /backgroundColor: '#[0-9a-fA-F]{3,8}'/g,
    `backgroundColor: '${backgroundColor}'`,
  );
  fs.writeFileSync(appConfigPath, appConfig);

  console.log('Wrote icon.png, adaptive-icon.png, previews');
  console.log('Adaptive / splash backgroundColor:', backgroundColor);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
