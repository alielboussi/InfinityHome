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

const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  || '876299148810-gmf6hsqhi4nntp7u4iap1qvsvi3lh1d.apps.googleusercontent.com';

const googleIosUrlScheme = 'com.googleusercontent.apps.876299148810-s0rclhhohp8r7i6kh4c682b7erufhen4';

const appUrl = (process.env.EXPO_PUBLIC_APP_URL || 'https://www.infinity-home.online/lusaka-stock').replace(/\/+$/, '');

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'Lusaka Stock',
    slug: 'lusaka-stock',
    scheme: 'lusaka-stock',
    platforms: ['ios', 'android'],
    version: '1.0.2',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0f172a',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.bestrest.lusakastock',
    },
    android: {
      package: 'com.bestrest.lusakastock',
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0f172a',
      },
    },
    plugins: [
      'expo-asset',
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
      appUrl,
      googleWebClientId,
      googleAndroidClientId,
      expoProjectFullName: process.env.EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME || '@alielboussi/lusaka-stock',
      eas: {
        projectId: '6567a3a5-6145-489d-8cb4-600dcdaa9984',
      },
    },
  },
};
