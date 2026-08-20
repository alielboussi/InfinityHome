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
  getFirebaseIdToken,
  signInFirebase,
  signOutFirebase,
  subscribeFirebaseAuth,
} from './firebase';
import { GoogleSignInButton, isGoogleSignInConfigured } from './GoogleSignInButton';
import { shouldForceSignOutForAccessCheck, verifyMobileLoginAccess } from './loginAccess';

export { getFirebaseIdToken };

export function useFirebaseUser() {
  const [user, setUser] = useState(undefined);

  useEffect(() => subscribeFirebaseAuth((next) => setUser(next)), []);

  return user;
}

export default function FirebaseAuthGate({
  children,
  title = 'Infinity Home',
  showUserBar = true,
  staySignedIn = true,
}) {
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

    if (staySignedIn && verifiedUidRef.current === user.uid) {
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
    return () => {
      alive = false;
    };
  }, [staySignedIn, user?.uid]);

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

  async function handleSignOut() {
    setBusy(true);
    try {
      verifiedUidRef.current = '';
      await signOutFirebase();
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined || (user && !accessChecked)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>Sign in with Google or your Firebase email and password.</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={handleSignIn} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
        {isGoogleSignInConfigured() ? (
          <GoogleSignInButton
            disabled={busy}
            onError={(message) => setError(message || 'Google sign-in failed')}
            onSuccess={() => setError('')}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.authedRoot}>
      {showUserBar ? (
        <View style={styles.userBar}>
          <Text style={styles.userEmail} numberOfLines={1}>{user.email || 'Signed in'}</Text>
          <Pressable onPress={handleSignOut} disabled={busy}>
            <Text style={styles.signOut}>{busy ? '…' : 'Sign out'}</Text>
          </Pressable>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  authedRoot: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  hint: { color: '#64748b', marginBottom: 16 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  error: { color: '#b91c1c', marginBottom: 10 },
  button: {
    backgroundColor: '#1e40af',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  userBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
  },
  userEmail: { color: '#e2e8f0', flex: 1, marginRight: 12, fontSize: 13 },
  signOut: { color: '#93c5fd', fontWeight: '700', fontSize: 13 },
});
