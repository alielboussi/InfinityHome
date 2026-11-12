/**
 * Prevent duplicate RNSScreen / safe-area native view registration when Metro
 * resolves the same package via both src/ and lib/commonjs/ (common with materialized shared/).
 */
const fs = require('fs');

/** `react-native-screens`: pick one tree (`src/` via Metro) and block `lib/` (mixing both registers RNSScreen twice). */
const SINGLETON_PACKAGE_ENTRIES = {
  'react-native-screens': ['src/index.tsx', 'src/index.ts'],
  'react-native-safe-area-context': ['src/index.tsx', 'src/index.ts', 'lib/module/index.js'],
};

const SINGLETON_PACKAGE_SRC_BLOCK = [
  /[\\/]node_modules[\\/]react-native-screens[\\/]lib[\\/]/,
];

function applySingletonPackageMetro(config) {
  const block = Array.isArray(config.resolver.blockList) ? config.resolver.blockList : [];
  config.resolver.blockList = [...block, ...SINGLETON_PACKAGE_SRC_BLOCK];
}

function resolveSingletonEntry(moduleName, resolveFromApp, packageRoot) {
  const root = packageRoot(moduleName);
  if (!root) return null;
  const candidates = SINGLETON_PACKAGE_ENTRIES[moduleName];
  if (!candidates) return null;
  for (const rel of candidates) {
    const full = require('path').join(root, rel);
    if (fs.existsSync(full)) return full;
  }
  return resolveFromApp(moduleName);
}

function maybeSingletonResolve(context, moduleName, platform, priorResolve, metroResolve, projectRoot) {
  const isBare = !moduleName.startsWith('.') && !moduleName.startsWith('\0');
  if (!isBare || !Object.prototype.hasOwnProperty.call(SINGLETON_PACKAGE_ENTRIES, moduleName)) {
    return null;
  }
  const resolveFromApp = (name) => {
    try {
      return require.resolve(name, {
        paths: [projectRoot, require('path').join(projectRoot, 'node_modules')],
      });
    } catch {
      return null;
    }
  };
  const packageRoot = (name) => {
    const pkgJson = resolveFromApp(`${name}/package.json`);
    if (pkgJson) return require('path').dirname(pkgJson);
    const direct = require('path').join(projectRoot, 'node_modules', name);
    if (fs.existsSync(direct)) return direct;
    return null;
  };
  const filePath = resolveSingletonEntry(moduleName, resolveFromApp, packageRoot);
  if (!filePath) return null;
  return { type: 'sourceFile', filePath };
}

module.exports = {
  maybeSingletonResolve,
  SINGLETON_PACKAGE_ENTRIES,
  applySingletonPackageMetro,
};
