import { useCallback, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { attachWarehouseStockTotals } from '../shared/warehouseCatalogStock';
import { buildPacketAssemblyAssignments } from '../shared/warehousePacketGrouping';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseWedgeScanInput,
} from '../shared/warehouseScanResolver';
import {
  useKeepSoftKeyboardOnScanSubmit,
  wedgeAwareTextChange,
} from '../shared/useKeepSoftKeyboardOnScanSubmit';
import { theme } from '../shared/theme';

function formatQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Math.max(0, Math.floor(n)));
}

export default function WarehousePacketsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState('');
  const [draftQty, setDraftQty] = useState({});
  const [committedQty, setCommittedQty] = useState({});
  const [savingId, setSavingId] = useState(null);
  const qtyConfirmOpenRef = useRef(false);
  const searchRef = useRef(null);
  const { keepFocusAfterSubmit, stripScanTerminator } = useKeepSoftKeyboardOnScanSubmit(searchRef);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await warehouseMobileRequest('catalog-list');
      setCatalog(data);
      const qtyMap = {};
      (data.packets || []).forEach((p) => {
        const onHand = data.packetWarehouseQty?.[String(p.id)] ?? 0;
        qtyMap[String(p.id)] = formatQty(onHand);
      });
      setDraftQty(qtyMap);
      setCommittedQty(qtyMap);
    } catch (err) {
      setError(err?.message || 'Failed to load packets');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const warehouseLocationId = catalog?.warehouseLocationId;
  const warehouseLabel = catalog?.warehouseLocationName || 'Warehouse';

  const packetAssignments = useMemo(
    () => buildPacketAssemblyAssignments(
      catalog?.assemblyPackets,
      catalog?.packets,
      catalog?.assemblies,
    ),
    [catalog],
  );

  const assemblyFinishedQty = useMemo(() => {
    if (!catalog) return {};
    const enriched = attachWarehouseStockTotals({
      assemblies: catalog.assemblies || [],
      packets: catalog.packets || [],
      inventory: catalog.inventory || [],
      assemblyInventory: catalog.assemblyInventory || [],
      assemblyPackets: catalog.assemblyPackets || [],
      locations: catalog.locations || [],
      warehouseLocationId: catalog.warehouseLocationId ?? null,
      warehouseLocationName: catalog.warehouseLocationName,
    });
    return enriched.assemblyWarehouseQty || {};
  }, [catalog]);

  const filteredPackets = useMemo(() => {
    const list = catalog?.packets || [];
    const raw = search.trim();
    if (!raw) return list;
    const qLower = raw.toLowerCase();
    const qKeys = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(raw));
    return list.filter((p) => {
      if (String(p.name || '').toLowerCase().includes(qLower)) return true;
      if (String(p.sku || '').toLowerCase().includes(qLower)) return true;
      const stored = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(p.sku));
      for (const k of qKeys) {
        if (k && stored.has(k)) return true;
      }
      return false;
    });
  }, [catalog?.packets, search]);

  const applyCatalogQtyMaps = useCallback((result) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        packetWarehouseQty: {
          ...(prev.packetWarehouseQty || {}),
          ...(result.packetWarehouseQty || {}),
        },
        assemblyWarehouseQty: {
          ...(prev.assemblyWarehouseQty || {}),
          ...(result.assemblyWarehouseQty || {}),
        },
      };
    });
  }, []);

  const savePacketQty = useCallback(async (packet, rawValue) => {
    if (!warehouseLocationId) {
      setError('Warehouse location is not configured.');
      return;
    }
    const qty = Math.max(0, Math.floor(Number(rawValue) || 0));
    const id = String(packet.id);
    setSavingId(id);
    setError('');
    try {
      const result = await warehouseMobileRequest('packet-quantity-set', {
        packet_id: packet.id,
        warehouse_location_id: warehouseLocationId,
        quantity: qty,
      });
      const saved = formatQty(result.quantity);
      setDraftQty((prev) => ({ ...prev, [id]: saved }));
      setCommittedQty((prev) => ({ ...prev, [id]: saved }));
      applyCatalogQtyMaps(result);
    } catch (err) {
      setError(err?.message || 'Quantity update failed');
      setDraftQty((prev) => ({
        ...prev,
        [id]: formatQty(committedQty[id]),
      }));
    } finally {
      setSavingId(null);
    }
  }, [applyCatalogQtyMaps, committedQty, warehouseLocationId]);

  const revertDraftQty = useCallback((packetId) => {
    const id = String(packetId);
    setDraftQty((prev) => ({
      ...prev,
      [id]: formatQty(committedQty[id]),
    }));
  }, [committedQty]);

  const requestQtyChange = useCallback((packet, rawValue) => {
    if (qtyConfirmOpenRef.current || savingId) return;
    const id = String(packet.id);
    const prev = Math.max(0, Math.floor(Number(committedQty[id]) || 0));
    const next = Math.max(0, Math.floor(Number(rawValue) || 0));
    if (next === prev) {
      setDraftQty((p) => ({ ...p, [id]: formatQty(prev) }));
      return;
    }
    const sku = String(packet.sku || '').trim() || 'Packet';
    const name = String(packet.name || '').trim();
    qtyConfirmOpenRef.current = true;
    Alert.alert(
      'Confirm quantity change',
      `${sku}${name ? `\n${name}` : ''}\n\nChange cartons on hand from ${prev} to ${next}? Linked product stock will update to match the web portal.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            qtyConfirmOpenRef.current = false;
            revertDraftQty(id);
          },
        },
        {
          text: 'Confirm',
          onPress: () => {
            qtyConfirmOpenRef.current = false;
            setDraftQty((p) => ({ ...p, [id]: formatQty(next) }));
            savePacketQty(packet, next);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          qtyConfirmOpenRef.current = false;
          revertDraftQty(id);
        },
      },
    );
  }, [committedQty, revertDraftQty, savePacketQty, savingId]);

  const bumpQty = (packet, delta) => {
    const id = String(packet.id);
    const current = Math.max(0, Math.floor(Number(draftQty[id]) || 0));
    const next = Math.max(0, current + delta);
    setDraftQty((prev) => ({ ...prev, [id]: String(next) }));
    requestQtyChange(packet, next);
  };

  const renderItem = ({ item: packet }) => {
    const id = String(packet.id);
    const products = packetAssignments.get(id) || [];
    const busy = savingId === id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.sku} numberOfLines={1}>{packet.sku}</Text>
            <Text style={styles.name} numberOfLines={2}>{packet.name}</Text>
          </View>
          <Pressable
            style={styles.editBtn}
            onPress={() => navigation.navigate('PacketForm', {
              prefill: {
                id: packet.id,
                sku: packet.sku,
                name: packet.name,
                packet_number: packet.packet_number,
                qty_per_unit: packet.qty_per_unit,
              },
              warehouseLocationId,
            })}
            accessibilityLabel="Edit packet"
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        </View>
        {products.length ? (
          <View style={styles.productBlock}>
            <Text style={styles.productLabel}>Linked products ({warehouseLabel} units)</Text>
            {products.map((a) => (
              <Text key={a.id} style={styles.productLine} numberOfLines={2}>
                {a.name}
                <Text style={styles.productUnits}>
                  {' '}· {formatQty(assemblyFinishedQty[String(a.id)])} units
                </Text>
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.unassigned}>Unassigned — qty is carton on-hand only</Text>
        )}
        <View style={styles.qtyRow}>
          <Text style={styles.qtyCaption}>Cartons on hand</Text>
          <View style={styles.qtyControls}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => bumpQty(packet, -1)}
              disabled={busy}
              accessibilityLabel="Decrease quantity"
            >
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <TextInput
              style={styles.qtyInput}
              value={draftQty[id] ?? '0'}
              onChangeText={(v) => setDraftQty((prev) => ({ ...prev, [id]: v.replace(/[^\d]/g, '') }))}
              keyboardType="number-pad"
              blurOnSubmit={false}
              showSoftInputOnFocus
              onBlur={() => requestQtyChange(packet, draftQty[id])}
              onSubmitEditing={() => requestQtyChange(packet, draftQty[id])}
              editable={!busy}
            />
            <Pressable
              style={styles.stepBtn}
              onPress={() => bumpQty(packet, 1)}
              disabled={busy}
              accessibilityLabel="Increase quantity"
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
          {busy ? <ActivityIndicator size="small" color="#38bdf8" style={styles.rowSpinner} /> : null}
        </View>
      </View>
    );
  };

  const openNewPacket = () => {
    if (!warehouseLocationId) {
      setError('Warehouse location is not configured.');
      return;
    }
    navigation.navigate('PacketForm', {
      prefill: {},
      existing: false,
      warehouseLocationId,
    });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.lead}>
        Search by SKU or name. Changing cartons updates linked product stock the same way as the web portal.
      </Text>
      <View style={styles.toolbar}>
        <TextInput
          ref={searchRef}
          style={styles.search}
          placeholder="Search packet SKU or name…"
          placeholderTextColor={theme.textDim}
          value={search}
          onChangeText={wedgeAwareTextChange(setSearch, {
            stripScanTerminator,
            keepFocusAfterSubmit,
            transform: (v) => v.toUpperCase(),
            normalize: (v) => normalizeWarehouseWedgeScanInput(v, 'packet'),
          })}
          onBlur={() => {
            const v = search.trim();
            if (!v) return;
            const normalized = normalizeWarehousePacketScan(v);
            if (normalized && normalized !== v) setSearch(normalized);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          blurOnSubmit={false}
          returnKeyType="search"
        />
        <Pressable
          style={styles.addBtn}
          onPress={openNewPacket}
          accessibilityLabel="Add new packet"
        >
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !catalog ? (
        <ActivityIndicator color="#38bdf8" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filteredPackets}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="always"
          refreshing={loading}
          onRefresh={load}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim()
                ? 'No packets match this search.'
                : 'No packets yet. Tap + to add a carton SKU.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  lead: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radiusSm,
    paddingHorizontal: theme.space.md,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 15,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#e2e8f0', fontSize: 26, fontWeight: '300', marginTop: -2 },
  listContent: { paddingHorizontal: 12, paddingBottom: 24 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardHeaderText: { flex: 1, minWidth: 0 },
  editBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.primary,
    backgroundColor: theme.surfaceElevated,
  },
  editBtnText: { color: '#93c5fd', fontWeight: '700', fontSize: 13 },
  sku: { color: '#38bdf8', fontFamily: 'monospace', fontSize: 13, fontWeight: '700' },
  name: { color: theme.text, fontSize: 15, fontWeight: '600', marginTop: 4 },
  productBlock: { marginTop: 10 },
  productLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  productLine: { color: '#cbd5e1', fontSize: 12, marginBottom: 2 },
  productUnits: { color: '#7dd3fc', fontWeight: '700' },
  unassigned: { color: theme.textDim, fontSize: 12, marginTop: 10, fontStyle: 'italic' },
  qtyRow: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 10 },
  qtyCaption: { color: theme.textMuted, fontSize: 12, marginBottom: 8 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: theme.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: theme.text, fontSize: 22, fontWeight: '600' },
  qtyInput: {
    flex: 1,
    minWidth: 72,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  rowSpinner: { marginTop: 8 },
  error: { color: theme.danger, paddingHorizontal: 12, marginBottom: 8 },
  empty: { color: theme.textDim, textAlign: 'center', marginTop: 32 },
});
