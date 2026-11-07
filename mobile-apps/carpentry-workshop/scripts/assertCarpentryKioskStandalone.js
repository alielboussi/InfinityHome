const fs = require('fs');
const path = require('path');

const kiosk = path.join(__dirname, '..', 'productionKiosk');
if (!fs.existsSync(path.join(kiosk, '.standalone-materialized'))) {
  console.error('FAIL: Run npm run materialize');
  process.exit(1);
}
try {
  fs.readlinkSync(kiosk);
  console.error('FAIL: productionKiosk must not be a junction');
  process.exit(1);
} catch {
  /* not a junction */
}

const clashShim = path.join(kiosk, 'lib', 'productionNameClashUi.js');
if (fs.existsSync(clashShim)) {
  const text = fs.readFileSync(clashShim, 'utf8');
  if (/\.\.\/\.\.\/\.\.\/\.\.\/src\//.test(text)) {
    console.error('FAIL: productionNameClashUi.js still imports ../../../../src — run npm run materialize');
    process.exit(1);
  }
  if (!text.includes('_repoUtils/productionNameClashUi')) {
    console.error('FAIL: productionNameClashUi.js must re-export from ./_repoUtils — run npm run materialize');
    process.exit(1);
  }
  const vendored = path.join(kiosk, 'lib', '_repoUtils', 'productionNameClashUi.js');
  if (!fs.existsSync(vendored)) {
    console.error('FAIL: missing lib/_repoUtils/productionNameClashUi.js — run npm run materialize');
    process.exit(1);
  }
}

function scanForForbiddenRepoImports(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      const hit = scanForForbiddenRepoImports(p);
      if (hit) return hit;
    } else if (name.endsWith('.js')) {
      const body = fs.readFileSync(p, 'utf8');
      if (/\.\.\/\.\.\/\.\.\/\.\.\/src\//.test(body)) {
        return p;
      }
    }
  }
  return null;
}

const badImport = scanForForbiddenRepoImports(kiosk);
if (badImport) {
  console.error('FAIL: forbidden ../../../../src import in', badImport);
  console.error('Run: npm run materialize');
  process.exit(1);
}

console.log('[assertCarpentryKioskStandalone] ok');
