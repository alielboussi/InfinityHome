import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

export default function PacketFormScreen({ route, navigation }) {
  const prefill = route.params?.prefill || {};
  const existing = Boolean(route.params?.existing && prefill.id);
  const warehouseLocationId = route.params?.warehouseLocationId;

  const [sku, setSku] = useState(prefill.sku || '');
  const [name, setName] = useState(prefill.name || '');
  const [packetNumber, setPacketNumber] = useState(
    prefill.packet_number != null ? String(prefill.packet_number) : '',
  );
  const [initialQty, setInitialQty] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const title = useMemo(() => (existing ? 'Packet (known SKU)' : 'New packet'), [existing]);

  const onSave = async () => {
    if (existing) {
      setNotice('Edit on mobile is Phase 2 — open web warehouse for changes.');
      return;
    }
    if (!warehouseLocationId) {
      setError('Warehouse location is not configured.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await warehouseMobileRequest('packet-create', {
        sku: sku.trim(),
        name: name.trim(),
        packet_number: Number(packetNumber),
        qty_per_unit: 1,
        warehouse_location_id: warehouseLocationId,
        initial_quantity: Number(initialQty) || 0,
      });
      setNotice('Packet created.');
      setTimeout(() => navigation.navigate('WarehouseProducts'), 800);
    } catch (err) {
      setError(err?.message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Field label="SKU (Code 128)" value={sku} onChangeText={setSku} editable={!existing} mono />
      <Field label="Name" value={name} onChangeText={setName} />
      <Field
        label="Packet #"
        value={packetNumber}
        onChangeText={setPacketNumber}
        keyboardType="number-pad"
      />
      <View style={styles.field}>
        <Text style={styles.label}>Qty per product</Text>
        <Text style={styles.lockedValue}>1 (fixed)</Text>
      </View>
      {!existing && (
        <Field
          label="Qty on hand (warehouse)"
          value={initialQty}
          onChangeText={setInitialQty}
          keyboardType="number-pad"
        />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {!existing && (
        <Pressable style={styles.btn} onPress={onSave} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Saving…' : 'Create packet'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Field({ label, value, onChangeText, editable = true, keyboardType, mono }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled, mono && styles.mono]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        placeholderTextColor="#64748b"
        autoCapitalize={mono ? 'characters' : 'sentences'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, backgroundColor: '#0f172a', flexGrow: 1 },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { color: '#94a3b8', marginBottom: 6 },
  lockedValue: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#64748b',
    backgroundColor: '#1e293b',
  },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
  },
  mono: { fontFamily: 'monospace' },
  inputDisabled: { opacity: 0.7 },
  btn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#e2e8f0', fontWeight: '600' },
  error: { color: '#f87171', marginTop: 8 },
  notice: { color: '#4ade80', marginTop: 8 },
});
