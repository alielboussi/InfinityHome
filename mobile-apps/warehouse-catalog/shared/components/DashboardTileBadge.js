import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function formatDashboardBadgeCount(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v <= 0) return null;
  return v > 99 ? '99+' : String(v);
}

export default function DashboardTileBadge({ count }) {
  const label = formatDashboardBadgeCount(count);
  if (!label) return null;
  return (
    <View style={styles.wrap} accessibilityLabel={`${count} new notifications`}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: theme.danger || '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.card || '#fff',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
