const fs = require('fs');
const path = require('path');

const firebase = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDH7wLdDQui32tzfdvXA5p1VBKxqLQbqjw',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'bestrest-portal-system-43108.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'bestrest-portal-system-43108',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'bestrest-portal-system-43108.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '876299148810',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:876299148810:android:9cb085a252a1f4939049f3',
};

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || '876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4.apps.googleusercontent.com';

function readAndroidOAuthClientIdFromGoogleServices() {
  try {
    const filePath = path.join(__dirname, 'google-services.json');
    if (!fs.existsSync(filePath)) return null;
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const client = (json.client || []).find(
      (row) => row?.client_info?.android_client_info?.package_name === 'com.bestrest.warehouseproduction',
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
    name: 'Production',
    owner: 'alielboussi',
    slug: 'warehouse-production',
    scheme: 'warehouse-production',
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
      package: 'com.bestrest.warehouseproduction',
      googleServicesFile: './google-services.json',
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
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: googleIosUrlScheme,
        },
      ],
      [
        'expo-image-picker',
        {
          cameraPermission: 'Production needs the camera to photograph seating for catalog labels.',
          photosPermission: 'Allow access to save production product photos.',
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission: 'Production needs the camera to scan label QR codes and barcodes.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#38bdf8',
          defaultChannel: 'production-alerts',
        },
      ],
    ],
    extra: {
      firebase,
      apiBase: (process.env.EXPO_PUBLIC_API_BASE || 'https://www.infinity-home.online').replace(/\/+$/, ''),
      googleWebClientId,
      googleAndroidClientId,
      appScheme: 'warehouse-production',
      expoProjectFullName: '@alielboussi/warehouse-production',
      eas: {
        projectId: '389abc8d-eca7-4746-8f90-26d9fed012d3',
      },
    },
  },
};
