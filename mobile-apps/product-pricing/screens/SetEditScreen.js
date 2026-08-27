import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchComboById,
  fetchComboItems,
  fetchProductsLookup,
  saveComboItems,
} from '../services/catalog';
import { theme } from '../theme';

export default function SetEditScreen({ navigation, route }) {
  const comboId = route.params?.comboId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [combo, setCombo] = useState(null);
  const [items, setItems] = useState([]);
  const [productLookup, setProductLookup] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [comboRow, comboItems, products] = await Promise.all([
        fetchComboById(comboId),
        fetchComboItems(comboId),
        fetchProductsLookup(),
      ]);
      if (!comboRow) {
        setError('Set not found.');
        return;
      }
      setCombo(comboRow);
      setItems(comboItems.map((row) => ({
        product_id: String(row.product_id),
        quantity: Math.max(1, Number(row.quantity) || 1),
      })));
      setProductLookup(products);
    } catch (err) {
      setError(err?.message || 'Failed to load set.');
    } finally {
      setLoading(false);
    }
  }, [comboId]);

  useEffect(() => {
    load();
  }, [load]);

  const productNameById = useMemo(() => {
    const map = new Map();
    productLookup.forEach((row) => map.set(String(row.id), row.name || row.sku || row.id));
    return map;
  }, [productLookup]);

  const addCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const existing = new Set(items.map((row) => String(row.product_id)));
    return productLookup
      .filter((row) => !existing.has(String(row.id)))
      .filter((row) => {
        if (!q) return true;
        const name = String(row.name || '').toLowerCase();
        const sku = String(row.sku || '').toLowerCase();
        return name.includes(q) || sku.includes(q);
      })
      .slice(0, 30);
  }, [productLookup, items, search]);

  const addComponent = (productId) => {
    const pid = String(productId);
    if (items.some((row) => String(row.product_id) === pid)) return;
    setItems((prev) => [...prev, { product_id: pid, quantity: 1 }]);
    setSearch('');
  };

  const removeComponent = (productId) => {
    setItems((prev) => prev.filter((row) => String(row.product_id) !== String(productId)));
  };

  const updateQuantity = (productId, quantity) => {
    const qty = Math.max(1, Number(quantity) || 1);
    setItems((prev) => prev.map((row) => (
      String(row.product_id) === String(productId)
        ? { ...row, quantity: qty }
        : row
    )));
  };

  const onSave = async () => {
    if (!combo) return;
    setSaving(true);
    setError('');
    try {
      await saveComboItems(combo.id, items);
      Alert.alert('Saved', 'Set components updated on the portal.');
      navigation.goBack();
    } catch (err) {
      setError(err?.message || 'Failed to save set components.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Products</Text>
        </Pressable>
        <Text style={styles.title}>Edit set components</Text>
        {combo ? <Text style={styles.subtitle}>{combo.name}</Text> : null}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.centered} size="large" color={theme.border} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Current components</Text>
          {items.length ? items.map((row) => (
            <View key={row.product_id} style={styles.itemRow}>
              <View style={styles.itemBody}>
                <Text style={styles.itemName}>{productNameById.get(String(row.product_id)) || row.product_id}</Text>
                <View style={styles.qtyRow}>
                  <Text style={styles.qtyLabel}>Qty</Text>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="number-pad"
                    value={String(row.quantity)}
                    onChangeText={(value) => updateQuantity(row.product_id, value)}
                  />
                </View>
              </View>
              <Pressable style={styles.removeButton} onPress={() => removeComponent(row.product_id)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          )) : (
            <Text style={styles.empty}>No components yet.</Text>
          )}

          <Text style={styles.sectionTitle}>Add component</Text>
          <TextInput
            style={styles.search}
            placeholder="Search product to add…"
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={setSearch}
          />
          <FlatList
            data={addCandidates}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable style={styles.addRow} onPress={() => addComponent(item.id)}>
                <Text style={styles.addName}>{item.name}</Text>
                {item.sku ? <Text style={styles.addSku}>SKU: {item.sku}</Text> : null}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No matching products.</Text>}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.primaryButton} onPress={onSave} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save set components'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  back: { color: theme.border, fontWeight: '700', marginBottom: 8 },
  title: { color: theme.text, fontSize: 24, fontWeight: '900' },
  subtitle: { color: theme.muted, marginTop: 4 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { marginTop: 40 },
  sectionTitle: { color: theme.text, fontWeight: '800', fontSize: 16, marginBottom: 10, marginTop: 8 },
  itemRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  itemBody: { flex: 1 },
  itemName: { color: theme.text, fontWeight: '700', marginBottom: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyLabel: { color: theme.muted, fontSize: 12 },
  qtyInput: {
    minWidth: 56,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: theme.text,
  },
  removeButton: {
    borderWidth: 1,
    borderColor: theme.danger,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  removeText: { color: theme.danger, fontWeight: '700', fontSize: 12 },
  search: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    marginBottom: 8,
  },
  addRow: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    padding: 12,
    marginBottom: 8,
  },
  addName: { color: theme.text, fontWeight: '700' },
  addSku: { color: theme.muted, fontSize: 12, marginTop: 2 },
  empty: { color: theme.muted, marginBottom: 12 },
  primaryButton: {
    backgroundColor: theme.border,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: { color: '#052018', fontWeight: '900', fontSize: 16 },
  error: { color: theme.danger, marginTop: 8 },
});
