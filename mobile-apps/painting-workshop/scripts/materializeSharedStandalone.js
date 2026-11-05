/**
 * Real copy of mobile-apps/shared into painting-workshop/shared.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const appShared = path.join(appRoot, 'shared');
const templateRoot = path.resolve(appRoot, '..', 'shared');

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dest);
    else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

function main() {
  if (!fs.existsSync(templateRoot)) {
    console.warn('[materializeSharedStandalone] skip — template missing');
    return;
  }
  if (fs.existsSync(appShared)) {
    fs.rmSync(appShared, { recursive: true, force: true });
  }
  fs.mkdirSync(appShared, { recursive: true });
  copyDir(templateRoot, appShared);
  fs.writeFileSync(path.join(appShared, '.standalone-shared'), 'painting-workshop\n');
  console.log('[materializeSharedStandalone] ok');
}

main();
