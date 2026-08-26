import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOutFirebase } from '../../shared/firebase';
import { PORTAL_LOCATIONS } from '../../shared/locationIds';
import { theme } from '../theme';

const LOCATION_KEY = 'product-pricing:location-id';

export async function loadSavedLocationId() {
  try {
    const saved = await AsyncStorage.getItem(LOCATION_KEY);
    if (saved && PORTAL_LOCATIONS.some((row) => row.id === saved)) return saved;
  } catch {}
  return PORTAL_LOCATIONS[0].id;
}

export async function saveLocationId(locationId) {
  await AsyncStorage.setItem(LOCATION_KEY, String(locationId));
}

export default function DashboardScreen({ navigation, userEmail }) {
  const [locationId, setLocationId] = useState(PORTAL_LOCATIONS[0].id);

  useEffect(() => {
    loadSavedLocationId().then(setLocationId);
  }, []);

  const selectedLocation = PORTAL_LOCATIONS.find((row) => row.id === locationId) || PORTAL_LOCATIONS[0];

  const onOpenCatalog = async () => {
    await saveLocationId(locationId);
    navigation.navigate('Catalog', { locationId, locationName: selectedLocation.name });
  };

  const onLogout = () => {
    Alert.alert('Log out', 'Sign out of Product Pricing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => signOutFirebase().catch(() => {}),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Infinity Home</Text>
          <Text style={styles.title}>Product Pricing</Text>
          <Text style={styles.subtitle}>Update portal prices & photos</Text>
        </View>
        <Pressable onPress={onLogout}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Signed in</Text>
        <Text style={styles.cardValue}>{userEmail || 'Portal user'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Pricing location</Text>
        <Text style={styles.cardHint}>Matches products-list when one location is selected.</Text>
        <View style={styles.locationRow}>
          {PORTAL_LOCATIONS.map((location) => {
            const active = location.id === locationId;
            return (
              <Pressable
                key={location.id}
                style={[styles.locationChip, active && styles.locationChipActive]}
                onPress={() => setLocationId(location.id)}
              >
                <Text style={[styles.locationChipText, active && styles.locationChipTextActive]}>
                  {location.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable style={styles.primaryButton} onPress={onOpenCatalog}>
        <Text style={styles.primaryButtonText}>Browse products</Text>
      </Pressable>

      <Text style={styles.footerNote}>
        Changes save to Firestore and appear on the portal products-list immediately.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
  eyebrow: { color: theme.muted, fontSize: 12, marginBottom: 4 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.accent, marginTop: 4, fontSize: 14 },
  logout: { color: theme.border, fontWeight: '700' },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 14,
    marginBottom: 14,
  },
  cardLabel: { color: theme.muted, fontSize: 12, marginBottom: 6 },
  cardValue: { color: theme.text, fontWeight: '700', fontSize: 15 },
  cardHint: { color: theme.muted, fontSize: 12, marginBottom: 10, lineHeight: 18 },
  locationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationChip: {
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.surfaceAlt,
  },
  locationChipActive: {
    borderColor: theme.border,
    backgroundColor: 'rgba(30, 215, 168, 0.12)',
  },
  locationChipText: { color: theme.muted, fontWeight: '700' },
  locationChipTextActive: { color: theme.border },
  primaryButton: {
    backgroundColor: theme.border,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#052018', fontWeight: '900', fontSize: 16 },
  footerNote: { color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 16 },
});
