const firebase = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDH7wLdDQui32tzfdvXA5p1VBKxqLQbqjw',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'bestrest-portal-system-43108.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'bestrest-portal-system-43108',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'bestrest-portal-system-43108.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '876299148810',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:876299148810:web:ad26d0b2eeb499d39049f3',
};

module.exports = {
  expo: {
    name: 'Production',
    slug: 'warehouse-production',
    scheme: 'warehouse-production',
    platforms: ['android'],
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    android: {
      package: 'com.bestrest.warehouseproduction',
      googleServicesFile: './google-services.json',
      softwareKeyboardLayoutMode: 'resize',
    },
    extra: {
      firebase,
      apiBase: (process.env.EXPO_PUBLIC_API_BASE || 'https://www.infinity-home.online').replace(/\/+$/, ''),
    },
  },
};
