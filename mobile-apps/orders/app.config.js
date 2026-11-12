const fs = require('fs');
const path = require('path');

const ORDERS_PACKAGE = 'online.infinityhome.orders';
const googleServicesPath = path.join(__dirname, 'google-services.json');

function readFromGoogleServices() {
  try {
    if (!fs.existsSync(googleServicesPath)) return {};
    const json = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
    const client = (json.client || []).find(
      (row) => row?.client_info?.android_client_info?.package_name === ORDERS_PACKAGE,
    );
    if (!client) return {};
    const androidOAuth = (client.oauth_client || []).find((row) => Number(row.client_type) === 1);
    return {
      appId: client.client_info?.mobilesdk_app_id || null,
      androidClientId: androidOAuth?.client_id || null,
    };
  } catch {
    return {};
  }
}

const fromGoogle = readFromGoogleServices();

const firebase = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDH7wLdDQui32tzfdvXA5p1VBKxqLQbqjw',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'bestrest-portal-system-43108.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'bestrest-portal-system-43108',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'bestrest-portal-system-43108.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '876299148810',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
    || fromGoogle.appId
    || '1:876299148810:android:e21bd29123855a219049f3',
};

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || '876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4.apps.googleusercontent.com';

const googleIosUrlScheme = 'com.googleusercontent.apps.876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4';

const { finalizeExpoConfig } = require('../shared/expoAndroidLightweight');

module.exports = {
  expo: finalizeExpoConfig({
    name: 'Orders',
    owner: 'alielboussi',
    slug: 'infinity-orders',
    scheme: 'infinity-orders',
    platforms: ['android'],
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    icon: './assets/icon.png',
    splash: {
      image: './assets/icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0d47a1',
    },
    android: {
      package: ORDERS_PACKAGE,
      softwareKeyboardLayoutMode: 'resize',
      permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'],
      ...(fs.existsSync(googleServicesPath) ? { googleServicesFile: './google-services.json' } : {}),
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0d47a1',
      },
    },
    plugins: [
      'expo-font',
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
      googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
        || fromGoogle.androidClientId
        || googleWebClientId,
      appScheme: 'infinity-orders',
      expoProjectFullName: '@alielboussi/infinity-orders',
      eas: {
        projectId: '094ca8ca-76fe-4e6e-add5-c8fb1e35c59f',
      },
    },
  }),
};
