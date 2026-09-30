const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroResolve } = require('metro-resolver');

const projectRoot = __dirname;
const appNodeModules = path.join(projectRoot, 'node_modules');
const sharedDir = path.resolve(projectRoot, '..', 'shared');
const sharedLink = path.join(projectRoot, 'shared');
const repoSrcDir = path.resolve(projectRoot, '..', '..', 'src');

function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/').toLowerCase();
}

function isSharedFile(originModulePath) {
  if (!originModulePath) return false;
  const norm = normalizePath(originModulePath);
  if (norm.includes('/mobile-apps/shared/')) return true;
  if (norm.includes('/warehouse-catalog/shared/')) return true;
  const sharedNorm = normalizePath(sharedDir);
  const linkNorm = normalizePath(sharedLink);
  return norm.startsWith(`${sharedNorm}/`) || norm.startsWith(`${linkNorm}/`);
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

const config = getDefaultConfig(projectRoot);

const watchFolders = new Set(config.watchFolders || []);
watchFolders.add(sharedDir);
if (fs.existsSync(sharedLink)) watchFolders.add(sharedLink);
if (fs.existsSync(repoSrcDir)) watchFolders.add(repoSrcDir);
config.watchFolders = [...watchFolders];

config.resolver.nodeModulesPaths = [appNodeModules];

const reactRoot = packageRoot('react');
const rnRoot = packageRoot('react-native');
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...(reactRoot ? { react: reactRoot } : {}),
  ...(rnRoot ? { 'react-native': rnRoot } : {}),
};

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /[\\/]node_modules[\\/]expo[\\/]node_modules[\\/]@react-native[\\/]\.debugger-frontend-[^/\\]+[\\/]/,
];

const priorResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isBare = !moduleName.startsWith('.') && !moduleName.startsWith('\0');

  if (isBare && (isSharedFile(context.originModulePath) || isRepoSrcFile(context.originModulePath))) {
    const filePath = resolveFromApp(moduleName);
    if (filePath) {
      return { type: 'sourceFile', filePath };
    }
    const redirected = {
      ...context,
      originModulePath: path.join(projectRoot, 'App.js'),
    };
    if (priorResolve) {
      return priorResolve(redirected, moduleName, platform);
    }
    return metroResolve(redirected, moduleName, platform);
  }

  if (priorResolve) {
    return priorResolve(context, moduleName, platform);
  }
  return metroResolve(context, moduleName, platform);
};

module.exports = config;
