import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

export default function ManufactureProductGridCard({
  imageUrl,
  name,
  qty,
  busy = false,
  onPress,
  disabled = false,
}) {
  const qtyLabel = `×${Math.max(0, Math.floor(Number(qty) || 0))}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        busy && styles.cardBusy,
      ]}
    >
      <View style={styles.photoWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.photo} resizeMode="contain" />
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons name="image-off-outline" size={36} color={theme.textMuted} />
          </View>
        )}
        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>{qtyLabel}</Text>
        </View>
        {busy ? (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color={theme.primaryOnPrimary} />
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={2}>{name || '—'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.92, borderColor: theme.primary },
  cardBusy: { opacity: 0.7 },
  photoWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  photo: { width: '100%', height: '100%', backgroundColor: '#ffffff' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  qtyBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    alignItems: 'center',
  },
  qtyText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '800',
    color: theme.text,
    lineHeight: 18,
    minHeight: 46,
  },
});
