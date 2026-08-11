import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { Pressable, StyleSheet, Text } from 'react-native';
import { getFirebaseAuth, signOutFirebase } from './firebase';
import { verifyMobileLoginAccess } from './loginAccess';
import { DEFAULT_GOOGLE_WEB_CLIENT_ID } from './defaultFirebaseConfig';
import { readExpoExtra } from './expoExtra';

WebBrowser.maybeCompleteAuthSession();

const APP_SCHEME = Constants.expoConfig?.scheme
  || process.env.EXPO_PUBLIC_APP_SCHEME
  || 'customer-ledger-tracking';

const REDIRECT_URI = makeRedirectUri({
  scheme: APP_SCHEME,
  path: 'oauth',
});

function getGoogleClientIds() {
  const extra = readExpoExtra();
  const webClientId = String(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    || extra.googleWebClientId
    || DEFAULT_GOOGLE_WEB_CLIENT_ID,
  ).trim();
  return {
    webClientId,
    iosClientId: String(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || extra.googleIosClientId || '').trim(),
  };
}

export function isGoogleSignInConfigured() {
  const { webClientId } = getGoogleClientIds();
  return Boolean(webClientId);
}

async function completeGoogleFirebaseSignIn(idToken, onError, onSuccess) {
  if (!idToken) {
    onError?.('Google sign-in did not return an ID token.');
    return;
  }
  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(getFirebaseAuth(), credential);
  const access = await verifyMobileLoginAccess();
  if (!access.ok) {
    await signOutFirebase();
    onError?.(access.error || 'Login not allowed.');
    return;
  }
  onSuccess?.();
}

function NativeGoogleSignInButton({ webClientId, onError, onSuccess, disabled }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId,
      offlineAccess: false,
    });
  }, [webClientId]);

  const onPress = async () => {
    setBusy(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (response.type !== 'success') {
        if (response.type === 'cancelled') return;
        onError?.('Google sign-in failed.');
        return;
      }
      const idToken = response.data?.idToken;
      await completeGoogleFirebaseSignIn(idToken, onError, onSuccess);
    } catch (err) {
      onError?.(err?.message || 'Google sign-in failed.');
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

function BrowserGoogleSignInButton({ webClientId, iosClientId, onError, onSuccess, disabled }) {
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId,
    ...(iosClientId ? { iosClientId } : {}),
    redirectUri: REDIRECT_URI,
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
  const { webClientId, iosClientId } = getGoogleClientIds();

  if (!webClientId) return null;

  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    return (
      <NativeGoogleSignInButton
        webClientId={webClientId}
        onError={onError}
        onSuccess={onSuccess}
        disabled={disabled}
      />
    );
  }

  return (
    <BrowserGoogleSignInButton
      webClientId={webClientId}
      iosClientId={iosClientId}
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
});
