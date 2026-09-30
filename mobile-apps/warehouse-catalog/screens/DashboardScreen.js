import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOutFirebase } from '../shared/firebase';
import { getMobileDashboardNavItems } from '../shared/mobileAccessManifest';

export default function DashboardScreen({ grant, userEmail, userDisplayName, navigation }) {
  const insets = useSafeAreaInsets();
  const items = getMobileDashboardNavItems(grant, userEmail);
  const [signingOut, setSigningOut] = useState(false);

  const openScreen = (item) => {
    navigation.navigate(item.routeName);
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutFirebase();
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 16) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          <Text style={styles.title}>Warehouse dashboard</Text>
          <Text style={styles.sub}>
            Enable Warehouse Products on /user-access to open the catalog.
          </Text>
          {items.length === 0 ? (
            <Text style={styles.hint}>No screens enabled — ask an administrator.</Text>
          ) : (
            items.map((item) => (
              <Pressable
                key={item.screenId}
                style={styles.btn}
                onPress={() => openScreen(item)}
              >
                <Text style={styles.btnText}>{item.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {(userDisplayName || userEmail) ? (
          <Text style={styles.footerName} numberOfLines={1}>
            {userDisplayName || userEmail}
          </Text>
        ) : null}
        <Pressable
          style={styles.signOutBtn}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  sub: {
    color: '#94a3b8',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  hint: { color: '#64748b', textAlign: 'center', lineHeight: 20 },
  btn: {
    backgroundColor: '#1e3a5f',
    borderColor: '#38bdf8',
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  btnText: { color: '#e2e8f0', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    alignItems: 'center',
  },
  footerName: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 10,
    textAlign: 'center',
    maxWidth: '100%',
  },
  signOutBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 160,
    alignItems: 'center',
  },
  signOutText: { color: '#93c5fd', fontSize: 16, fontWeight: '700' },
});
