const fs = require('fs');
const path = require('path');

const DELIVERY_PACKAGE = 'com.bestrest.warehousedelivery';

function readFromGoogleServices({ packageName = DELIVERY_PACKAGE } = {}) {
  try {
    const filePath = path.join(__dirname, 'google-services.json');
    if (!fs.existsSync(filePath)) return {};
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const client = (json.client || []).find(
      (row) => row?.client_info?.android_client_info?.package_name === packageName,
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
  /** Delivery Android app — not Warehouse Production. Run scripts/setupWarehouseDeliveryGoogleSignIn.mjs */
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
    || fromGoogle.appId
    || '1:876299148810:web:ad26d0b2eeb499d39049f3',
};

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || '876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4.apps.googleusercontent.com';

const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  || fromGoogle.androidClientId
  || googleWebClientId;

const googleIosUrlScheme = 'com.googleusercontent.apps.876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4';

const googleServicesPath = path.join(__dirname, 'google-services.json');

const { finalizeExpoConfig } = require('../shared/expoAndroidLightweight');

module.exports = {
  expo: finalizeExpoConfig({
    name: 'Delivery',
    owner: 'alielboussi',
    slug: 'warehouse-delivery',
    scheme: 'warehouse-delivery',
    platforms: ['android'],
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    icon: './assets/icon.png',
    splash: {
      image: './assets/icon.png',
      resizeMode: 'contain',
      backgroundColor: '#000928',
    },
    android: {
      package: DELIVERY_PACKAGE,
      ...(fs.existsSync(googleServicesPath) ? { googleServicesFile: './google-services.json' } : {}),
      softwareKeyboardLayoutMode: 'resize',
      permissions: [
        'INTERNET',
        'ACCESS_NETWORK_STATE',
        'ACCESS_WIFI_STATE',
        'CAMERA',
      ],
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#000928',
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
      [
        'expo-camera',
        {
          cameraPermission: 'Delivery needs the camera to scan Code 128 barcodes on product labels.',
        },
      ],
      [
        'expo-image-picker',
        {
          cameraPermission: 'Delivery may use the camera when granting scan permissions on some devices.',
          photosPermission: 'Allow photo access if the system routes scanner permission through the gallery.',
        },
      ],
      [
        'expo-notifications',
        {
          color: '#38bdf8',
          defaultChannel: 'delivery-alerts',
        },
      ],
    ],
    extra: {
      firebase,
      apiBase: (process.env.EXPO_PUBLIC_API_BASE || 'https://www.infinity-home.online').replace(/\/+$/, ''),
      googleWebClientId,
      googleAndroidClientId,
      appScheme: 'warehouse-delivery',
      expoProjectFullName: '@alielboussi/warehouse-delivery',
      eas: {
        projectId: 'd72e9b6e-4f3d-40cf-bdaa-840558e3d221',
      },
    },
  }),
};
