const firebase = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDH7wLdDQui32tzfdvXA5p1VBKxqLQbqjw',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'bestrest-portal-system-43108.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'bestrest-portal-system-43108',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'bestrest-portal-system-43108.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '876299148810',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:876299148810:web:ad26d0b2eeb499d39049f3',
};

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'Product Photos',
    slug: 'product-pricing',
    scheme: 'product-pricing',
    platforms: ['ios', 'android'],
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0a0a08',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.bestrest.productpricing',
      infoPlist: {
        NSCameraUsageDescription: 'Scan product QR codes to open the catalog item.',
        NSPhotoLibraryUsageDescription: 'Choose a product photo to upload to the portal.',
      },
    },
    android: {
      package: 'com.bestrest.productpricing',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0a0a08',
      },
      permissions: ['CAMERA'],
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          image: './assets/splash.png',
          resizeMode: 'contain',
          backgroundColor: '#0a0a08',
          imageWidth: 280,
        },
      ],
      'expo-asset',
      'expo-font',
      [
        'expo-camera',
        {
          cameraPermission: 'Allow Product Pricing to scan product QR codes.',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow Product Pricing to upload product photos to the portal.',
        },
      ],
    ],
    extra: {
      firebase,
      apiBase: (process.env.EXPO_PUBLIC_API_BASE || 'https://www.infinity-home.online').replace(/\/+$/, ''),
    },
  },
};
