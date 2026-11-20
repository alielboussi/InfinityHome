/**
 * Write .easignore for every Expo app that ships with eas.json.
 * Usage: node mobile-apps/scripts/syncEasignore.js
 */
const fs = require('fs');
const path = require('path');
const { MOBILE_APP_SLUGS, renderMonorepoEasignore } = require('../shared/renderEasignoreContent');

const mobileRoot = path.join(__dirname, '..');

for (const slug of MOBILE_APP_SLUGS) {
  const appRoot = path.join(mobileRoot, slug);
  const easJson = path.join(appRoot, 'eas.json');
  if (!fs.existsSync(easJson)) {
    console.log(`[syncEasignore] skip ${slug} — no eas.json`);
    continue;
  }
  const target = path.join(appRoot, '.easignore');
  const next = renderMonorepoEasignore(slug);
  const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (prev === next) {
    console.log(`[syncEasignore] up to date ${slug}`);
    continue;
  }
  fs.writeFileSync(target, next, 'utf8');
  console.log(`[syncEasignore] wrote ${slug}/.easignore`);
}
console.log('[syncEasignore] ok');