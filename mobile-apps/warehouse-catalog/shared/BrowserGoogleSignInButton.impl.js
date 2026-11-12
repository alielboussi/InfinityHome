import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { completeGoogleFirebaseSignIn } from './googleSignInFirebase';

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

export default function BrowserGoogleSignInButton({
  webClientId,
  androidClientId,
  iosClientId,
  redirectUri,
  onError,
  onSuccess,
  disabled,
  label = 'Continue with Google',
  busyLabel = 'Signing in…',
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
      onPress={() => promptAsync(
        Platform.OS === 'android'
          ? { showInRecents: true, createTask: true }
          : undefined,
      )}
      disabled={disabled || busy || !request}
    >
      <Text style={styles.buttonText}>{busy ? busyLabel : label}</Text>
    </Pressable>
  );
}
