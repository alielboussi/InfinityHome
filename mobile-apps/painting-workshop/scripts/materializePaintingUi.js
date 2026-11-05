/**
 * Copy shared UI from warehouse-upholstery into painting-workshop (Painting-only app).
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const upholsteryRoot = path.resolve(appRoot, '..', 'warehouse-upholstery');

const COPY_DIRS = ['components', 'hooks'];
const COPY_FILES = ['babel.config.js', 'metro.config.js'];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === 'node_modules' || name.startsWith('.expo')) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}

function main() {
  if (!fs.existsSync(upholsteryRoot)) {
    console.warn('[materializePaintingUi] skip — upholstery template missing');
    return;
  }
  for (const dir of COPY_DIRS) {
    copyDir(path.join(upholsteryRoot, dir), path.join(appRoot, dir));
  }
  for (const file of COPY_FILES) {
    const src = path.join(upholsteryRoot, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(appRoot, file));
    }
  }
  console.log('[materializePaintingUi] ok');
}

main();
