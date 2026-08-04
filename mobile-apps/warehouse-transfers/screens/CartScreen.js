import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FROM_LOCATION_NAME, TO_LOCATION_NAME } from '../config';
import { submitDelivery } from '../services/delivery';
import { uuid } from '../../shared/uuid';

export default function CartScreen({
  navigation,
  cart,
  onUpdateQty,
  onRemove,
  onClear,
  userEmail,
  userName,
  idempotencyKey,
  onIdempotencyKeyChange,
}) {
  const [submitting, setSubmitting] = useState(false);

  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  async function handleSubmit() {
    if (!cart.length) {
      Alert.alert('Empty cart', 'Add at least one product before submitting.');
      return;
    }

    const key = idempotencyKey || uuid();
    if (!idempotencyKey) onIdempotencyKeyChange(key);

    try {
      setSubmitting(true);
      const result = await submitDelivery({
        items: cart,
        userEmail,
        userName,
        idempotencyKey: key,
      });
      Alert.alert('Submitted', `Delivery session ${result.sessionId} created.`, [
        {
          text: 'OK',
          onPress: () => {
            onClear();
            onIdempotencyKeyChange(null);
            navigation.navigate('Products');
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Submit failed', err.message || 'Could not submit delivery.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Cart</Text>
        <View style={{ width: 48 }} />
      </View>

      <Text style={styles.route}>
        {FROM_LOCATION_NAME} → {TO_LOCATION_NAME}
      </Text>

      <FlatList
        data={cart}
        keyExtractor={(item) => item.productId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.name}>{item.name}</Text>
              {item.sku ? <Text style={styles.sku}>{item.sku}</Text> : null}
            </View>
            <TextInput
              style={styles.qtyInput}
              keyboardType="numeric"
              value={String(item.quantity)}
              onChangeText={(text) => onUpdateQty(item.productId, text)}
            />
            <Pressable onPress={() => onRemove(item.productId)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Cart is empty.</Text>}
      />

      <View style={styles.footer}>
        <Text style={styles.total}>Total qty: {totalQty}</Text>
        <Pressable
          style={[styles.submit, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit delivery</Text>
          )}
        </Pressable>
      </View>
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
  back: { color: '#fff', fontWeight: '600' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  route: {
    padding: 12,
    textAlign: 'center',
    color: '#334155',
    backgroundColor: '#e2e8f0',
  },
  list: { padding: 12, paddingBottom: 120 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  sku: { fontSize: 12, color: '#64748b' },
  qtyInput: {
    width: 56,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingVertical: 6,
    marginHorizontal: 8,
    backgroundColor: '#fff',
  },
  remove: { color: '#b91c1c', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 24 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  total: { marginBottom: 10, fontWeight: '600', color: '#0f172a' },
  submit: {
    backgroundColor: '#15803d',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
