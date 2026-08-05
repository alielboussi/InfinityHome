import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { Pressable, StyleSheet, Text } from 'react-native';
import { getFirebaseAuth } from './firebase';
import { verifyMobileLoginAccess } from './loginAccess';

WebBrowser.maybeCompleteAuthSession();

function getGoogleClientIds() {
  return {
    webClientId: String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim(),
    androidClientId: String(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '').trim(),
    iosClientId: String(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '').trim(),
  };
}

export function isGoogleSignInConfigured() {
  const { webClientId } = getGoogleClientIds();
  return Boolean(webClientId);
}

export function GoogleSignInButton({ onError, onSuccess, disabled }) {
  const { webClientId, androidClientId, iosClientId } = getGoogleClientIds();
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId,
    androidClientId: androidClientId || webClientId,
    iosClientId: iosClientId || webClientId,
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
      } catch (err) {
        onError?.(err?.message || 'Google sign-in failed.');
      } finally {
        setBusy(false);
      }
    })();
  }, [response, busy, onError, onSuccess]);

  if (!webClientId) return null;

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
