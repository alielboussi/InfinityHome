/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'Warehouse Catalog',
    slug: 'warehouse-catalog',
    scheme: 'warehouse-catalog',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    icon: './assets/icon.png',
    splash: {
      image: './assets/icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    android: {
      package: 'com.bestrest.warehousecatalog',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
    },
    plugins: [
      'expo-camera',
      [
        'expo-local-authentication',
        { faceIDPermission: 'Unlock Warehouse Catalog with Face ID.' },
      ],
    ],
    extra: {
      eas: { projectId: 'warehouse-catalog-draft' },
    },
  },
};
