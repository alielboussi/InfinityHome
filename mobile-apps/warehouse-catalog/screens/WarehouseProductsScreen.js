import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { attachWarehouseStockTotals } from '../shared/warehouseCatalogStock';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

function resolveAssemblyImageUri(assembly) {
  const candidates = [
    assembly?.image_url,
    assembly?.thumbnail_url,
    assembly?.cover_image_url,
    assembly?.photo_url,
  ];
  const hit = candidates.find((v) => v && String(v).trim());
  return hit ? String(hit).trim() : null;
}

function ProductThumbnail({ assembly }) {
  const uri = resolveAssemblyImageUri(assembly);
  if (uri) {
    return <Image source={{ uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel="" />;
  }
  return (
    <View style={styles.thumbPlaceholder}>
      <Text style={styles.thumbPlaceholderIcon} accessibilityElementsHidden>▦</Text>
      <Text style={styles.thumbPlaceholderText}>Photo</Text>
    </View>
  );
}

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

  const stockMaps = useMemo(() => {
    if (!catalog?.assemblies) {
      return { assemblyWarehouseQty: {}, packetWarehouseQty: {} };
    }
    const enriched = attachWarehouseStockTotals({
      assemblies: catalog.assemblies,
      packets: catalog.packets || [],
      inventory: catalog.inventory || [],
      assemblyInventory: catalog.assemblyInventory || [],
      assemblyPackets: catalog.assemblyPackets || [],
      locations: catalog.locations || [],
      warehouseLocationId: catalog.warehouseLocationId ?? null,
      warehouseLocationName: catalog.warehouseLocationName,
    });
    return {
      assemblyWarehouseQty: enriched.assemblyWarehouseQty || {},
      packetWarehouseQty: enriched.packetWarehouseQty || {},
    };
  }, [catalog]);

  const assemblyWarehouseQty = stockMaps.assemblyWarehouseQty;
  const packetWarehouseQty = stockMaps.packetWarehouseQty;
  const warehouseLabel = catalog?.warehouseLocationName || 'Warehouse';

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

  const formatQty = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return String(Math.max(0, Math.floor(n)));
  };

  const renderPacket = (packet) => {
    const whQty = packetWarehouseQty[String(packet.id)] ?? 0;
    return (
      <View key={packet.id} style={styles.packetRow}>
        <Text style={styles.packetSku} numberOfLines={1}>{packet.sku}</Text>
        <Text style={styles.packetName} numberOfLines={2}>{packet.name}</Text>
        <Text style={styles.packetQty}>WH {formatQty(whQty)}</Text>
      </View>
    );
  };

  const renderItem = ({ item: assembly }) => {
    const id = String(assembly.id);
    const isOpen = expanded.has(id);
    const pktList = packetsByAssembly.get(id) || [];
    const cat = categoryName(assembly.category_id);
    const finishedQty = assemblyWarehouseQty[id] ?? 0;

    return (
      <View style={styles.gridCard}>
        <Pressable
          onPress={() => toggleExpanded(id)}
          style={styles.cardPress}
          accessibilityLabel={isOpen ? 'Collapse packets' : 'Expand packets'}
        >
          <ProductThumbnail assembly={assembly} />
          <View style={styles.qtyRibbon}>
            <Text style={styles.qtyRibbonLabel}>{warehouseLabel}</Text>
            <Text style={styles.qtyRibbonValue}>{formatQty(finishedQty)}</Text>
          </View>
          <View style={styles.expandFab} pointerEvents="none">
            <Text style={[styles.expandIcon, isOpen && styles.expandIconOpen]}>▶</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{assembly.name}</Text>
          <Text style={styles.cardSku} numberOfLines={1}>{assembly.family_sku}</Text>
          <Text style={styles.cardMeta} numberOfLines={2}>
            {cat || '—'}
            {assembly.packet_count ? ` · ${assembly.packet_count} pkt` : ''}
          </Text>
        </Pressable>
        {isOpen ? (
          <View style={styles.packetList}>
            {pktList.length === 0 ? (
              <Text style={styles.packetEmpty}>No packets linked.</Text>
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
          key="warehouse-products-grid-2"
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
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
  listContent: { paddingHorizontal: 10, paddingBottom: 24 },
  gridRow: { gap: 8, marginBottom: 8 },
  gridCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
    minWidth: 0,
  },
  cardPress: { padding: 8, paddingBottom: 10 },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  thumbPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderIcon: { color: '#475569', fontSize: 28, marginBottom: 4 },
  thumbPlaceholderText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  qtyRibbon: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  qtyRibbonLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  qtyRibbonValue: { color: '#38bdf8', fontSize: 16, fontWeight: '800' },
  expandFab: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  expandIcon: { color: '#94a3b8', fontSize: 10 },
  expandIconOpen: { transform: [{ rotate: '90deg' }] },
  cardTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '700', marginTop: 8 },
  cardSku: { color: '#cbd5e1', fontFamily: 'monospace', fontSize: 11, marginTop: 4 },
  cardMeta: { color: '#94a3b8', marginTop: 4, fontSize: 11, lineHeight: 15 },
  packetList: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#0f172a',
  },
  packetRow: {
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  packetSku: { color: '#38bdf8', fontFamily: 'monospace', fontSize: 10 },
  packetName: { color: '#e2e8f0', fontSize: 11, marginTop: 2 },
  packetQty: { color: '#a5f3fc', fontSize: 11, fontWeight: '700', marginTop: 2 },
  packetEmpty: { color: '#64748b', fontStyle: 'italic', paddingVertical: 4, fontSize: 11 },
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
