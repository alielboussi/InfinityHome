import { StyleSheet, Text, View } from 'react-native';

export default function PlaceholderScreen({ route }) {
  const actionId = route?.params?.actionId || 'screen';
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Coming soon</Text>
      <Text style={styles.sub}>
        Screen <Text style={styles.code}>{actionId}</Text> — scan, forms, and Kitwe delivery flow are next implementation phases.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', padding: 20, justifyContent: 'center' },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  sub: { color: '#94a3b8', lineHeight: 22 },
  code: { fontFamily: 'monospace', color: '#38bdf8' },
});
