const fs = require('fs');
const path = require('path');

const assetsPath = path.resolve(__dirname, '../node_modules/metro/src/Assets.js');

if (!fs.existsSync(assetsPath)) {
  console.log('[patch-metro-image-size] metro Assets.js not found; skipping.');
  process.exit(0);
}

const source = fs.readFileSync(assetsPath, 'utf8');
const needle = `  const isImageInput = assetInfo.files[0].includes(".zip/")
    ? _fs.default.readFileSync(assetInfo.files[0])
    : assetInfo.files[0];`;

const replacement = `  const isImageInput = _fs.default.readFileSync(assetInfo.files[0]);`;

if (source.includes(replacement)) {
  console.log('[patch-metro-image-size] already patched.');
  process.exit(0);
}

if (!source.includes(needle)) {
  console.warn('[patch-metro-image-size] unexpected Assets.js shape; skipping.');
  process.exit(0);
}

fs.writeFileSync(assetsPath, source.replace(needle, replacement), 'utf8');
console.log('[patch-metro-image-size] patched metro asset image-size input.');
