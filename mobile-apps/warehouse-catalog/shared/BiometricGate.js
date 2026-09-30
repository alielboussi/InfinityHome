import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  getBiometricUnlockInFlight,
  isBiometricSessionUnlocked,
  setBiometricSessionUnlocked,
  setBiometricUnlockInFlight,
} from './biometricSession';

async function performUnlock() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) {
    return { success: true };
  }
  return LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Warehouse Catalog',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
}

async function ensureBiometricUnlock() {
  if (isBiometricSessionUnlocked()) {
    return { success: true };
  }
  const inFlight = getBiometricUnlockInFlight();
  if (inFlight) {
    return inFlight;
  }
  const promise = performUnlock()
    .then((result) => {
      if (result.success) {
        setBiometricSessionUnlocked(true);
      }
      return result;
    })
    .finally(() => {
      setBiometricUnlockInFlight(null);
    });
  setBiometricUnlockInFlight(promise);
  return promise;
}

/**
 * After Firebase sign-in, optionally unlock with device biometrics (PIN fallback).
 */
export default function BiometricGate({ children }) {
  const [ready, setReady] = useState(() => isBiometricSessionUnlocked());
  const [error, setError] = useState('');

  async function unlock() {
    setError('');
    const result = await ensureBiometricUnlock();
    if (result.success) {
      setReady(true);
      return;
    }
    setError(result.error || 'Biometric unlock failed');
  }

  useEffect(() => {
    if (isBiometricSessionUnlocked()) {
      setReady(true);
      return undefined;
    }
    unlock();
    return undefined;
  }, []);

  if (ready) return children;

  return (
    <View style={styles.wrap}>
      {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator size="large" color="#38bdf8" />}
      <Pressable style={styles.btn} onPress={unlock}>
        <Text style={styles.btnText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#f87171', marginBottom: 16, textAlign: 'center' },
  btn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#1e293b', borderRadius: 8 },
  btnText: { color: '#e2e8f0', fontWeight: '600' },
});
