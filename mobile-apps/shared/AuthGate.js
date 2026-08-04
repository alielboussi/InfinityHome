import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getFirebaseIdToken,
  signInFirebase,
  signOutFirebase,
  subscribeFirebaseAuth,
} from './firebase';

export { getFirebaseIdToken };

export function useFirebaseUser() {
  const [user, setUser] = useState(undefined);

  useEffect(() => subscribeFirebaseAuth((next) => setUser(next)), []);

  return user;
}

export default function FirebaseAuthGate({ children }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const user = useFirebaseUser();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setError('');
    setBusy(true);
    try {
      await signInFirebase(email, password);
    } catch (err) {
      setError(err?.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutFirebase();
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Infinity Home</Text>
        <Text style={styles.hint}>Sign in with your Firebase email and password.</Text>
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
      </View>
    );
  }

  return (
    <View style={styles.authedRoot}>
      <View style={styles.userBar}>
        <Text style={styles.userEmail} numberOfLines={1}>{user.email || 'Signed in'}</Text>
        <Pressable onPress={handleSignOut} disabled={busy}>
          <Text style={styles.signOut}>{busy ? '…' : 'Sign out'}</Text>
        </Pressable>
      </View>
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
