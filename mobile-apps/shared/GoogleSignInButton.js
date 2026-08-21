import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirebaseAuth, signOutFirebase, ensureFirebaseAuthToken } from './firebase';
import { shouldForceSignOutForAccessCheck, verifyMobileLoginAccess } from './loginAccess';
import {
  DEFAULT_GOOGLE_ANDROID_CLIENT_ID,
  DEFAULT_GOOGLE_WEB_CLIENT_ID,
} from './defaultFirebaseConfig';
import { readExpoExtra } from './expoExtra';

WebBrowser.maybeCompleteAuthSession();

const APP_SCHEME = Constants.expoConfig?.scheme
  || process.env.EXPO_PUBLIC_APP_SCHEME
  || 'customer-ledger-tracking';

const DEFAULT_EXPO_PROJECT_FULL_NAME = '@alielboussi/customer-ledger-tracking';

function isExpoGo() {
  return Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
}

function getExpoProjectFullName() {
  const extra = readExpoExtra();
  return String(
    Constants.expoConfig?.originalFullName
    || extra.expoProjectFullName
    || process.env.EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME
    || DEFAULT_EXPO_PROJECT_FULL_NAME,
  ).trim();
}

function resolveGoogleOAuthConfig() {
  const { webClientId, androidClientId, iosClientId } = getGoogleClientIds();

  if (isExpoGo()) {
    const projectFullName = getExpoProjectFullName();
    return {
      webClientId,
      // Expo Go uses a browser OAuth flow — must use the Web client ID, not the APK Android client.
      androidClientId: webClientId,
      iosClientId: iosClientId || webClientId,
      redirectUri: `https://auth.expo.io/${projectFullName}`,
      expoGo: true,
    };
  }

  return {
    webClientId,
    androidClientId,
    iosClientId,
    redirectUri: makeRedirectUri({
      scheme: APP_SCHEME,
      path: 'oauth',
    }),
    expoGo: false,
  };
}

function getGoogleClientIds() {
  const extra = readExpoExtra();
  const webClientId = String(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    || extra.googleWebClientId
    || DEFAULT_GOOGLE_WEB_CLIENT_ID,
  ).trim();
  const androidClientId = String(
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    || extra.googleAndroidClientId
    || DEFAULT_GOOGLE_ANDROID_CLIENT_ID
    || webClientId,
  ).trim();
  return {
    webClientId,
    androidClientId,
    iosClientId: String(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || extra.googleIosClientId || '').trim(),
  };
}

export function isGoogleSignInConfigured() {
  const { webClientId } = getGoogleClientIds();
  return Boolean(webClientId);
}

function formatGoogleSignInError(err, nativeHelpers = null) {
  const { isErrorWithCode, statusCodes } = nativeHelpers || {};
  if (typeof isErrorWithCode === 'function' && isErrorWithCode(err)) {
    if (err.code === statusCodes?.SIGN_IN_CANCELLED) return '';
    if (err.code === statusCodes?.IN_PROGRESS) return 'Google sign-in is already in progress.';
    if (err.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
      return 'Google Play Services is missing or outdated on this device.';
    }
    if (err.code === '10' || err.code === 10) {
      return 'Google sign-in is not configured for this app build yet. Install the latest Ledger APK or contact support.';
    }
  }
  const message = String(err?.message || err || 'Google sign-in failed.');
  if (/DEVELOPER_ERROR/i.test(message) || /error code:\s*10/i.test(message)) {
    return 'Google sign-in is not configured for this app build yet. Install the latest Ledger APK or contact support.';
  }
  return message;
}

async function completeGoogleFirebaseSignIn(idToken, onError, onSuccess) {
  if (!idToken) {
    onError?.('Google sign-in did not return an ID token.');
    return;
  }
  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(getFirebaseAuth(), credential);
  await ensureFirebaseAuthToken(true);
  const access = await verifyMobileLoginAccess();
  if (shouldForceSignOutForAccessCheck(access)) {
    await signOutFirebase();
    onError?.(access.error || 'Login not allowed.');
    return;
  }
  onSuccess?.();
}

async function loadNativeGoogleSignIn() {
  return import('@react-native-google-signin/google-signin');
}

