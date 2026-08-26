import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ensureFirebaseAuthToken,
  getFirebaseAuth,
  signInFirebase,
  signOutFirebase,
  subscribeFirebaseAuth,
} from '../../shared/firebase';
import { shouldForceSignOutForAccessCheck, verifyMobileLoginAccess } from '../../shared/loginAccess';
import { theme } from '../theme';

export function useFirebaseUser() {
  const [user, setUser] = useState(undefined);
  useEffect(() => subscribeFirebaseAuth((next) => setUser(next)), []);
  return user;
}

export default function EmailAuthGate({ children, title = 'Product Pricing' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const user = useFirebaseUser();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const verifiedUidRef = useRef('');

  useEffect(() => {
    let alive = true;
    if (!user) {
      verifiedUidRef.current = '';
      setAccessChecked(true);
      return undefined;
    }
    if (verifiedUidRef.current === user.uid) {
      setAccessChecked(true);
      return undefined;
    }
    setAccessChecked(false);
    (async () => {
      await ensureFirebaseAuthToken(true);
      const access = await verifyMobileLoginAccess();
      if (!alive) return;
      if (shouldForceSignOutForAccessCheck(access)) {
        verifiedUidRef.current = '';
        await signOutFirebase();
        setError(access.error || 'Login not allowed.');
      } else {
        verifiedUidRef.current = user.uid;
      }
      setAccessChecked(true);
    })();
    return () => { alive = false; };
  }, [user?.uid]);

  async function handleSignIn() {
    setError('');
    setBusy(true);
    try {
      await signInFirebase(email, password);
      await ensureFirebaseAuthToken(true);
      const access = await verifyMobileLoginAccess();
      if (shouldForceSignOutForAccessCheck(access)) {
        verifiedUidRef.current = '';
        await signOutFirebase();
        setError(access.error || 'Login not allowed.');
      } else if (getFirebaseAuth().currentUser?.uid) {
        verifiedUidRef.current = getFirebaseAuth().currentUser.uid;
      }
    } catch (err) {
      setError(err?.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined || (user && !accessChecked)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.border} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>Sign in with your portal email and password.</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={theme.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={handleSignIn} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
      </View>
    );
  }

  return <View style={styles.authedRoot}>{children}</View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  authedRoot: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.bg },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8, color: theme.text },
  hint: { color: theme.muted, marginBottom: 18, lineHeight: 20 },
  input: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    color: theme.text,
  },
  error: { color: theme.danger, marginBottom: 12 },
  button: {
    backgroundColor: theme.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#052018', fontWeight: '800', fontSize: 16 },
});
