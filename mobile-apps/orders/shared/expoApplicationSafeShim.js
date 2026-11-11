import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';

/**
 * expo-application uses requireNativeModule('ExpoApplication'), which throws in Expo Go
 * when the native module is missing. Resolve this file from Metro instead.
 */
export const ApplicationReleaseType = Object.freeze({
  UNKNOWN: 0,
  SIMULATOR: 1,
  ENTERPRISE: 2,
  DEVELOPMENT: 3,
  AD_HOC: 4,
  APP_STORE: 5,
});

let native = null;
try {
  native = requireOptionalNativeModule('ExpoApplication');
} catch {
  native = null;
}

const fallbackId = String(
  Constants.expoConfig?.android?.package
  || Constants.expoConfig?.ios?.bundleIdentifier
  || '',
).trim() || null;

export const nativeApplicationVersion = native?.nativeApplicationVersion
  || Constants.expoConfig?.version
  || null;
export const nativeBuildVersion = native?.nativeBuildVersion
  || (Constants.expoConfig?.android?.versionCode != null
    ? String(Constants.expoConfig.android.versionCode)
    : null);
export const applicationName = native?.applicationName || Constants.expoConfig?.name || null;
export const applicationId = native?.applicationId || fallbackId;

export function getAndroidId() {
  return native?.androidId ?? null;
}

export async function getInstallReferrerAsync() {
  if (typeof native?.getInstallReferrerAsync === 'function') {
    return native.getInstallReferrerAsync();
  }
  return null;
}

export async function getIosIdForVendorAsync() {
  if (typeof native?.getIosIdForVendorAsync === 'function') {
    return native.getIosIdForVendorAsync();
  }
  return null;
}

export async function getIosApplicationReleaseTypeAsync() {
  if (typeof native?.getApplicationReleaseTypeAsync === 'function') {
    return native.getApplicationReleaseTypeAsync();
  }
  return ApplicationReleaseType.UNKNOWN;
}

export async function getAppleStoreEnvironmentAsync() {
  if (typeof native?.getStoreEnvironmentAsync === 'function') {
    return native.getStoreEnvironmentAsync();
  }
  return null;
}

export async function getIosPushNotificationServiceEnvironmentAsync() {
  if (typeof native?.getPushNotificationServiceEnvironmentAsync === 'function') {
    return native.getPushNotificationServiceEnvironmentAsync();
  }
  return null;
}

export async function getInstallationTimeAsync() {
  if (typeof native?.getInstallationTimeAsync === 'function') {
    const installationTime = await native.getInstallationTimeAsync();
    return installationTime != null ? new Date(installationTime) : null;
  }
  return null;
}

export async function getLastUpdateTimeAsync() {
  if (typeof native?.getLastUpdateTimeAsync === 'function') {
    const lastUpdateTime = await native.getLastUpdateTimeAsync();
    return lastUpdateTime != null ? new Date(lastUpdateTime) : null;
  }
  return null;
}

export default native;
