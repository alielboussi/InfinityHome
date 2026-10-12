const fs = require('fs');
const path = require('path');

const firebase = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDH7wLdDQui32tzfdvXA5p1VBKxqLQbqjw',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'bestrest-portal-system-43108.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'bestrest-portal-system-43108',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'bestrest-portal-system-43108.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '876299148810',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:876299148810:web:ad26d0b2eeb499d39049f3',
};

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || '876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4.apps.googleusercontent.com';

function readAndroidOAuthClientIdFromGoogleServices() {
  try {
    const filePath = path.join(__dirname, 'google-services.json');
    if (!fs.existsSync(filePath)) return null;
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const client = (json.client || []).find(
      (row) => row?.client_info?.android_client_info?.package_name === 'com.bestrest.warehousecatalog',
    );
    const androidOAuth = (client?.oauth_client || []).find((row) => Number(row.client_type) === 1);
    return androidOAuth?.client_id || null;
  } catch {
    return null;
  }
}

const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  || readAndroidOAuthClientIdFromGoogleServices()
  || '876299148810-roqunrqeh8k2c0jpracks0j6nqe77tsv.apps.googleusercontent.com';

const googleIosUrlScheme = 'com.googleusercontent.apps.876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4';

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'Warehouse Catalog',
    slug: 'warehouse-catalog',
    scheme: 'warehouse-catalog',
    platforms: ['ios', 'android'],
    version: '0.1.3',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    icon: './assets/icon.png',
    updates: {
      enabled: false,
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
    },
    splash: {
      image: './assets/icon.png',
      resizeMode: 'contain',
      backgroundColor: '#8b69ed',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.bestrest.warehousecatalog',
    },
    android: {
      package: 'com.bestrest.warehousecatalog',
      googleServicesFile: './google-services.json',
      softwareKeyboardLayoutMode: 'resize',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#8b69ed',
      },
    },
    plugins: [
      'expo-asset',
      'expo-camera',
      [
        'expo-local-authentication',
        { faceIDPermission: 'Unlock Warehouse Catalog with Face ID.' },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: googleIosUrlScheme,
        },
      ],
    ],
    extra: {
      firebase,
      apiBase: (process.env.EXPO_PUBLIC_API_BASE || 'https://www.infinity-home.online').replace(/\/+$/, ''),
      googleWebClientId,
      googleAndroidClientId,
      expoProjectFullName: '@alielboussi/warehouse-catalog',
      eas: {
        projectId: '2382f873-a3a2-4b5b-88a9-b6c1e2abf4de',
      },
    },
  },
};
