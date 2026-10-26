import { useCallback, useEffect, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import { theme } from '../shared/theme';

export default function KitweSendHomeScreen({ navigation }) {
  const route = useRoute();
  const [sessionId, setSessionId] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const boot = useCallback(async () => {
    setError('');
    try {
      const [sess, drv] = await Promise.all([
        warehouseMobileRequest('delivery-session-open'),
        warehouseMobileRequest('delivery-drivers-list'),
      ]);
      setSessionId(sess.session_id);
      setDeliveryNumber(sess.delivery_number);
      setDrivers(drv.drivers || []);
    } catch (err) {
      setError(err?.message || 'Could not start delivery session.');
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    const added = route.params?.addedGroup;
    if (added?.assembly_id) {
      setGroups((prev) => {
        const rest = prev.filter((g) => String(g.assembly_id) !== String(added.assembly_id));
        return [...rest, added];
      });
      navigation.setParams({ addedGroup: undefined });
    }
  }, [route.params?.addedGroup, navigation]);

  const submit = async () => {
    if (!sessionId || !groups.length) {
      setError('Add at least one product.');
      return;
    }
    if (!driverName.trim()) {
      setError('Select a driver.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await warehouseMobileRequest('delivery-submit', {
        session_id: sessionId,
        driver_id: driverId,
        driver_name: driverName,
        groups: groups.map((g) => ({
          assembly_id: g.assembly_id,
          units: g.units,
          scans: g.scans,
        })),
      });
      navigation.replace('KitweSendDone', { deliveryNumber });
    } catch (err) {
      setError(err?.message || 'Submit failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.dn}>{deliveryNumber || '…'}</Text>
      <Text style={styles.sub}>Factory → Kitwe delivery</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}

      <Text style={styles.label}>Driver</Text>
      <View style={styles.driverRow}>
        {drivers.map((d) => (
          <Pressable
            key={d.id}
            style={[styles.chip, driverId === d.id && styles.chipOn]}
            onPress={() => {
              setDriverId(d.id);
              setDriverName(d.name);
            }}
          >
            <Text style={styles.chipText}>{d.name}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.btn}
        onPress={() => navigation.navigate('KitweSendProduct', { sessionId })}
      >
        <Text style={styles.btnText}>+ Add warehouse product</Text>
      </Pressable>

      {groups.map((g) => (
        <View key={g.assembly_id} style={styles.card}>
          <Text style={styles.cardTitle}>{g.assembly_name}</Text>
          <Text style={styles.cardSub}>Sets on truck: {g.units}</Text>
          <Text style={styles.cardSub}>Packets checked: {g.scans?.filter((s) => s.driver_checked).length || 0}</Text>
        </View>
      ))}

      <Pressable style={[styles.btnPrimary, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Send delivery</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, backgroundColor: theme.bg, flexGrow: 1 },
  dn: { fontSize: 22, fontWeight: '800', color: theme.text },
  sub: { color: theme.muted, marginBottom: 12 },
  err: { color: theme.danger, marginBottom: 8 },
  label: { color: theme.text, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  driverRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.border },
  chipOn: { borderColor: theme.primary, backgroundColor: theme.primaryBg },
  chipText: { color: theme.text },
  btn: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.border, marginBottom: 12 },
  btnText: { color: theme.primary, fontWeight: '700', textAlign: 'center' },
  card: { padding: 12, borderRadius: 10, backgroundColor: theme.surface, marginBottom: 8 },
  cardTitle: { color: theme.text, fontWeight: '700' },
  cardSub: { color: theme.muted, marginTop: 4 },
  btnPrimary: { marginTop: 16, padding: 16, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center' },
  btnPrimaryText: { color: '#0f172a', fontWeight: '800' },
});
