/**
 * Startup tweaks for low-RAM / older Android handsets (import once at top of App.js).
 */
import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';

enableScreens(true);

if (Platform.OS === 'android') {
  // Prefer smaller bitmap heap on devices that report low memory class.
  try {
    const { default: Device } = require('expo-device');
    if (Device?.totalMemory && Device.totalMemory < 2.5e9) {
      if (typeof globalThis !== 'undefined') {
        globalThis.__INFINITY_LOW_MEMORY_DEVICE__ = true;
      }
    }
  } catch {
    // expo-device optional in some shells
  }
}
