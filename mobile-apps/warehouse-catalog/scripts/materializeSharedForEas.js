/**
 * EAS CLI on Windows cannot pack directory junctions. Replace shared/ with a real copy before upload.
 * Local npm install can recreate the junction via ensureSharedLink.js.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const catalogRoot = path.resolve(__dirname, '..');
const sharedPath = path.join(catalogRoot, 'shared');
const sharedSource = path.resolve(catalogRoot, '..', 'shared');
const repoRoot = path.resolve(catalogRoot, '../..');

if (!fs.existsSync(sharedSource)) {
  console.error('[materializeSharedForEas] missing', sharedSource);
  process.exit(1);
}

/** Catalog-only / catalog-pinned modules live in git under warehouse-catalog/shared (not in mobile-apps/shared). */
function mergeCatalogSharedFromGit() {
  let tracked = [];
  try {
    tracked = execSync('git ls-files mobile-apps/warehouse-catalog/shared/', {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (err) {
    console.warn('[materializeSharedForEas] git ls-files skipped:', err?.message || err);
    return;
  }
  let copied = 0;
  for (const rel of tracked) {
    const suffix = rel.replace(/^mobile-apps\/warehouse-catalog\/shared\/?/, '');
    if (!suffix) continue;
    const src = path.join(repoRoot, rel);
    const dest = path.join(sharedPath, suffix);
    const baseFile = path.join(sharedSource, suffix);
    if (fs.existsSync(baseFile)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      copied += 1;
      continue;
    }
    try {
      const gitRel = rel.replace(/\\/g, '/');
      const data = execSync(`git show HEAD:${gitRel}`, {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      });
      fs.writeFileSync(dest, data, 'utf8');
      copied += 1;
    } catch {
      /* skip missing blob */
    }
  }
  if (copied) {
    console.log('[materializeSharedForEas] merged', copied, 'catalog shared file(s) from git');
  }
}

function fixSharedRepoImportsForCatalogCopy(dir) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      const next = text.replace(/from ['"](\.\.\/){2}src\//g, "from '../../../src/");
      if (next !== text) fs.writeFileSync(full, next, 'utf8');
    }
  }
}

if (fs.existsSync(sharedPath)) {
  fs.rmSync(sharedPath, { recursive: true, force: true });
}

fs.cpSync(sharedSource, sharedPath, { recursive: true });
const overlayPath = path.join(catalogRoot, 'catalog-shared-overlay');
if (fs.existsSync(overlayPath)) {
  fs.cpSync(overlayPath, sharedPath, { recursive: true, force: true });
}
mergeCatalogSharedFromGit();
fixSharedRepoImportsForCatalogCopy(sharedPath);
console.log('[materializeSharedForEas] copied', sharedSource, '->', sharedPath);
