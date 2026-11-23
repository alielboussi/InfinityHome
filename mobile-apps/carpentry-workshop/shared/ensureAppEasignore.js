const fs = require('fs');
const path = require('path');
const { renderMonorepoEasignore } = require('./renderEasignoreContent');

/** Refresh this app's .easignore before EAS upload (monorepo slim archive). */
function ensureAppEasignore(appRoot, slug) {
  const root = path.resolve(appRoot);
  const target = path.join(root, '.easignore');
  const next = renderMonorepoEasignore(slug);
  const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (prev !== next) {
    fs.writeFileSync(target, next, 'utf8');
    console.log(`[ensureAppEasignore] updated ${slug}/.easignore`);
  }
}

module.exports = { ensureAppEasignore };