/**
 * Shared Expo config for smaller release APKs and better performance on older Android devices.
 * Used from each app’s app.config.js via finalizeExpoConfig().
 */

const EXPO_UPDATES_OFF = {
  enabled: false,
  checkAutomatically: 'NEVER',
  fallbackToCacheTimeout: 0,
};

function readAndroidArchitectures() {
  const raw = String(
    process.env.ORG_GRADLE_PROJECT_reactNativeArchitectures
      || process.env.EXPO_ANDROID_ARCHITECTURES
      || 'armeabi-v7a,arm64-v8a',
  ).trim();
  return raw.split(',').map((part) => part.trim()).filter(Boolean);
}

function hasBuildPropertiesPlugin(plugins) {
  return (plugins || []).some(
    (entry) => entry === 'expo-build-properties'
      || (Array.isArray(entry) && entry[0] === 'expo-build-properties'),
  );
}

/** @returns {import('expo-build-properties').PluginType} */
function buildPropertiesPluginEntry() {
  const architectures = readAndroidArchitectures();
  return [
    'expo-build-properties',
    {
      android: {
        minSdkVersion: 24,
        enableMinifyInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true,
        newArchEnabled: false,
        gradleProperties: {
          reactNativeArchitectures: architectures.join(','),
          'android.enableJetifier': 'false',
        },
      },
    },
  ];
}

/**
 * @param {import('@expo/config-types').ExpoConfig} expo
 * @returns {import('@expo/config-types').ExpoConfig}
 */
function finalizeExpoConfig(expo) {
  if (!expo || typeof expo !== 'object') {
    throw new Error('finalizeExpoConfig requires an expo config object');
  }

  const plugins = Array.isArray(expo.plugins) ? [...expo.plugins] : [];
  if (!hasBuildPropertiesPlugin(plugins)) {
    plugins.unshift(buildPropertiesPluginEntry());
  }

  const android = {
    allowBackup: false,
    ...(expo.android || {}),
  };

  return {
    ...expo,
    jsEngine: expo.jsEngine || 'hermes',
    updates: expo.updates ? { ...EXPO_UPDATES_OFF, ...expo.updates } : { ...EXPO_UPDATES_OFF },
    android,
    plugins,
  };
}

module.exports = {
  EXPO_UPDATES_OFF,
  buildPropertiesPluginEntry,
  finalizeExpoConfig,
  readAndroidArchitectures,
};
