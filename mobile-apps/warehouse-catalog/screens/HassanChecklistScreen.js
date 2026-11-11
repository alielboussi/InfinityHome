import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

export default function HassanChecklistScreen() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await warehouseMobileRequest('orders-kitwe-hassan-inbound');
      setLines(res?.lines || []);
    } catch (err) {
      setError(err?.message || 'Failed to load Hassan orders in Kitwe.');
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Hassan Awad orders in Kitwe</Text>
      <Text style={styles.body}>
        Finished items received from factory for Hassan Awad quotes — held in Kitwe until a future customer delivery release.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color="#38bdf8" style={{ marginVertical: 16 }} /> : (
        <FlatList
          data={lines}
          keyExtractor={(item) => `${item.quote_id}-${item.product_name}`}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<Text style={styles.body}>No Hassan quote stock in Kitwe yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.quote}>{item.quote_number || item.quote_id}</Text>
              <Text style={styles.product}>{item.product_name}</Text>
              <Text style={styles.qty}>Qty {item.quantity}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  body: { color: '#94a3b8', lineHeight: 22, marginBottom: 12 },
  error: { color: '#f87171', marginBottom: 8 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quote: { color: '#38bdf8', fontWeight: '800', marginBottom: 4 },
  product: { color: '#f1f5f9', fontWeight: '700', fontSize: 16 },
  qty: { color: '#cbd5e1', marginTop: 6, fontWeight: '700' },
});
