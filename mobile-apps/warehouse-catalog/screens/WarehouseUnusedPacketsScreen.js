import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { buildPacketAssemblyAssignments } from '../shared/warehousePacketGrouping';
import { useWarehouseCatalog } from '../shared/WarehouseCatalogContext';
import { catalogStockMaps } from '../shared/warehouseCatalogStockMaps';
import {
  buildUnusedPacketRows,
  computePacketCartonsAllocatedToCompleteProducts,
  packetIdsOnCompleteBomProducts,
} from '../shared/warehouseUnusedPackets';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseWedgeScanInput,
} from '../shared/warehouseScanResolver';
import { wedgeAwareTextChange } from '../shared/useKeepSoftKeyboardOnScanSubmit';
import { theme } from '../shared/theme';

const LIST_PERF = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  removeClippedSubviews: true,
};

export default function WarehouseUnusedPacketsScreen({ navigation }) {
  const {
    catalog,
    initialLoading,
    refreshing,
    error: catalogError,
    ensureFresh,
    refresh,
  } = useWarehouseCatalog();
  const [search, setSearch] = useState('');

  useFocusEffect(
    useCallback(() => {
      ensureFresh({ fullPackets: true });
    }, [ensureFresh]),
  );

  const warehouseLabel = catalog?.warehouseLocationName || 'Warehouse';
  const { packetWarehouseQty, assemblyWarehouseQty } = useMemo(
    () => catalogStockMaps(catalog),
    [catalog],
  );

  const packetAssignments = useMemo(
    () => buildPacketAssemblyAssignments(
      catalog?.assemblyPackets,
      catalog?.packets,
      catalog?.assemblies,
    ),
    [catalog],
  );

  const unusedRows = useMemo(() => {
    if (!catalog) return [];
    const allocated = computePacketCartonsAllocatedToCompleteProducts({
      assemblies: catalog.assemblies,
      assemblyPackets: catalog.assemblyPackets,
      packets: catalog.packets,
      assemblyWarehouseQty,
    });
    const completeBomPacketIds = packetIdsOnCompleteBomProducts({
      assemblies: catalog.assemblies,
      assemblyPackets: catalog.assemblyPackets,
      packets: catalog.packets,
    });
    return buildUnusedPacketRows({
      packets: catalog.packets,
      packetWarehouseQty,
      allocatedByPacketId: allocated,
      limitToPacketIds: completeBomPacketIds,
    });
  }, [catalog, assemblyWarehouseQty, packetWarehouseQty]);

  const filtered = useMemo(() => {
    const raw = search.trim();
    if (!raw) return unusedRows;
    const qLower = raw.toLowerCase();
    const qKeys = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(raw));
    return unusedRows.filter(({ packet }) => {
      if (String(packet.name || '').toLowerCase().includes(qLower)) return true;
      if (String(packet.sku || '').toLowerCase().includes(qLower)) return true;
      const stored = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(packet.sku));
      for (const k of qKeys) {
        if (k && stored.has(k)) return true;
      }
      const products = packetAssignments.get(String(packet.id)) || [];
      const productHay = products.map((pr) => `${pr.name} ${pr.family_sku}`).join(' ').toLowerCase();
      return productHay.includes(qLower);
    });
  }, [unusedRows, search, packetAssignments]);

  const renderItem = ({ item }) => {
    const { packet, onHand, allocated, unusedQty } = item;
    const id = String(packet.id);
    const products = packetAssignments.get(id) || [];

    return (
      <View style={styles.gridCard}>
        <View style={styles.qtyRibbon} pointerEvents="none">
          <Text style={styles.qtyRibbonLabel}>Unused cartons</Text>
          <Text style={[styles.qtyRibbonValue, styles.qtyRibbonValuePositive]}>
            {unusedQty}
          </Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{packet.name}</Text>
        <Text style={styles.cardSku} numberOfLines={1}>{packet.sku}</Text>
        <Text style={styles.cardMeta} numberOfLines={2}>
          On hand {onHand} · Allocated {allocated}
        </Text>
        {products.length ? (
          <Text style={styles.cardMeta} numberOfLines={3}>
            {products.map((a) => a.name).join(' · ')}
          </Text>
        ) : null}
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
            warehouseLocationId: catalog?.warehouseLocationId,
          })}
          accessibilityLabel="Edit packet"
        >
          <Text style={styles.editBtnText}>Edit packet</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderTitle}>Warehouse Unused Packets</Text>
        <Text style={styles.listHeaderMeta}>
          {filtered.length} packet{filtered.length === 1 ? '' : 's'} · spare cartons after BOM-complete products
        </Text>
      </View>
      <TextInput
        style={styles.search}
        placeholder="Search packet SKU or name…"
        placeholderTextColor={theme.textDim}
        value={search}
        onChangeText={wedgeAwareTextChange(setSearch, {
          normalize: (v) => normalizeWarehouseWedgeScanInput(v, 'packet'),
        })}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {catalogError ? <Text style={styles.error}>{catalogError}</Text> : null}
      {initialLoading && !catalog ? (
        <ActivityIndicator color="#38bdf8" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.packet.id)}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={() => refresh({ force: true, background: true })}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim()
                ? 'No packets match this search.'
                : `No unused cartons at ${warehouseLabel}. All on-hand stock is allocated to complete products.`}
            </Text>
          }
          {...LIST_PERF}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  listHeader: {
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.xs,
  },
  listHeaderTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  listHeaderMeta: { color: theme.textDim, fontSize: 13, marginTop: 4 },
  search: {
    marginHorizontal: theme.space.md,
    marginBottom: theme.space.sm,
    backgroundColor: theme.surface,
    borderRadius: theme.radiusMd,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 15,
  },
  listContent: { paddingHorizontal: theme.space.sm, paddingBottom: 24 },
  gridRow: { gap: 8, paddingHorizontal: 4 },
  gridCard: {
    flex: 1,
    margin: 4,
    backgroundColor: theme.surface,
    borderRadius: theme.radiusMd,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
    minHeight: 148,
  },
  qtyRibbon: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  qtyRibbonLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  qtyRibbonValue: { color: '#334155', fontSize: 16, fontWeight: '800' },
  qtyRibbonValuePositive: { color: '#15803d' },
  cardTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  cardSku: { color: '#cbd5e1', fontFamily: 'monospace', fontSize: 11, marginTop: 4 },
  cardMeta: { color: '#94a3b8', marginTop: 4, fontSize: 11, lineHeight: 15 },
  editBtn: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.primary,
    alignItems: 'center',
  },
  editBtnText: { color: theme.primary, fontWeight: '700', fontSize: 12 },
  error: { color: '#f87171', paddingHorizontal: 12, marginBottom: 8 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
});
