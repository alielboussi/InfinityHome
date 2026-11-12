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
const portalSrcRoot = path.join(repoRoot, 'src');
const repoSrcVendorRoot = path.join(sharedPath, 'repoSrc');
/** Tarball shared/ snapshot — EAS preview sets EAS_NO_VCS so git merge cannot run. */
const catalogSharedUploadSnapshot = path.join(catalogRoot, '.catalog-shared-upload-snapshot');

function repoSrcLooksVendored() {
  return (
    fs.existsSync(path.join(repoSrcVendorRoot, 'utils', 'warehouseSetMath.js'))
    && fs.existsSync(path.join(repoSrcVendorRoot, 'utils', 'isMattressCatalogProductName.js'))
  );
}

function rmDeep(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (err) {
  console.warn('[materializeSharedForEas] rm retry', targetPath, err?.message || err);
    fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

function keepUploadedMaterializedShared() {
  if (!fs.existsSync(sharedPath) || !repoSrcLooksVendored()) return false;
  const catalogFiles = listCatalogJsFiles();
  assertNoExternalSrcImports(catalogFiles);
  console.log('[materializeSharedForEas] keep uploaded shared/ (template shared unavailable on worker)');
  mergeCatalogSharedFromGit();
  vendorCatalogRepoSrc();
  return true;
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

function snapshotCatalogSharedFromUpload() {
  if (!fs.existsSync(sharedPath)) return;
  rmDeep(catalogSharedUploadSnapshot);
  fs.cpSync(sharedPath, catalogSharedUploadSnapshot, { recursive: true });
}

/** When git is unavailable on EAS (EAS_NO_VCS), overlay catalog-only modules from the uploaded tarball. */
function mergeCatalogSharedFromUploadSnapshot() {
  if (!fs.existsSync(catalogSharedUploadSnapshot)) return;
  let merged = 0;
  const stack = [catalogSharedUploadSnapshot];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const src = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'repoSrc') continue;
        stack.push(src);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(catalogSharedUploadSnapshot, src);
      const dest = path.join(sharedPath, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (!fs.existsSync(dest) || fs.readFileSync(dest).compare(fs.readFileSync(src)) !== 0) {
        fs.copyFileSync(src, dest);
        merged += 1;
      }
    }
  }
  if (merged) {
    console.log('[materializeSharedForEas] merged', merged, 'catalog shared file(s) from upload snapshot');
  }
}

const REPO_IMPORT_RE = /from\s+['"](?:\.\.\/)+src\/(utils|constants)\/([^'"]+)['"]/g;
const REPO_VENDORED_IMPORT_RE =
  /from\s+['"](?:\.\.\/|\.\/)?(?:shared\/)?repoSrc\/(utils|constants)\/([^'"]+)['"]/g;
const LEGACY_REPO_VENDOR_RE = /from\s+['"]\.\.\/_repoSrc\/(utils|constants)\/([^'"]+)['"]/g;
const RELATIVE_SRC_IMPORT_RE = /from\s+['"](\.\.?\/[^'"]+)['"]/g;

function resolveRepoSrcModule(baseFile, spec) {
  if (!spec.startsWith('.')) return null;
  let target = path.normalize(path.join(path.dirname(baseFile), spec));
  if (!target.endsWith('.js') && fs.existsSync(`${target}.js`)) target = `${target}.js`;
  const utilsRoot = path.join(repoRoot, 'src', 'utils');
  const constantsRoot = path.join(repoRoot, 'src', 'constants');
  if (
    (target.startsWith(utilsRoot) || target.startsWith(constantsRoot))
    && fs.existsSync(target)
  ) {
    return target;
  }
  return null;
}

function listCatalogJsFiles() {
  const out = [];
  const appJs = path.join(catalogRoot, 'App.js');
  if (fs.existsSync(appJs)) out.push(appJs);
  for (const sub of ['screens', 'shared']) {
    const dir = path.join(catalogRoot, sub);
    if (!fs.existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '_repoSrc' || entry.name === 'repoSrc' || entry.name === 'node_modules') continue;
          stack.push(full);
        } else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
          out.push(full);
        }
      }
    }
  }
  return out;
}

function rewritePortalSrcImports(filePath, text) {
  const norm = filePath.replace(/\\/g, '/');
  const inShared =
    norm.includes('/warehouse-catalog/shared/')
    && !norm.includes('/warehouse-catalog/shared/repoSrc/');
  const repl = inShared
    ? "from './repoSrc/$1/$2'"
    : "from '../shared/repoSrc/$1/$2'";
  let next = text.replace(REPO_IMPORT_RE, repl);
  next = next.replace(LEGACY_REPO_VENDOR_RE, repl);
  next = next.replace(REPO_VENDORED_IMPORT_RE, repl);
  return next;
}

