/**
 * Rounded launcher icons for Upholstery Production (safe padding, no crop).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SIZE = 1024;
const CORNER_RADIUS = 200;
/** Inset artwork so Android/iOS masks never clip edges. */
const ICON_CONTENT_SCALE = 0.78;

async function sampleBackgroundHex(imagePath) {
  const px = await sharp(imagePath).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  return `#${[px[0], px[1], px[2]].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
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

function roundMaskSvg() {
  return Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="white"/>
    </svg>`,
  );
}

async function applyRoundClip(pngBuffer) {
  const mask = await sharp(roundMaskSvg()).png().toBuffer();
  return sharp(pngBuffer)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function buildIconPng(sourcePath, backgroundHex) {
  const inner = Math.round(SIZE * ICON_CONTENT_SCALE);
  const inset = Math.floor((SIZE - inner) / 2);
  const { r, g, b } = parseHex(backgroundHex);

  const content = await sharp(sourcePath)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r, g, b, alpha: 1 },
    })
    .png()
    .toBuffer();

  const flat = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .composite([{ input: content, left: inset, top: inset }])
    .png()
    .toBuffer();

  return applyRoundClip(flat);
}

async function postprocessWarehouseProductionIcons({ sourcePath, assetsDir } = {}) {
  const root = path.resolve(__dirname, '..');
  const assets = assetsDir || path.join(root, 'mobile-apps/warehouse-production/assets');
  const defaultSource = path.join(root, 'Upholstery Production.png');
  const source = sourcePath || defaultSource;
  if (!fs.existsSync(source)) {
    throw new Error(`Icon source not found: ${source}`);
  }
  fs.mkdirSync(assets, { recursive: true });

  const rawCopy = path.join(assets, 'icon-source-raw.png');
  if (path.resolve(source) !== path.resolve(rawCopy)) {
    await sharp(source).png().toFile(rawCopy);
  }

  const backgroundHex = await sampleBackgroundHex(source);
  const framed = await buildIconPng(source, backgroundHex);

  const iconPath = path.join(assets, 'icon.png');
  const adaptivePath = path.join(assets, 'adaptive-icon.png');
  await sharp(framed).png().toFile(iconPath);
  await sharp(framed).png().toFile(adaptivePath);

  return { iconPath, adaptivePath, backgroundHex };
}

module.exports = { postprocessWarehouseProductionIcons, ICON_CONTENT_SCALE, CORNER_RADIUS };

if (require.main === module) {
  const sourceArg = process.argv[2];
  postprocessWarehouseProductionIcons({ sourcePath: sourceArg })
    .then(({ iconPath, backgroundHex }) => {
      console.log('Wrote:', iconPath);
      console.log('Background:', backgroundHex);
      console.log('Content scale:', ICON_CONTENT_SCALE);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
