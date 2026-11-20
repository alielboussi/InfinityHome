/**
 * Paths under mobile-apps/shared that every workshop app must have after materialize.
 */
const fs = require('fs');
const path = require('path');

const CRITICAL_REL_PATHS = [
  'screens/ProductionPushSettingsScreen.js',
  'productionPushPrefs.js',
  'lib/productionPushNavigation.js',
];

function ensureCriticalSharedFiles(appSharedDir, templateRoot) {
  const template = path.resolve(templateRoot);
  const appShared = path.resolve(appSharedDir);
  if (!fs.existsSync(template)) return { ok: false, missingTemplate: true };
  let copied = 0;
  for (const rel of CRITICAL_REL_PATHS) {
    const src = path.join(template, rel);
    const dest = path.join(appShared, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copied += 1;
  }
  return { ok: true, copied };
}

function assertCriticalSharedFiles(appSharedDir, appLabel = 'app') {
  const appShared = path.resolve(appSharedDir);
  const missing = [];
  for (const rel of CRITICAL_REL_PATHS) {
    if (!fs.existsSync(path.join(appShared, rel))) missing.push(rel);
  }
  if (missing.length) {
    throw new Error(
      `[${appLabel}] missing shared files after materialize: ${missing.join(', ')} — run npm run materialize`,
    );
  }
}

module.exports = {
  CRITICAL_REL_PATHS,
  ensureCriticalSharedFiles,
  assertCriticalSharedFiles,
};