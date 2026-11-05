const fs = require('fs');
const path = require('path');

const UPHOLSTERY_PACKAGE = 'com.bestrest.warehouseupholstery';

function readFromGoogleServices({ packageName = UPHOLSTERY_PACKAGE } = {}) {
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
  /** Dedicated Upholstery Android app — run scripts/setupWarehouseUpholsteryGoogleSignIn.mjs */
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
    || fromGoogle.appId
    || '1:876299148810:android:65bc4ce178a7fbf49049f3',
};

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || '876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4.apps.googleusercontent.com';

function readAndroidOAuthClientIdFromGoogleServices() {
  if (fromGoogle.androidClientId) return fromGoogle.androidClientId;
  try {
    const filePath = path.join(__dirname, 'google-services.json');
    if (!fs.existsSync(filePath)) return null;
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const client = (json.client || []).find(
      (row) => row?.client_info?.android_client_info?.package_name === UPHOLSTERY_PACKAGE
        || row?.client_info?.android_client_info?.package_name === 'com.bestrest.warehouseproduction',
    );
    const androidOAuth = (client?.oauth_client || []).find((row) => Number(row.client_type) === 1);
    return androidOAuth?.client_id || null;
  } catch {
    return null;
  }
}

const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  || readAndroidOAuthClientIdFromGoogleServices()
  || googleWebClientId;

const googleIosUrlScheme = 'com.googleusercontent.apps.876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4';

module.exports = {
  expo: {
    name: 'Upholstery',
    owner: 'alielboussi',
    slug: 'warehouse-upholstery',
    scheme: 'warehouse-upholstery',
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
      package: UPHOLSTERY_PACKAGE,
      ...(fs.existsSync(path.join(__dirname, 'google-services.json'))
        ? { googleServicesFile: './google-services.json' }
        : {}),
      softwareKeyboardLayoutMode: 'resize',
      permissions: [
        'INTERNET',
        'ACCESS_NETWORK_STATE',
        'ACCESS_WIFI_STATE',
        'CHANGE_WIFI_MULTICAST_STATE',
        'POST_NOTIFICATIONS',
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
        'expo-image-picker',
        {
          cameraPermission: 'Upholstery needs the camera to photograph seating for catalog labels.',
          photosPermission: 'Allow access to save upholstery product photos.',
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission: 'Upholstery needs the camera to scan label QR codes and barcodes.',
        },
      ],
      [
        'expo-notifications',
        {
          color: '#38bdf8',
          defaultChannel: 'upholstery-alerts',
        },
      ],
    ],
    extra: {
      firebase,
      apiBase: (process.env.EXPO_PUBLIC_API_BASE || 'https://www.infinity-home.online').replace(/\/+$/, ''),
      googleWebClientId,
      googleAndroidClientId,
      appScheme: 'warehouse-upholstery',
      expoProjectFullName: '@alielboussi/warehouse-upholstery',
      eas: {
        projectId: '5ef60993-5974-4cc7-8d5a-283fbbf14d4b',
      },
    },
  },
};