/** EAS tarball is app-only — vendor ../../../src/* into shared/repoSrc (inside materialized shared/). */
function vendorCatalogRepoSrc() {
  if (!fs.existsSync(portalSrcRoot)) {
    if (repoSrcLooksVendored()) {
      console.log('[materializeSharedForEas] keep shared/repoSrc (portal src not in archive)');
      assertNoExternalSrcImports(listCatalogJsFiles());
      return;
    }
    console.error('[materializeSharedForEas] missing portal src and vendored shared/repoSrc');
    process.exit(1);
  }
  const repoSrc = portalSrcRoot;
  const vendorRoot = repoSrcVendorRoot;
  rmDeep(path.join(catalogRoot, '_repoSrc'));
  rmDeep(vendorRoot);

  const catalogFiles = listCatalogJsFiles().filter((p) => fs.existsSync(p));
  const queue = [];
  const copied = new Set();

  function enqueueRepoImport(subdir, rel) {
    let srcFile = path.join(repoSrc, subdir, rel);
    if (!srcFile.endsWith('.js')) srcFile = `${srcFile}.js`;
    if (fs.existsSync(srcFile)) queue.push(srcFile);
  }

  for (const filePath of catalogFiles) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const re of [REPO_IMPORT_RE, REPO_VENDORED_IMPORT_RE, LEGACY_REPO_VENDOR_RE]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(text))) {
        enqueueRepoImport(match[1], match[2]);
      }
    }
  }

  while (queue.length) {
    const srcFile = queue.shift();
    if (!fs.existsSync(srcFile) || copied.has(srcFile)) continue;
    copied.add(srcFile);
    const rel = path.relative(repoSrc, srcFile);
    const dest = path.join(vendorRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcFile, dest);

    const text = fs.readFileSync(srcFile, 'utf8');
    RELATIVE_SRC_IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = RELATIVE_SRC_IMPORT_RE.exec(text))) {
      const resolved = resolveRepoSrcModule(srcFile, match[1]);
      if (resolved) queue.push(resolved);
    }
  }

  const constantsSrc = path.join(repoSrc, 'constants');
  const constantsDest = path.join(vendorRoot, 'constants');
  if (fs.existsSync(constantsSrc)) {
    fs.cpSync(constantsSrc, constantsDest, { recursive: true, force: true });
    for (const name of fs.readdirSync(constantsSrc)) {
      if (name.endsWith('.js')) copied.add(path.join(constantsSrc, name));
    }
  }

  for (const filePath of catalogFiles) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    const next = rewritePortalSrcImports(filePath, text);
    if (next !== text) fs.writeFileSync(filePath, next, 'utf8');
  }

  fixVendoredRelativeImports(vendorRoot);

  assertNoExternalSrcImports(catalogFiles);

  if (copied.size) {
    console.log('[materializeSharedForEas] vendored', copied.size, 'repo src file(s) -> shared/repoSrc/');
  }
}

function assertNoExternalSrcImports(catalogFiles) {
  const stray = /from\s+['"](?:\.\.\/)+src\//;
  for (const filePath of catalogFiles) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    if (stray.test(text)) {
      console.error('[materializeSharedForEas] unresolved portal src import in', path.relative(catalogRoot, filePath));
      process.exit(1);
    }
  }
}

/** Metro on EAS (Linux) needs explicit .js on relative imports in vendored repo src. */
function fixVendoredRelativeImports(vendorRoot) {
  if (!fs.existsSync(vendorRoot)) return;
  const stack = [vendorRoot];
  const REL_IMPORT = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      let text = fs.readFileSync(full, 'utf8');
      const next = text.replace(REL_IMPORT, (fullMatch, spec) => {
        if (spec.endsWith('.js') || spec.endsWith('.json')) return fullMatch;
        const resolved = path.normalize(path.join(path.dirname(full), spec));
        if (fs.existsSync(resolved) || fs.existsSync(`${resolved}.js`)) {
          return `from '${spec}.js'`;
        }
        return fullMatch;
      });
      if (next !== text) fs.writeFileSync(full, next, 'utf8');
    }
  }
}

if (!fs.existsSync(portalSrcRoot) && repoSrcLooksVendored() && keepUploadedMaterializedShared()) {
  process.exit(0);
}

if (!fs.existsSync(sharedSource)) {
  if (keepUploadedMaterializedShared()) {
    process.exit(0);
  }
  console.error('[materializeSharedForEas] missing', sharedSource);
  process.exit(1);
}

snapshotCatalogSharedFromUpload();

rmDeep(sharedPath);

fs.cpSync(sharedSource, sharedPath, { recursive: true });
const overlayPath = path.join(catalogRoot, 'catalog-shared-overlay');
if (fs.existsSync(overlayPath)) {
  fs.cpSync(overlayPath, sharedPath, { recursive: true, force: true });
}
mergeCatalogSharedFromGit();
mergeCatalogSharedFromUploadSnapshot();
vendorCatalogRepoSrc();
console.log('[materializeSharedForEas] copied', sharedSource, '->', sharedPath);
