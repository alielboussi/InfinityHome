/**
 * Renders Warehouse Catalog Expo icons from SVG (Android adaptive safe zone).
 * Run: node scripts/generateWarehouseCatalogIcon.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assetsDir = path.resolve(__dirname, '../mobile-apps/warehouse-catalog/assets');
const fullSvg = path.join(assetsDir, 'icon-full.svg');
const fgSvg = path.join(assetsDir, 'icon-adaptive-foreground.svg');

async function render() {
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const iconPng = path.join(assetsDir, 'icon.png');
  const adaptiveFg = path.join(assetsDir, 'adaptive-icon.png');
  const previewPng = path.join(assetsDir, 'icon-preview-flat.png');

  await sharp(fullSvg).resize(1024, 1024).png().toFile(iconPng);
  await sharp(fgSvg).resize(1024, 1024).png().toFile(adaptiveFg);

  const bg = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png().toBuffer();

  const fg = await sharp(adaptiveFg).resize(1024, 1024).toBuffer();
  await sharp(bg).composite([{ input: fg, top: 0, left: 0 }]).png().toFile(previewPng);

  const squircleMask = Buffer.from(
    `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="40" width="944" height="944" rx="208" ry="208" fill="white"/>
    </svg>`,
  );
  const roundedPreview = path.join(assetsDir, 'icon-preview-rounded.png');
  await sharp(iconPng)
    .composite([{ input: await sharp(squircleMask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toFile(roundedPreview);

  const circleMask = Buffer.from(
    `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <circle cx="512" cy="512" r="480" fill="white"/>
    </svg>`,
  );
  const circlePreview = path.join(assetsDir, 'icon-preview-android-circle.png');
  await sharp(iconPng)
    .composite([{ input: await sharp(circleMask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toFile(circlePreview);

  console.log('Wrote:', iconPng);
  console.log('Wrote:', adaptiveFg);
  console.log('Wrote:', previewPng);
  console.log('Wrote:', roundedPreview);
  console.log('Wrote:', circlePreview);
}

render().catch((err) => {
  console.error(err);
  process.exit(1);
});
