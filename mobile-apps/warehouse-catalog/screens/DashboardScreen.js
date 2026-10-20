import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOutFirebase } from '../shared/firebase';
import { invalidateWarehouseCatalogCache } from '../shared/warehouseCatalogStore';
import { getMobileDashboardNavItems, MOBILE_APP_DISPLAY_NAME } from '../shared/mobileAccessManifest';
import { theme } from '../shared/theme';

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
      invalidateWarehouseCatalogCache();
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
          { paddingTop: Math.max(insets.top, theme.space.lg) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          <Text style={styles.brand}>Infinity Home</Text>
          <Text style={styles.title}>{MOBILE_APP_DISPLAY_NAME}</Text>
          <Text style={styles.sub}>
            Add products and manage warehouse packet stock from the floor.
          </Text>
          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No access yet</Text>
              <Text style={styles.hint}>
                Ask an administrator to enable Warehouse Products for your account.
              </Text>
            </View>
          ) : (
            items.map((item) => (
              <Pressable
                key={item.screenId}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => openScreen(item)}
                accessibilityRole="button"
              >
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{item.label}</Text>
                </View>
                <Text style={styles.chevron} accessibilityElementsHidden>›</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.space.lg) }]}>
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
  root: { flex: 1, backgroundColor: theme.bg },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.space.xl,
    paddingBottom: theme.space.lg,
  },
  inner: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  brand: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: theme.space.xs,
  },
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: theme.space.sm,
    textAlign: 'center',
  },
  sub: {
    color: theme.textMuted,
    marginBottom: theme.space.xl,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 15,
  },
  emptyCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space.lg,
  },
  emptyTitle: { color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: theme.space.sm },
  hint: { color: theme.textDim, textAlign: 'center', lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    marginBottom: theme.space.md,
  },
  cardPressed: { backgroundColor: theme.surfaceElevated },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  chevron: { color: theme.primary, fontSize: 28, fontWeight: '300', marginLeft: theme.space.sm },
  footer: {
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    alignItems: 'center',
  },
  footerName: {
    color: theme.textDim,
    fontSize: 12,
    marginBottom: theme.space.sm,
    textAlign: 'center',
    maxWidth: '100%',
  },
  signOutBtn: {
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.xl,
    minWidth: 160,
    alignItems: 'center',
  },
  signOutText: { color: '#93c5fd', fontSize: 16, fontWeight: '700' },
});
