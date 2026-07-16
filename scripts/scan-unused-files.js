#!/usr/bin/env node
/**
 * Scan src/ (and optionally api/) for unused files by walking import/require graph
 * starting from src/index.js. Prints a report and supports optional renaming of
 * unused .js files to *.delete.js.
 *
 * Usage:
 *   node scripts/scan-unused-files.js           # preview only
 *   node scripts/scan-unused-files.js --rename  # rename unused .js -> .delete.js
 *   node scripts/scan-unused-files.js --include-api  # include api/ as roots too
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const API_DIR = path.join(ROOT, 'api');

const args = new Set(process.argv.slice(2));
const DO_RENAME = args.has('--rename');
const INCLUDE_API = args.has('--include-api');

// Files to ignore (always considered used)
const ALWAYS_KEEP = new Set([
  'src/supabase.js',
  'src/reportWebVitals.js',
]);

// Extensions we follow when resolving imports
const RESOLVE_EXTS = ['.js', '.jsx', '.ts', '.tsx'];

function readFileSafe(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch { return null; }
}

function existsWithExt(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;
  for (const ext of RESOLVE_EXTS) {
    const p = basePath + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  // index resolution for folders
  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const ext of RESOLVE_EXTS) {
      const p = path.join(basePath, 'index' + ext);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
  }
  return null;
}

function extractImports(code) {
  const results = [];
  if (!code) return results;
  // import ... from '...'; import '...'
  const importRe = /import\s+(?:[^'";]+from\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(code))) results.push(m[1]);
  // require('...') including React.createElement(require('...').default)
  const requireRe = /require\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = requireRe.exec(code))) results.push(m[1]);
  return results;
}

function walk(startFiles) {
  const visited = new Set();
  const queue = [...startFiles];
  while (queue.length) {
    const cur = queue.pop();
    if (visited.has(cur)) continue;
    visited.add(cur);
    const code = readFileSafe(cur);
    if (!code) continue;
    const imports = extractImports(code);
    for (const imp of imports) {
      if (imp.startsWith('.') || imp.startsWith('/')) {
        // local file
        const abs = existsWithExt(path.resolve(path.dirname(cur), imp));
        if (abs) queue.push(abs);
        // also treat explicit css as used (but we don't traverse)
      }
    }
  }
  return visited;
}

function listAllJsFiles(dir) {
  const out = [];
  function rec(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) rec(p);
      else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(p);
    }
  }
  rec(dir);
  return out;
}

function rel(p) { return path.relative(ROOT, p).replaceAll('\\', '/'); }

// Roots
const roots = [existsWithExt(path.join(SRC_DIR, 'index'))].filter(Boolean);
if (INCLUDE_API && fs.existsSync(API_DIR)) {
  for (const f of listAllJsFiles(API_DIR)) roots.push(f);
}
if (roots.length === 0) {
  console.error('No entry points found. Expected src/index.js');
  process.exit(1);
}

const used = walk(roots);
for (const keep of ALWAYS_KEEP) used.add(path.join(ROOT, keep));

const all = listAllJsFiles(SRC_DIR);
const unused = all.filter(f => !used.has(f));

console.log('Scanned roots:\n - ' + roots.map(rel).join('\n - '));
console.log(`\nUsed files (${used.size}):`);
// print limited
let count = 0;
for (const f of used) {
  if (rel(f).startsWith('src/')) {
    console.log('  ' + rel(f));
    if (++count > 200) { console.log('  ...'); break; }
  }
}

console.log(`\nAll JS files in src (${all.length}):`);
for (const f of all.map(rel)) console.log('  ' + f);

console.log(`\nUnused JS files in src (${unused.length}):`);
for (const f of unused.map(rel)) console.log('  ' + f);

if (DO_RENAME) {
  console.log('\nRenaming unused files to *.delete.js ...');
  let renamed = 0;
  for (const f of unused) {
    const dir = path.dirname(f);
    const base = path.basename(f, path.extname(f));
    const target = path.join(dir, base + '.delete.js');
    if (fs.existsSync(target)) { console.warn('Skip, exists:', rel(target)); continue; }
    fs.renameSync(f, target);
    renamed++;
    console.log('Renamed:', rel(f), '->', rel(target));
  }
  console.log(`Done. Renamed ${renamed} files.`);
}
