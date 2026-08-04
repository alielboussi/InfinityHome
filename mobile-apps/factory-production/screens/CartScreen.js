import { useEffect, useState } from 'react';
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
import { approveFactoryTransfer, fetchLabelPrintHistory } from '../services/api';

export default function CartScreen({
  navigation,
  cart,
  onUpdateQty,
  onRemove,
  onClear,
  userId,
  userEmail,
  userFullName,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [transferNumber, setTransferNumber] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setHistoryLoading(true);
        const jobs = await fetchLabelPrintHistory(30);
        if (!active) return;
        const completed = jobs.filter((job) => {
          const status = String(job.status || '').toLowerCase();
          return ['done', 'completed', 'printed', 'success'].includes(status);
        });
        setHistory(completed.slice(0, 10));
      } catch (_err) {
        if (active) setHistory([]);
      } finally {
        if (active) setHistoryLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);

  async function handleSubmit() {
    if (!cart.length) {
      Alert.alert('Empty cart', 'Add at least one product before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      const result = await approveFactoryTransfer({
        userId: Number(userId) || 0,
        userEmail,
        userFullName,
        capturedAt: new Date().toISOString(),
        transferNumber: transferNumber.trim() || null,
        items: cart,
      });
      const message = [
        `Session: ${result.sessionId}`,
        result.transferNumber ? `Transfer: ${result.transferNumber}` : null,
        result.labelJobId ? `Label job: ${result.labelJobId}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      Alert.alert('Approved', message, [
        {
          text: 'OK',
          onPress: () => {
            onClear();
            navigation.navigate('Products');
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Submit failed', err.message || 'Could not approve transfer.');
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
        <Text style={styles.title}>Submit transfer</Text>
        <View style={{ width: 48 }} />
      </View>

      <TextInput
        style={styles.transferInput}
        placeholder="Transfer number (optional)"
        value={transferNumber}
        onChangeText={setTransferNumber}
      />

      <FlatList
        data={cart}
        keyExtractor={(item) => item.product.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.historyBox}>
            <Text style={styles.historyTitle}>Recent label jobs</Text>
            {historyLoading ? (
              <ActivityIndicator color="#0f766e" />
            ) : history.length ? (
              history.map((job) => (
                <Text key={job.id} style={styles.historyRow}>
                  {job.id} · {job.status}
                </Text>
              ))
            ) : (
              <Text style={styles.historyEmpty}>No recent jobs</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.name}>{item.product.name}</Text>
              {item.product.sku ? <Text style={styles.sku}>{item.product.sku}</Text> : null}
            </View>
            <TextInput
              style={styles.qtyInput}
              keyboardType="numeric"
              value={String(item.qty)}
              onChangeText={(text) => onUpdateQty(item.product.id, text)}
            />
            <Pressable onPress={() => onRemove(item.product.id)}>
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
            <Text style={styles.submitText}>Approve & queue labels</Text>
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
    backgroundColor: '#0f766e',
  },
  back: { color: '#fff', fontWeight: '600' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  transferInput: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  list: { padding: 12, paddingBottom: 120 },
  historyBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historyTitle: { fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  historyRow: { fontSize: 12, color: '#475569', marginBottom: 4 },
  historyEmpty: { fontSize: 12, color: '#94a3b8' },
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
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
