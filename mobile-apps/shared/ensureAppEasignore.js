const fs = require('fs');
const path = require('path');
const { renderMonorepoEasignore } = require('./renderEasignoreContent');

function findGitRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function writeIfChanged(target, next, logLabel) {
  const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (prev === next) return;
  fs.writeFileSync(target, next, 'utf8');
  console.log(`[ensureAppEasignore] updated ${logLabel}`);
}

/** Refresh this app's .easignore before EAS upload (monorepo slim archive). */
function ensureAppEasignore(appRoot, slug) {
  const root = path.resolve(appRoot);
  const next = renderMonorepoEasignore(slug);
  writeIfChanged(path.join(root, '.easignore'), next, `${slug}/.easignore`);
  // eas-cli packs from the git root and only reads .easignore there — not the app folder.
  const gitRoot = findGitRoot(root);
  if (gitRoot) {
    writeIfChanged(path.join(gitRoot, '.easignore'), next, 'repo-root .easignore (EAS upload)');
  }
}

module.exports = { ensureAppEasignore };