async function resolveGoogleIdToken(response, GoogleSignin) {
  const directToken = response?.data?.idToken || response?.idToken;
  if (directToken) return directToken;
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens?.idToken || null;
  } catch {
    return null;
  }
}

function NativeGoogleSignInButton({ webClientId, onError, onSuccess, disabled }) {
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    setBusy(true);
    try {
      const {
        GoogleSignin,
        isErrorWithCode,
        statusCodes,
      } = await loadNativeGoogleSignIn();

      GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
        scopes: ['email', 'profile'],
      });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (response?.type === 'cancelled') return;
      if (response?.type && response.type !== 'success') {
        onError?.('Google sign-in failed.');
        return;
      }
      const idToken = await resolveGoogleIdToken(response, GoogleSignin);
      await completeGoogleFirebaseSignIn(idToken, onError, onSuccess);
    } catch (err) {
      let nativeHelpers = null;
      try {
        nativeHelpers = await loadNativeGoogleSignIn();
      } catch {
        nativeHelpers = null;
      }
      const message = formatGoogleSignInError(err, nativeHelpers);
      if (message) onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      style={[styles.button, (disabled || busy) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Continue with Google'}</Text>
    </Pressable>
  );
}

function BrowserGoogleSignInButton({
  webClientId,
  androidClientId,
  iosClientId,
  redirectUri,
  onError,
  onSuccess,
  disabled,
}) {
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId,
    ...(Platform.OS === 'android' ? { androidClientId: androidClientId || webClientId } : {}),
    ...(iosClientId ? { iosClientId } : {}),
    redirectUri,
  });

  useEffect(() => {
    if (!response || busy) return;
    (async () => {
      if (response.type !== 'success') {
        if (response.type === 'error') {
          onError?.(response.error?.message || 'Google sign-in failed.');
        }
        return;
      }
      setBusy(true);
      try {
        const idToken = response.params?.id_token || response.authentication?.idToken;
        await completeGoogleFirebaseSignIn(idToken, onError, onSuccess);
      } catch (err) {
        onError?.(err?.message || 'Google sign-in failed.');
      } finally {
        setBusy(false);
      }
    })();
  }, [response, busy, onError, onSuccess]);

  return (
    <Pressable
      style={[styles.button, (disabled || busy || !request) && styles.buttonDisabled]}
      onPress={() => promptAsync()}
      disabled={disabled || busy || !request}
    >
      <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Continue with Google'}</Text>
    </Pressable>
  );
}

export function GoogleSignInButton({ onError, onSuccess, disabled }) {
  const oauth = resolveGoogleOAuthConfig();

  if (!oauth.webClientId) return null;

  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    if (isExpoGo()) {
      if (Platform.OS === 'android') {
        return (
          <>
            <BrowserGoogleSignInButton
              webClientId={oauth.webClientId}
              androidClientId={oauth.androidClientId}
              iosClientId={oauth.iosClientId}
              redirectUri={oauth.redirectUri}
              onError={onError}
              onSuccess={onSuccess}
              disabled={disabled}
            />
            <Text style={styles.expoGoHint}>
              Expo Go: if Google fails, use email/password or install the Ledger APK.
            </Text>
          </>
        );
      }

      return (
        <BrowserGoogleSignInButton
          webClientId={oauth.webClientId}
          androidClientId={oauth.androidClientId}
          iosClientId={oauth.iosClientId}
          redirectUri={oauth.redirectUri}
          onError={onError}
          onSuccess={onSuccess}
          disabled={disabled}
        />
      );
    }

    return (
      <NativeGoogleSignInButton
        webClientId={oauth.webClientId}
        onError={onError}
        onSuccess={onSuccess}
        disabled={disabled}
      />
    );
  }

  return (
    <BrowserGoogleSignInButton
      webClientId={oauth.webClientId}
      androidClientId={oauth.androidClientId}
      iosClientId={oauth.iosClientId}
      redirectUri={oauth.redirectUri}
      onError={onError}
      onSuccess={onSuccess}
      disabled={disabled}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  expoGoHint: {
    marginTop: 10,
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
