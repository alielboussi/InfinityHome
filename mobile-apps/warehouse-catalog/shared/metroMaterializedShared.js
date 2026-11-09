/**
 * When an app materializes mobile-apps/shared into ./shared, block the template
 * tree from watchFolders so Metro does not load duplicate modules (RNSScreen).
 */
const fs = require('fs');
const path = require('path');

function applyMaterializedSharedMetro(config, projectRoot) {
  const appSharedDir = path.join(projectRoot, 'shared');
  const templateSharedDir = path.resolve(projectRoot, '..', 'shared');

  const watchFolders = new Set(config.watchFolders || []);
  watchFolders.add(appSharedDir);
  config.watchFolders = [...watchFolders];

  return { appSharedDir, templateSharedDir };
}

function canonicalizeToAppShared(filePath, appSharedDir, templateSharedDir) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  const norm = path.normalize(filePath).replace(/\\/g, '/').toLowerCase();
  const templateNorm = path.normalize(templateSharedDir).replace(/\\/g, '/').toLowerCase();
  if (norm.startsWith(`${templateNorm}/`)) {
    const rel = path.relative(templateSharedDir, filePath);
    if (rel && !rel.startsWith('..')) {
      const dest = path.join(appSharedDir, rel);
      if (fs.existsSync(dest)) return dest;
    }
  }
  return filePath;
}

module.exports = { applyMaterializedSharedMetro, canonicalizeToAppShared };
