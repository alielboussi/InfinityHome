/**
 * Copy shared UI from warehouse-upholstery into painting-workshop (Painting-only app).
 * Metro/babel stay app-owned in git — do not overwrite on postinstall (Windows file locks + app-specific).
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const upholsteryRoot = path.resolve(appRoot, '..', 'warehouse-upholstery');

const COPY_DIRS = ['components', 'hooks'];

function copyFile(src, dest) {
  const buf = fs.readFileSync(src);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.writeFileSync(dest, buf);
  } catch {
    try {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
    } catch {
      /* ignore */
    }
    fs.writeFileSync(dest, buf);
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === 'node_modules' || name.startsWith('.expo')) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else copyFile(s, d);
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
  console.log('[materializePaintingUi] ok');
}

main();