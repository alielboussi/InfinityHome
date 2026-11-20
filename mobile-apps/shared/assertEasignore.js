const fs = require('fs');
const path = require('path');
const { renderMonorepoEasignore } = require('./renderEasignoreContent');

function assertEasignore(appRoot, slug) {
  const target = path.join(path.resolve(appRoot), '.easignore');
  if (!fs.existsSync(target)) {
    throw new Error(`missing .easignore — run: node ../scripts/ensureEasignoreFor.js ${slug}`);
  }
  const body = fs.readFileSync(target, 'utf8');
  const canonical = renderMonorepoEasignore(slug);
  if (body !== canonical) {
    throw new Error(`.easignore out of date — run: node ../scripts/syncEasignore.js or ensureEasignoreFor.js ${slug}`);
  }
}

module.exports = { assertEasignore };