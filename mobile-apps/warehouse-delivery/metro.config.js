const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroResolve } = require('metro-resolver');

const projectRoot = __dirname;
const appNodeModules = path.join(projectRoot, 'node_modules');
const appSharedDir = path.join(projectRoot, 'shared');
const kitSharedDir = path.join(projectRoot, 'deliveryKit', 'shared');
const deliveryKitLink = path.join(projectRoot, 'deliveryKit');
const upholsteryRoot = path.resolve(projectRoot, '..', 'warehouse-upholstery');
const deliveryKitPeers = require('./scripts/deliveryKitPeerDependencies');
const { maybeSingletonResolve, applySingletonPackageMetro } = require('../shared/metroSingleScreenModule');

function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/').toLowerCase();
}

function isSharedFile(originModulePath) {
  if (!originModulePath) return false;
  const norm = normalizePath(originModulePath);
  if (norm.includes('/warehouse-delivery/shared/')) return true;
  if (norm.includes('/warehouse-delivery/deliverykit/shared/')) return true;
  return false;
}

/** Code pulled in via deliveryKit → warehouse-production (outside this app's node_modules). */
function isDeliveryKitFile(originModulePath) {
  if (!originModulePath) return false;
  const norm = normalizePath(originModulePath);
  if (norm.includes('/warehouse-delivery/deliverykit/')) return true;
  const upholsteryNorm = normalizePath(upholsteryRoot);
  if (norm.startsWith(`${upholsteryNorm}/`) && !norm.includes('/node_modules/')) return true;
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

/** One module instance: deliveryKit/shared → warehouse-delivery/shared (both are real copies). */
function canonicalizeSharedSource(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  const norm = normalizePath(filePath);
  const kitPrefix = normalizePath(kitSharedDir);
  if (norm.startsWith(`${kitPrefix}/`)) {
    const rel = path.relative(kitSharedDir, filePath);
    if (rel && !rel.startsWith('..')) {
      return path.join(appSharedDir, rel);
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
applySingletonPackageMetro(config);

const watchFolders = new Set(config.watchFolders || []);
watchFolders.add(appSharedDir);
watchFolders.add(path.resolve(projectRoot, '..', '..', 'src'));
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

const upholsteryNodeModules = path.join(upholsteryRoot, 'node_modules').replace(/\\/g, '[\\\\/]');
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /[\\/]node_modules[\\/]expo[\\/]node_modules[\\/]@react-native[\\/]\.debugger-frontend-[^/\\]+[\\/]/,
  new RegExp(`${upholsteryNodeModules}[\\\\/].*`),
  /[\\/]warehouse-delivery[\\/][Dd]elivery[Kk]it[\\/]node_modules[\\/]/,
  /[\\/]warehouse-upholstery[\\/]node_modules[\\/]/,
];

function shouldResolvePeerFromApp(moduleName) {
  if (deliveryKitPeerSet.has(moduleName)) return true;
  if (moduleName === 'react-native-safe-area-context') return true;
  if (moduleName === 'react-native-screens') return true;
  if (moduleName.startsWith('react/')) return true;
  return false;
}

const deliveryAppUiConfig = path.join(projectRoot, 'config', 'deliveryAppUi.js');
const expoCryptoSafeShim = path.join(projectRoot, 'shared', 'expoCryptoSafeShim.js');
const expoApplicationSafeShim = path.join(projectRoot, 'shared', 'expoApplicationSafeShim.js');

const priorResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const singleton = maybeSingletonResolve(context, moduleName, platform, priorResolve, metroResolve, projectRoot);
  if (singleton) return finishResolve(singleton);

  if (moduleName === 'delivery-app-ui-config') {
    return finishResolve({ type: 'sourceFile', filePath: deliveryAppUiConfig });
  }
  if (moduleName === 'expo-crypto' && fs.existsSync(expoCryptoSafeShim)) {
    return finishResolve({ type: 'sourceFile', filePath: expoCryptoSafeShim });
  }
  if (
    (moduleName === 'expo-application' || String(moduleName).startsWith('expo-application/'))
    && fs.existsSync(expoApplicationSafeShim)
  ) {
    return finishResolve({ type: 'sourceFile', filePath: expoApplicationSafeShim });
  }

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

const { applyMetroLightweightBundle } = require('../shared/metroInlineRequires');
module.exports = applyMetroLightweightBundle(config);
