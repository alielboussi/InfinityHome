const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroResolve } = require('metro-resolver');

const projectRoot = __dirname;
const appNodeModules = path.join(projectRoot, 'node_modules');
const sharedDir = path.resolve(projectRoot, '..', 'shared');
const sharedLink = path.join(projectRoot, 'shared');
const deliveryKitLink = path.join(projectRoot, 'deliveryKit');
const productionRoot = path.resolve(projectRoot, '..', 'warehouse-production');
const deliveryKitPeers = require('./scripts/deliveryKitPeerDependencies');

function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/').toLowerCase();
}

function isSharedFile(originModulePath) {
  if (!originModulePath) return false;
  const norm = normalizePath(originModulePath);
  if (norm.includes('/mobile-apps/shared/')) return true;
  if (norm.includes('/warehouse-production/shared/')) return true;
  if (norm.includes('/warehouse-delivery/shared/')) return true;
  const sharedNorm = normalizePath(sharedDir);
  const linkNorm = normalizePath(sharedLink);
  return norm.startsWith(`${sharedNorm}/`) || norm.startsWith(`${linkNorm}/`);
}

/** Code pulled in via deliveryKit → warehouse-production (outside this app's node_modules). */
function isDeliveryKitFile(originModulePath) {
  if (!originModulePath) return false;
  const norm = normalizePath(originModulePath);
  if (norm.includes('/warehouse-delivery/deliverykit/')) return true;
  const prodNorm = normalizePath(productionRoot);
  if (norm.startsWith(`${prodNorm}/`) && !norm.includes('/node_modules/')) return true;
  return false;
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

let sharedRealRoot = null;
function getSharedRealRoot() {
  if (sharedRealRoot) return sharedRealRoot;
  try {
    sharedRealRoot = fs.realpathSync(sharedDir);
  } catch {
    sharedRealRoot = sharedDir;
  }
  return sharedRealRoot;
}

/** One module instance for shared/ (deliveryKit/shared junction vs warehouse-delivery/shared). */
function canonicalizeSharedSource(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  try {
    const resolved = fs.realpathSync(filePath);
    const rel = path.relative(getSharedRealRoot(), resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return path.join(sharedDir, rel);
    }
  } catch {
    // keep original
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
watchFolders.add(sharedDir);
watchFolders.add(path.resolve(projectRoot, '..', '..', 'src'));
if (fs.existsSync(sharedLink)) watchFolders.add(sharedLink);
if (fs.existsSync(deliveryKitLink)) watchFolders.add(deliveryKitLink);
config.watchFolders = [...watchFolders];

config.resolver.nodeModulesPaths = [appNodeModules];

const reactRoot = packageRoot('react');
const rnRoot = packageRoot('react-native');
const deliveryKitPeerSet = new Set(deliveryKitPeers);
const extraNodeModules = { ...(config.resolver.extraNodeModules || {}) };
if (reactRoot) extraNodeModules.react = reactRoot;
if (rnRoot) extraNodeModules['react-native'] = rnRoot;
for (const name of deliveryKitPeers) {
  const root = packageRoot(name);
  if (root) extraNodeModules[name] = root;
}
config.resolver.extraNodeModules = extraNodeModules;

const prodNodeModules = path.join(productionRoot, 'node_modules').replace(/\\/g, '[\\\\/]');
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /[\\/]node_modules[\\/]expo[\\/]node_modules[\\/]@react-native[\\/]\.debugger-frontend-[^/\\]+[\\/]/,
  new RegExp(`${prodNodeModules}[\\\\/].*`),
  /** deliveryKit junction → warehouse-production; never bundle its node_modules (duplicate native views). */
  /[\\/]warehouse-delivery[\\/][Dd]elivery[Kk]it[\\/]node_modules[\\/]/,
  /[\\/]warehouse-production[\\/]node_modules[\\/]/,
];

function shouldResolvePeerFromApp(moduleName) {
  if (deliveryKitPeerSet.has(moduleName)) return true;
  if (moduleName === 'react-native-safe-area-context') return true;
  if (moduleName.startsWith('react/')) return true;
  return false;
}

const priorResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isBare = !moduleName.startsWith('.') && !moduleName.startsWith('\0');
  const external = isSharedFile(context.originModulePath) || isDeliveryKitFile(context.originModulePath);

  /**
   * deliveryKit is a junction to warehouse-production; Node would resolve peers from
   * production/node_modules and register native views twice (RNCSafeAreaProvider).
   */
  if (isBare && shouldResolvePeerFromApp(moduleName)) {
    const filePath = resolveFromApp(moduleName);
    if (filePath) {
      return finishResolve({ type: 'sourceFile', filePath });
    }
  }

  if (isBare && external) {
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

module.exports = config;
