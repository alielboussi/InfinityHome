/**
 * Delivery app reuses warehouse-production via deliveryKit — keep these deps aligned with
 * mobile-apps/warehouse-production/package.json for anything Kitwe send / shared / scan uses.
 */
module.exports = [
  '@expo/vector-icons',
  '@react-native-async-storage/async-storage',
  '@react-native-google-signin/google-signin',
  '@react-navigation/native',
  '@react-navigation/native-stack',
  'expo-auth-session',
  'expo-camera',
  'expo-constants',
  'expo-crypto',
  'expo-device',
  'expo-file-system',
  'expo-font',
  'expo-image-manipulator',
  'expo-image-picker',
  'expo-print',
  'expo-sharing',
  'expo-status-bar',
  'expo-web-browser',
  'firebase',
  'react',
  'react-native',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  'react-native-view-shot',
  'react-native-zeroconf',
];
