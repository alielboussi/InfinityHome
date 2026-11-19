/**
 * Startup tweaks for low-RAM / older Android handsets (import once at top of App.js).
 */
import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';

enableScreens(true);

function probeLowMemoryAndroid() {
  try {
    const mod = require('expo-device');
    const Device = mod?.default ?? mod;
    if (Device?.totalMemory && Device.totalMemory < 2.5e9) {
      if (typeof globalThis !== 'undefined') {
        globalThis.__INFINITY_LOW_MEMORY_DEVICE__ = true;
      }
    }
  } catch {
    // expo-device optional in some shells
  }
}

if (Platform.OS === 'android') {
  // expo-device loads native modules; defer until after Expo runtime is ready.
  const defer = typeof setImmediate === 'function' ? setImmediate : (fn) => setTimeout(fn, 0);
  defer(probeLowMemoryAndroid);
}