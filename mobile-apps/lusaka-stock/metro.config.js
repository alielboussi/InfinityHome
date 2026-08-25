const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const mobileAppsRoot = path.resolve(projectRoot, '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Allow imports from mobile-apps/shared (../shared/*)
config.watchFolders = [mobileAppsRoot];

// Resolve packages from this app's node_modules when bundling shared/
const appNodeModules = path.resolve(projectRoot, 'node_modules');
config.resolver.nodeModulesPaths = [appNodeModules];
config.resolver.disableHierarchicalLookup = true;
const firebaseNestedModules = path.resolve(appNodeModules, 'firebase/node_modules/@firebase');
config.resolver.extraNodeModules = {
  '@firebase/auth': path.resolve(firebaseNestedModules, 'auth'),
  '@react-native/virtualized-lists': path.resolve(
    appNodeModules,
    'react-native/node_modules/@react-native/virtualized-lists',
  ),
  '@react-native-async-storage/async-storage': path.resolve(
    appNodeModules,
    '@react-native-async-storage/async-storage',
  ),
  '@expo/vector-icons': path.resolve(appNodeModules, '@expo/vector-icons'),
  'expo-constants': path.resolve(appNodeModules, 'expo-constants'),
  'expo-application': path.resolve(appNodeModules, 'expo-application'),
  'expo-auth-session': path.resolve(appNodeModules, 'expo-auth-session'),
  'expo-web-browser': path.resolve(appNodeModules, 'expo-web-browser'),
};

module.exports = config;
