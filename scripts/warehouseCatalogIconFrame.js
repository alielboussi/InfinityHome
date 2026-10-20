/**
 * Rounded corners + red edge border for Warehouse Catalog launcher icons.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SIZE = 1024;
const CORNER_RADIUS = 200;
const BORDER_WIDTH = 26;
const BORDER_COLOR = '#dc2626';
/** Scale artwork within the square (lower = more padding). */
const ICON_CONTENT_SCALE = 0.84;

async function sampleBackgroundHex(imagePath) {
  const px = await sharp(imagePath).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  return `#${[px[0], px[1], px[2]].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Zoom out launcher art on brand background before red frame (keeps icon-source-raw unchanged). */
async function scaleIconContentOnBackground(sourcePath, backgroundHex) {
  const inner = Math.round(SIZE * ICON_CONTENT_SCALE);
  const inset = Math.floor((SIZE - inner) / 2);
  const { r, g, b } = parseHex(backgroundHex);
  const resized = await sharp(sourcePath).resize(inner, inner).png().toBuffer();
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .composite([{ input: resized, left: inset, top: inset }])
    .png()
    .toBuffer();
}

function parseHex(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    alpha: 1,
  };
}

function outerRoundMaskSvg() {
  return Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="white"/>
    </svg>`,
  );
}

async function applyOuterClip(pngBuffer) {
  const mask = await sharp(outerRoundMaskSvg()).png().toBuffer();
  return sharp(pngBuffer)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function frameLauncherIcon(input) {
  const source = await sharp(input).resize(SIZE, SIZE).ensureAlpha().png().toBuffer();

  const rounded = await sharp(source)
    .composite([{ input: await sharp(outerRoundMaskSvg()).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const canvas = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();

  const half = BORDER_WIDTH / 2;
  const borderOverlay = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="${half}"
        y="${half}"
        width="${SIZE - BORDER_WIDTH}"
        height="${SIZE - BORDER_WIDTH}"
        rx="${CORNER_RADIUS - half}"
        ry="${CORNER_RADIUS - half}"
        fill="none"
        stroke="${BORDER_COLOR}"
        stroke-width="${BORDER_WIDTH}"
      />
    </svg>`,
  );

  const composed = await sharp(canvas)
    .composite([
      { input: rounded, top: 0, left: 0 },
      { input: await sharp(borderOverlay).png().toBuffer(), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  return applyOuterClip(composed);
}

async function writeFramedAssets(assetsDir, sourceIconPath, backgroundHex) {
  const scaled = await scaleIconContentOnBackground(sourceIconPath, backgroundHex);
  const framed = await frameLauncherIcon(scaled);
  const iconPath = path.join(assetsDir, 'icon.png');
  const adaptivePath = path.join(assetsDir, 'adaptive-icon.png');

  await sharp(framed).png().toFile(iconPath);
  await sharp(framed).png().toFile(adaptivePath);

  await sharp(framed).png().toFile(path.join(assetsDir, 'icon-preview-flat.png'));

  const squircleMask = Buffer.from(
    `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="40" width="944" height="944" rx="208" ry="208" fill="white"/>
    </svg>`,
  );
  await sharp(framed)
    .composite([{ input: await sharp(squircleMask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toFile(path.join(assetsDir, 'icon-preview-rounded.png'));

  const circleMask = Buffer.from(
    `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <circle cx="512" cy="512" r="480" fill="white"/>
    </svg>`,
  );
  await sharp(framed)
    .composite([{ input: await sharp(circleMask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toFile(path.join(assetsDir, 'icon-preview-android-circle.png'));

  return { iconPath, adaptivePath, backgroundHex };
}

async function postprocessWarehouseCatalogIcons({ sourcePath, assetsDir, backgroundHex } = {}) {
  const root = path.resolve(__dirname, '..');
  const assets = assetsDir || path.join(root, 'mobile-apps/warehouse-catalog/assets');
  const rawPath = path.join(assets, 'icon-source-raw.png');
  const source =
    sourcePath || (fs.existsSync(rawPath) ? rawPath : path.join(assets, 'icon.png'));
  if (!fs.existsSync(source)) {
    throw new Error(`Icon source not found: ${source}`);
  }
  const bg = backgroundHex || (await sampleBackgroundHex(source));
  return writeFramedAssets(assets, source, bg);
}

module.exports = {
  frameLauncherIcon,
  postprocessWarehouseCatalogIcons,
  scaleIconContentOnBackground,
  BORDER_COLOR,
  CORNER_RADIUS,
  BORDER_WIDTH,
  ICON_CONTENT_SCALE,
};

if (require.main === module) {
  postprocessWarehouseCatalogIcons()
    .then(({ iconPath, backgroundHex }) => {
      console.log('Framed:', iconPath);
      console.log('Background:', backgroundHex);
      console.log('Content scale:', ICON_CONTENT_SCALE);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
