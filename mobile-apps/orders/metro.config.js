const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroResolve } = require('metro-resolver');
const { applyMaterializedSharedMetro, canonicalizeToAppShared } = require('./shared/metroMaterializedShared');
const { maybeSingletonResolve, applySingletonPackageMetro } = require('./shared/metroSingleScreenModule');

const projectRoot = __dirname;
const appNodeModules = path.join(projectRoot, 'node_modules');
const appSharedDir = path.join(projectRoot, 'shared');
const templateSharedDir = path.resolve(projectRoot, '..', 'shared');

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
  if (norm.includes('/orders/shared/')) return true;
  if (norm.includes('/orders/productionkiosk/shared/')) return true;
  if (norm.includes('/mobile-apps/shared/')) return true;
  const appSharedNorm = normalizePath(appSharedDir);
  return norm.startsWith(`${appSharedNorm}/`);
}

function resolveFromApp(moduleName) {
  try {
    return require.resolve(moduleName, { paths: [projectRoot, appNodeModules] });
  } catch {
    return null;
  }
}

function finishResolve(result) {
  if (result?.type === 'sourceFile' && result.filePath) {
    return { ...result, filePath: canonicalizeToAppShared(result.filePath, appSharedDir, templateSharedDir) };
  }
  return result;
}

const config = getDefaultConfig(projectRoot);
applyMaterializedSharedMetro(config, projectRoot);
applySingletonPackageMetro(config);
config.resolver.nodeModulesPaths = [appNodeModules];

const expoCryptoSafeShim = path.join(projectRoot, 'shared', 'expoCryptoSafeShim.js');
const priorResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const singleton = maybeSingletonResolve(context, moduleName, platform, priorResolve, metroResolve, projectRoot);
  if (singleton) return finishResolve(singleton);

  if (moduleName === 'expo-crypto' && fs.existsSync(expoCryptoSafeShim)) {
    return finishResolve({ type: 'sourceFile', filePath: expoCryptoSafeShim });
  }

  const isBare = !moduleName.startsWith('.') && !moduleName.startsWith('\0');
  const fromShared = isSharedFile(context.originModulePath);

  if (
    isBare
    && fromShared
    && (SHARED_PEER_MODULES.has(moduleName) || moduleName.startsWith('react/'))
  ) {
    const filePath = resolveFromApp(moduleName);
    if (filePath) return finishResolve({ type: 'sourceFile', filePath });
  }

  if (isBare && fromShared) {
    const filePath = resolveFromApp(moduleName);
    if (filePath) return finishResolve({ type: 'sourceFile', filePath });
    const redirected = { ...context, originModulePath: path.join(projectRoot, 'App.js') };
    if (priorResolve) return finishResolve(priorResolve(redirected, moduleName, platform));
    return finishResolve(metroResolve(redirected, moduleName, platform));
  }

  if (priorResolve) return finishResolve(priorResolve(context, moduleName, platform));
  return finishResolve(metroResolve(context, moduleName, platform));
};

const { applyMetroLightweightBundle } = require('./shared/metroInlineRequires');
module.exports = applyMetroLightweightBundle(config);
