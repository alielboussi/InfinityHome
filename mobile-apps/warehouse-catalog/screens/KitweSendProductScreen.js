import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping';
import { fetchWarehouseCatalogCached } from '../shared/warehouseCatalogStore';
import { theme } from '../shared/theme';

export default function KitweSendProductScreen({ navigation }) {
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState('');
  const [assemblyId, setAssemblyId] = useState('');
  const [units, setUnits] = useState('1');
  const [checks, setChecks] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    fetchWarehouseCatalogCached({ force: true }).then(setCatalog).catch(() => {});
  }, []);

  const assemblies = catalog?.assemblies || [];
  const packets = catalog?.packets || [];
  const links = catalog?.assemblyPackets || [];

  const byAssembly = useMemo(
    () => buildPacketsByAssembly(links, packets),
    [links, packets],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assemblies.slice(0, 40);
    return assemblies.filter((a) => String(a.name || '').toLowerCase().includes(q)).slice(0, 40);
  }, [assemblies, search]);

  const packetRows = assemblyId ? (byAssembly.get(String(assemblyId)) || []) : [];
  const assembly = assemblies.find((a) => String(a.id) === String(assemblyId));
  const unitsNum = Math.max(1, Number(units) || 1);

  const togglePacket = (packetId, requiredQty) => {
    setChecks((prev) => {
      const next = { ...prev };
      if (next[packetId]?.driver_checked) {
        delete next[packetId];
      } else {
        next[packetId] = {
          packet_id: packetId,
          quantity: requiredQty,
          driver_checked: true,
          driver_checked_at: new Date().toISOString(),
        };
      }
      return next;
    });
  };

  const addToDelivery = () => {
    if (!assembly) {
      setError('Select a product.');
      return;
    }
    const scans = [];
    for (const packet of packetRows) {
      const req = unitsNum * Math.max(1, Number(packet.qty_per_unit) || 1);
      const row = checks[packet.id];
      if (!row?.driver_checked) {
        setError(`Check every packet carton for ${assembly.name}.`);
        return;
      }
      scans.push({ ...row, quantity: req });
    }
    navigation.navigate('KitweSendHome', {
      addedGroup: {
        assembly_id: assembly.id,
        assembly_name: assembly.name,
        units: unitsNum,
        scans,
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <TextInput
        style={styles.input}
        placeholder="Search warehouse product…"
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      {filtered.map((a) => (
        <Pressable
          key={a.id}
          style={[styles.row, assemblyId === a.id && styles.rowOn]}
          onPress={() => {
            setAssemblyId(a.id);
            setChecks({});
            setError('');
          }}
        >
          <Text style={styles.rowText}>{a.name}</Text>
        </Pressable>
      ))}

      {assembly ? (
        <View style={styles.panel}>
          <Text style={styles.title}>{assembly.name}</Text>
          <Text style={styles.label}>Complete sets on truck</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={units}
            onChangeText={setUnits}
          />
          <Text style={styles.label}>Packet cartons (tick each)</Text>
          {packetRows.map((p) => {
            const req = unitsNum * Math.max(1, Number(p.qty_per_unit) || 1);
            const on = Boolean(checks[p.id]?.driver_checked);
            return (
              <Pressable key={p.id} style={styles.checkRow} onPress={() => togglePacket(p.id, req)}>
                <Text style={styles.checkBox}>{on ? '☑' : '☐'}</Text>
                <Text style={styles.checkLabel}>
                  #{p.packet_number} {p.name} — {req} carton(s)
                </Text>
              </Pressable>
            );
          })}
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Pressable style={styles.btnPrimary} onPress={addToDelivery}>
            <Text style={styles.btnPrimaryText}>Add to delivery</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, backgroundColor: theme.bg, flexGrow: 1 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    color: theme.text,
    marginBottom: 12,
  },
  row: { padding: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  rowOn: { backgroundColor: theme.surfaceElevated },
  rowText: { color: theme.text },
  panel: { marginTop: 16, padding: 12, backgroundColor: theme.surface, borderRadius: 12 },
  title: { fontSize: 18, fontWeight: '800', color: theme.text },
  label: { color: theme.muted, marginTop: 12, marginBottom: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkBox: { fontSize: 20, color: theme.primary },
  checkLabel: { color: theme.text, flex: 1 },
  err: { color: theme.danger, marginTop: 8 },
  btnPrimary: { marginTop: 16, padding: 14, backgroundColor: theme.primary, borderRadius: 10 },
  btnPrimaryText: { textAlign: 'center', fontWeight: '800', color: '#0f172a' },
});
