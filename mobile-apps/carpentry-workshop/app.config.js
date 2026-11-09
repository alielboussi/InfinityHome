const fs = require('fs');
const path = require('path');

const CARPENTRY_PACKAGE = 'online.infinityhome.carpentry';

function readFromGoogleServices() {
  try {
    const filePath = path.join(__dirname, 'google-services.json');
    if (!fs.existsSync(filePath)) return {};
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const client = (json.client || []).find(
      (row) => row?.client_info?.android_client_info?.package_name === CARPENTRY_PACKAGE,
    );
    const androidOAuth = (client?.oauth_client || []).find((row) => Number(row.client_type) === 1);
    return {
      appId: client?.client_info?.mobilesdk_app_id || null,
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
    || '1:876299148810:android:c709c380f8fdcf669049f3',
};

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || '876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4.apps.googleusercontent.com';

const googleIosUrlScheme = 'com.googleusercontent.apps.876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4';

const { finalizeExpoConfig } = require('../shared/expoAndroidLightweight');

module.exports = {
  expo: finalizeExpoConfig({
    name: 'Carpentry',
    owner: 'alielboussi',
    slug: 'infinity-carpentry-workshop',
    scheme: 'infinity-carpentry',
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
      package: 'online.infinityhome.carpentry',
      softwareKeyboardLayoutMode: 'resize',
      permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'],
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
      [
        'expo-image-picker',
        {
          cameraPermission: 'Carpentry needs the camera to photograph items for catalog labels.',
          photosPermission: 'Allow access to save carpentry product photos.',
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission: 'Carpentry needs the camera to scan label QR codes and barcodes.',
        },
      ],
    ],
    extra: {
      eas: {
        projectId: 'c3fbf07e-ecd4-46d1-b6ff-1eddba06858c',
      },
      firebase,
      apiBase: (process.env.EXPO_PUBLIC_API_BASE || 'https://www.infinity-home.online').replace(/\/+$/, ''),
      googleWebClientId,
      googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
        || fromGoogle.androidClientId
        || googleWebClientId,
      appScheme: 'infinity-carpentry',
      /** Expo Go Google sign-in → https://auth.expo.io/@alielboussi/<slug> */
      expoProjectFullName: '@alielboussi/infinity-carpentry-workshop',
    },
  }),
};
