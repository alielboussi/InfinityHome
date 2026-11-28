/**
 * Copy the src/utils (+ constants) graph Delivery Metro needs into src-utils/,
 * then rewrite ../../../../src/... imports. EAS uploads exclude /src/.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const destDir = path.join(appRoot, 'src-utils');
const srcUtils = path.join(repoRoot, 'src', 'utils');

const ENTRY_FILES = [
  'warehouseSetDeliveryRecipe.js',
  'warehouseSetMath.js',
  'isMattressCatalogProductName.js',
  'warehouseDeliverySetPrint.js',
  'warehouseDeliveryPrintGroups.js',
  'buildDeliveryNotePrintHtml.js',
];

const SKIP_BASENAMES = new Set([
  'warehouseDeliveryNotePrint.js',
]);

const RELATIVE_FROM = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;

function resolveJs(fromFile, spec) {
  if (!spec || spec.startsWith('@') || !spec.startsWith('.')) return null;
  const raw = path.normalize(path.join(path.dirname(fromFile), spec));
  const candidates = [
    raw,
    `${raw}.js`,
    path.join(raw, 'index.js'),
  ];
  return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}

function collectGraph(entryAbs) {
  const seen = new Set();
  const queue = [entryAbs];
  while (queue.length) {
    const file = queue.shift();
    const key = path.normalize(file);
    if (seen.has(key)) continue;
    if (!fs.existsSync(file)) continue;
    if (SKIP_BASENAMES.has(path.basename(file))) continue;
    seen.add(key);
    const text = fs.readFileSync(file, 'utf8');
    let m;
    const re = new RegExp(RELATIVE_FROM.source, 'g');
    while ((m = re.exec(text))) {
      const resolved = resolveJs(file, m[1]);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

function destName(absPath) {
  return path.basename(absPath);
}

function rewriteInternalImports(text, fromAbs, destBySrc) {
  return text.replace(RELATIVE_FROM, (full, spec) => {
    const resolved = resolveJs(fromAbs, spec);
    if (!resolved) return full;
    const destFile = destBySrc.get(path.normalize(resolved));
    if (!destFile) return full;
    return full.replace(spec, `./${path.basename(destFile)}`);
  });
}

function vendorFromRepo() {
  if (!fs.existsSync(srcUtils)) return false;
  const destBySrc = new Map();
  const files = [];
  for (const name of ENTRY_FILES) {
    const abs = path.join(srcUtils, name);
    if (!fs.existsSync(abs)) {
      console.warn('[vendorDeliverySrcUtils] missing entry', abs);
      continue;
    }
    for (const file of collectGraph(abs)) files.push(file);
  }
  const unique = [...new Set(files)];
  fs.mkdirSync(destDir, { recursive: true });
  for (const abs of unique) {
    destBySrc.set(path.normalize(abs), path.join(destDir, destName(abs)));
  }
  const used = new Map();
  for (const [src, dest] of destBySrc) {
    const base = path.basename(dest);
    if (used.has(base) && used.get(base) !== src) {
      throw new Error(`[vendorDeliverySrcUtils] basename clash: ${base}`);
    }
    used.set(base, src);
  }
  for (const [src, dest] of destBySrc) {
    const body = rewriteInternalImports(fs.readFileSync(src, 'utf8'), src, destBySrc);
    fs.writeFileSync(dest, body);
  }
  console.log(`[vendorDeliverySrcUtils] wrote ${destBySrc.size} files to src-utils/`);
  return true;
}

function rewriteAppImports() {
  const roots = [
    path.join(appRoot, 'deliveryKit'),
    path.join(appRoot, 'shared'),
    path.join(appRoot, 'delivery-overlays'),
    path.join(appRoot, 'lib'),
  ];
  const importRe = /(['"])((?:\.\.\/)+src\/(?:utils|constants)\/)([^'"]+)\1/g;
  let changed = 0;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (name === 'node_modules' || name === 'src-utils') continue;
        walk(full);
        continue;
      }
      if (!name.endsWith('.js')) continue;
      let text = fs.readFileSync(full, 'utf8');
      const next = text.replace(importRe, (all, q, _prefix, rest) => {
        const base = String(rest).replace(/\\/g, '/').split('/').pop();
        const withJs = base.endsWith('.js') ? base : `${base}.js`;
        let rel = path.relative(path.dirname(full), path.join(destDir, withJs));
        rel = rel.replace(/\\/g, '/');
        if (!rel.startsWith('.')) rel = `./${rel}`;
        if (!String(rest).endsWith('.js') && rel.endsWith('.js')) {
          rel = rel.slice(0, -3);
        }
        return `${q}${rel}${q}`;
      });
      if (next !== text) {
        fs.writeFileSync(full, next);
        changed += 1;
      }
    }
  }
  roots.forEach(walk);
  if (changed) console.log(`[vendorDeliverySrcUtils] rewrote src imports in ${changed} app files`);
}

function main() {
  vendorFromRepo();
  if (!fs.existsSync(destDir) || !fs.readdirSync(destDir).length) {
    console.error('[vendorDeliverySrcUtils] src-utils/ missing — EAS cannot resolve warehouseSetDeliveryRecipe');
    process.exit(1);
  }
  rewriteAppImports();
}

if (require.main === module) {
  main();
}

module.exports = { main, destDir };
