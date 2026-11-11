const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(appRoot, 'assets');
const carpentryAssets = path.resolve(appRoot, '..', 'carpentry-workshop', 'assets');

function copyIfMissing(name) {
  const dest = path.join(assetsDir, name);
  if (fs.existsSync(dest)) return;
  const src = path.join(carpentryAssets, name);
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.copyFileSync(src, dest);
}

copyIfMissing('icon.png');
copyIfMissing('adaptive-icon.png');
console.log('[ensureOrdersIcons] ok');
