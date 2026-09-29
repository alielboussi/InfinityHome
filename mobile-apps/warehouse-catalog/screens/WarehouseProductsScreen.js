import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

export default function WarehouseProductsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [catalog, setCatalog] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await warehouseMobileRequest('catalog-list');
      setCatalog(data);
    } catch (err) {
      setError(err?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const packetsByAssembly = useMemo(
    () => buildPacketsByAssembly(catalog?.assemblyPackets, catalog?.packets),
    [catalog],
  );

  const categoryName = useMemo(() => {
    const map = new Map((catalog?.categories || []).map((c) => [String(c.id), c.name]));
    return (id) => map.get(String(id)) || '';
  }, [catalog?.categories]);

  const filtered = useMemo(() => {
    const assemblies = catalog?.assemblies || [];
    const q = search.trim().toLowerCase();
    if (!q) return assemblies;
    return assemblies.filter((a) => {
      const pktList = packetsByAssembly.get(String(a.id)) || [];
      if (String(a.name || '').toLowerCase().includes(q)) return true;
      if (String(a.family_sku || '').toLowerCase().includes(q)) return true;
      return pktList.some(
        (p) => String(p.name || '').toLowerCase().includes(q)
          || String(p.sku || '').toLowerCase().includes(q),
      );
    });
  }, [catalog?.assemblies, packetsByAssembly, search]);

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openPacketForm = (prefill = {}, existing = false) => {
    setAddOpen(false);
    navigation.navigate('PacketForm', {
      prefill,
      existing,
      warehouseLocationId: catalog?.warehouseLocationId,
    });
  };

  const openProductForm = (prefill = {}, existing = false) => {
    setAddOpen(false);
    navigation.navigate('ProductForm', {
      prefill,
      existing,
      warehouseLocationId: catalog?.warehouseLocationId,
      catalogSnapshot: catalog,
    });
  };

  const openScan = () => {
    setAddOpen(false);
    navigation.navigate('WarehouseScan', { warehouseLocationId: catalog?.warehouseLocationId });
  };

  const renderPacket = (packet) => (
    <View key={packet.id} style={styles.packetRow}>
      <Text style={styles.packetSku}>{packet.sku}</Text>
      <Text style={styles.packetName} numberOfLines={2}>{packet.name}</Text>
      <Text style={styles.packetMeta}>#{packet.packet_number ?? '—'}</Text>
    </View>
  );

  const renderItem = ({ item: assembly }) => {
    const id = String(assembly.id);
    const isOpen = expanded.has(id);
    const pktList = packetsByAssembly.get(id) || [];
    const cat = categoryName(assembly.category_id);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Pressable
            style={styles.expandBtn}
            onPress={() => toggleExpanded(id)}
            accessibilityLabel={isOpen ? 'Collapse packets' : 'Expand packets'}
          >
            <Text style={[styles.expandIcon, isOpen && styles.expandIconOpen]}>▶</Text>
          </Pressable>
          <View style={styles.cardMain}>
            <Text style={styles.cardTitle}>{assembly.name}</Text>
            <Text style={styles.cardMeta}>
              <Text style={styles.cardSku}>{assembly.family_sku}</Text>
              {cat ? ` · ${cat}` : ''}
              {assembly.packet_count ? ` · ${assembly.packet_count} pkt` : ''}
            </Text>
          </View>
        </View>
        {isOpen ? (
          <View style={styles.packetList}>
            {pktList.length === 0 ? (
              <Text style={styles.packetEmpty}>No packets linked yet.</Text>
            ) : (
              pktList.map(renderPacket)
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          placeholder="Search SKU or name…"
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.addBtn} onPress={() => setAddOpen(true)} accessibilityLabel="Add">
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !catalog ? (
        <ActivityIndicator color="#38bdf8" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>No products yet. Tap + to add a packet or product.</Text>
          }
          refreshing={loading}
          onRefresh={load}
        />
      )}

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Add</Text>
            <Pressable style={styles.modalOption} onPress={openScan}>
              <Text style={styles.modalOptionText}>Scan barcode (Code 128 / QR)</Text>
            </Pressable>
            <Pressable style={styles.modalOption} onPress={() => openPacketForm({}, false)}>
              <Text style={styles.modalOptionText}>New packet</Text>
            </Pressable>
            <Pressable style={styles.modalOption} onPress={() => openProductForm({}, false)}>
              <Text style={styles.modalOptionText}>New product</Text>
            </Pressable>
            <Pressable style={styles.modalCancel} onPress={() => setAddOpen(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1e3a5f',
    borderWidth: 1,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#e2e8f0', fontSize: 26, fontWeight: '300', marginTop: -2 },
  listContent: { paddingHorizontal: 12, paddingBottom: 24 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 10 },
  expandBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  expandIcon: { color: '#94a3b8', fontSize: 12 },
  expandIconOpen: { transform: [{ rotate: '90deg' }] },
  cardMain: { flex: 1 },
  cardTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  cardMeta: { color: '#94a3b8', marginTop: 4, fontSize: 13 },
  cardSku: { fontFamily: 'monospace', color: '#cbd5e1' },
  packetList: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
  },
  packetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  packetSku: { color: '#38bdf8', fontFamily: 'monospace', fontSize: 12, width: 110 },
  packetName: { flex: 1, color: '#e2e8f0', fontSize: 13 },
  packetMeta: { color: '#64748b', fontSize: 12 },
  packetEmpty: { color: '#64748b', fontStyle: 'italic', paddingVertical: 4 },
  error: { color: '#f87171', paddingHorizontal: 12, marginBottom: 8 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
  },
  modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalOptionText: { color: '#e2e8f0', fontSize: 16 },
  modalCancel: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: '#94a3b8', fontSize: 16 },
});
