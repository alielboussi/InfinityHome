/**
 * Copy carpentry kiosk chrome (theme layout) into the Orders app.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const carpentryRoot = path.resolve(appRoot, '..', 'carpentry-workshop');

const FILES = [
  ['components/kioskStyles.js', 'components/kioskStyles.js'],
  ['components/ProductionKioskTopBar.js', 'components/ProductionKioskTopBar.js'],
  ['components/ProductionAppAuthGate.js', 'components/ProductionAppAuthGate.js'],
  ['lib/kioskLayout.js', 'lib/kioskLayout.js'],
  ['lib/productionDashLayout.js', 'lib/productionDashLayout.js'],
  ['lib/ProductionPressableHint.js', 'lib/ProductionPressableHint.js'],
  ['hooks/useProductionKioskLocale.js', 'hooks/useProductionKioskLocale.js'],
  ['babel.config.js', 'babel.config.js'],
  ['metro.config.js', 'metro.config.js'],
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  if (!fs.existsSync(carpentryRoot)) {
    console.warn('[materializeOrdersUi] skip — carpentry template missing');
    return;
  }
  for (const [relSrc, relDest] of FILES) {
    const src = path.join(carpentryRoot, relSrc);
    if (!fs.existsSync(src)) continue;
    copyFile(src, path.join(appRoot, relDest));
  }
  const metroPath = path.join(appRoot, 'metro.config.js');
  if (fs.existsSync(metroPath)) {
    const body = fs.readFileSync(metroPath, 'utf8')
      .replace(/carpentry-workshop/g, 'orders');
    fs.writeFileSync(metroPath, body);
  }
  console.log('[materializeOrdersUi] ok');
}

main();
