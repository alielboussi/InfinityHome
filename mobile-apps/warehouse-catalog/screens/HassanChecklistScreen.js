import { StyleSheet, Text, View } from 'react-native';

/** Partial receive UI ships in Phase 2 — web portal is primary for Hassan today. */
export default function HassanChecklistScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Receive delivery</Text>
      <Text style={styles.body}>
        Use the Warehouse Deliveries page on the Kitwe portal to tick lines and partial-receive stock.
        Mobile checklist will mirror that flow in Phase 2.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  body: { color: '#94a3b8', lineHeight: 22 },
});
