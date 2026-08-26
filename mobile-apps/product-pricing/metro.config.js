const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const mobileAppsRoot = path.resolve(projectRoot, '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [mobileAppsRoot];

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
  'expo-camera': path.resolve(appNodeModules, 'expo-camera'),
  'expo-image-picker': path.resolve(appNodeModules, 'expo-image-picker'),
  'expo-file-system': path.resolve(appNodeModules, 'expo-file-system'),
};

module.exports = config;
