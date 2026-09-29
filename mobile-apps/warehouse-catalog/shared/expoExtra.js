import Constants from 'expo-constants';

export function readExpoExtra() {
  return Constants.expoConfig?.extra
    || Constants.manifest2?.extra
    || Constants.manifest?.extra
    || {};
}
