import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchWarehouseProducts } from '../services/products';

export default function ProductListScreen({ navigation, cart, onAddToCart }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const rows = await fetchWarehouseProducts();
        if (active) setProducts(rows);
      } catch (err) {
        if (active) setError(err.message || 'Failed to load products');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q))
    );
  });

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Warehouse Products</Text>
        <Pressable style={styles.cartButton} onPress={() => navigation.navigate('Cart')}>
          <Text style={styles.cartButtonText}>Cart ({cartCount})</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search by name or SKU"
        value={search}
        onChangeText={setSearch}
      />

      {loading ? (
        <ActivityIndicator style={styles.centered} size="large" color="#1e40af" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onAddToCart(item)}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                {item.sku ? <Text style={styles.sku}>{item.sku}</Text> : null}
              </View>
              <Text style={styles.add}>+</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No products found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1e40af',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cartButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cartButtonText: { color: '#1e40af', fontWeight: '700' },
  search: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  sku: { fontSize: 13, color: '#64748b', marginTop: 2 },
  add: { fontSize: 24, color: '#1e40af', fontWeight: '700', paddingLeft: 12 },
  centered: { marginTop: 40 },
  error: { color: '#b91c1c', padding: 16, textAlign: 'center' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 24 },
});
