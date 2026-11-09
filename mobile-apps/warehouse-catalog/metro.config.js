const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroResolve } = require('metro-resolver');

const projectRoot = __dirname;
const appNodeModules = path.join(projectRoot, 'node_modules');
const appSharedDir = path.join(projectRoot, 'shared');
const templateSharedDir = path.resolve(projectRoot, '..', 'shared');
const repoSrcDir = path.resolve(projectRoot, '..', '..', 'src');

const SHARED_PEER_MODULES = new Set([
  'react',
  'react-native',
  'react-native-screens',
  'react-native-safe-area-context',
  '@react-navigation/native',
  '@react-navigation/native-stack',
]);

function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/').toLowerCase();
}

function isSharedFile(originModulePath) {
  if (!originModulePath) return false;
  const norm = normalizePath(originModulePath);
  if (norm.includes('/mobile-apps/shared/')) return true;
  if (norm.includes('/warehouse-catalog/shared/')) return true;
  const appSharedNorm = normalizePath(appSharedDir);
  const templateNorm = normalizePath(templateSharedDir);
  return norm.startsWith(`${appSharedNorm}/`) || norm.startsWith(`${templateNorm}/`);
}

function isRepoSrcFile(originModulePath) {
  if (!originModulePath) return false;
  const norm = normalizePath(originModulePath);
  const srcNorm = normalizePath(repoSrcDir);
  return norm.startsWith(`${srcNorm}/`);
}

function resolveFromApp(moduleName) {
  try {
    return require.resolve(moduleName, { paths: [projectRoot, appNodeModules] });
  } catch {
    return null;
  }
}

function packageRoot(moduleName) {
  const pkgJson = resolveFromApp(`${moduleName}/package.json`);
  if (pkgJson) return path.dirname(pkgJson);
  const direct = path.join(appNodeModules, moduleName);
  if (fs.existsSync(direct)) return direct;
  return null;
}

/** Metro must not load both src/ and lib/commonjs/ entries (duplicate RNSScreen registration). */
const SINGLETON_PACKAGE_ENTRIES = {
  'react-native-screens': ['src/index.tsx', 'src/index.ts'],
  'react-native-safe-area-context': ['src/index.tsx', 'src/index.ts', 'lib/module/index.js'],
};

function resolveSingletonEntry(moduleName) {
  const root = packageRoot(moduleName);
  if (!root) return null;
  const candidates = SINGLETON_PACKAGE_ENTRIES[moduleName];
  if (!candidates) return null;
  for (const rel of candidates) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) return full;
  }
  return resolveFromApp(moduleName);
}

/** One module instance — avoid duplicate RNSScreen when template shared is also on disk. */
function canonicalizeSharedSource(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  const norm = normalizePath(filePath);
  const templateNorm = normalizePath(templateSharedDir);
  if (norm.startsWith(`${templateNorm}/`)) {
    const rel = path.relative(templateSharedDir, filePath);
    if (rel && !rel.startsWith('..')) {
      const dest = path.join(appSharedDir, rel);
      if (fs.existsSync(dest)) return dest;
    }
  }
  return filePath;
}

function finishResolve(result) {
  if (result?.type === 'sourceFile' && result.filePath) {
    return { ...result, filePath: canonicalizeSharedSource(result.filePath) };
  }
  return result;
}

const config = getDefaultConfig(projectRoot);

const watchFolders = new Set(config.watchFolders || []);
watchFolders.add(appSharedDir);
if (fs.existsSync(repoSrcDir)) watchFolders.add(repoSrcDir);
config.watchFolders = [...watchFolders];

config.resolver.nodeModulesPaths = [appNodeModules];

const reactRoot = packageRoot('react');
const rnRoot = packageRoot('react-native');
const imagePickerRoot = packageRoot('expo-image-picker');
const firebaseNested = path.join(appNodeModules, 'firebase', 'node_modules', '@firebase');
const extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...(reactRoot ? { react: reactRoot } : {}),
  ...(rnRoot ? { 'react-native': rnRoot } : {}),
  ...(imagePickerRoot ? { 'expo-image-picker': imagePickerRoot } : {}),
};
if (fs.existsSync(path.join(firebaseNested, 'auth'))) {
  extraNodeModules['@firebase/auth'] = path.join(firebaseNested, 'auth');
}
config.resolver.extraNodeModules = extraNodeModules;

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /[\\/]node_modules[\\/]expo[\\/]node_modules[\\/]@react-native[\\/]\.debugger-frontend-[^/\\]+[\\/]/,
  /[\\/]node_modules[\\/]react-native-screens[\\/]lib[\\/]/,
];

const priorResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isBare = !moduleName.startsWith('.') && !moduleName.startsWith('\0');
  const singletonEntry = isBare ? resolveSingletonEntry(moduleName) : null;
  if (singletonEntry) {
    return finishResolve({ type: 'sourceFile', filePath: singletonEntry });
  }

  const fromShared = isSharedFile(context.originModulePath);
  const fromRepoSrc = isRepoSrcFile(context.originModulePath);

  if (
    isBare
    && (fromShared || fromRepoSrc)
    && (SHARED_PEER_MODULES.has(moduleName) || moduleName.startsWith('react/'))
  ) {
    const filePath = resolveFromApp(moduleName);
    if (filePath) {
      return finishResolve({ type: 'sourceFile', filePath });
    }
  }

  if (isBare && (fromShared || fromRepoSrc)) {
    const filePath = resolveFromApp(moduleName);
    if (filePath) {
      return finishResolve({ type: 'sourceFile', filePath });
    }
    const redirected = {
      ...context,
      originModulePath: path.join(projectRoot, 'App.js'),
    };
    if (priorResolve) {
      return finishResolve(priorResolve(redirected, moduleName, platform));
    }
    return finishResolve(metroResolve(redirected, moduleName, platform));
  }

  if (priorResolve) {
    return finishResolve(priorResolve(context, moduleName, platform));
  }
  return finishResolve(metroResolve(context, moduleName, platform));
};

const { applyMetroLightweightBundle } = require('./shared/metroInlineRequires');
module.exports = applyMetroLightweightBundle(config);
