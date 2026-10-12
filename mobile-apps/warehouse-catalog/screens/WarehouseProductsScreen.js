import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseCatalogSearchQuery,
  normalizeWarehouseProductSku,
  normalizeWarehouseWedgeScanInput,
} from '../shared/warehouseScanResolver';
import { isWarehouseProductStockQtyEditAllowed } from '../shared/mobileAccessManifest';
import { useMobileAccessGrant } from '../shared/useMobileAccessGrant';
import { wedgeAwareTextChange } from '../shared/useKeepSoftKeyboardOnScanSubmit';
import { theme } from '../shared/theme';

function isSetAssembly(assembly) {
  return String(assembly?.item_kind || '').toLowerCase() === 'set';
}

function formatDimensionsLine(assembly) {
  const l = assembly?.dim_length;
  const w = assembly?.dim_width;
  const h = assembly?.dim_height;
  const hasAny = [l, w, h].some((v) => v != null && v !== '' && Number.isFinite(Number(v)));
  if (!hasAny) return '';
  const fmt = (v) => {
    if (v == null || v === '') return '—';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '—';
  };
  return `Dimensions: ${fmt(l)} × ${fmt(w)} × ${fmt(h)} cm`;
}

function formatVolumeLine(assembly) {
  const l = Number(assembly?.dim_length);
  const w = Number(assembly?.dim_width);
  const h = Number(assembly?.dim_height);
  if (!Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(h)) return '';
  if (l <= 0 || w <= 0 || h <= 0) return '';
  const m3 = (l * w * h) / 1_000_000;
  if (!Number.isFinite(m3)) return '';
  const display = m3.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `Volume (m³): ${display}`;
}

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
  const { grant } = useMobileAccessGrant();
  const canEditProductStock = isWarehouseProductStockQtyEditAllowed(grant);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [catalog, setCatalog] = useState(null);
  const [savingAssemblyId, setSavingAssemblyId] = useState(null);
  const productQtyConfirmRef = useRef(false);
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

  const productAssemblies = useMemo(
    () => (catalog?.assemblies || []).filter((a) => !isSetAssembly(a)),
    [catalog?.assemblies],
  );

  const filtered = useMemo(() => {
    const raw = search.trim();
    if (!raw) return productAssemblies;
    const qLower = raw.toLowerCase();
    const qProductKeys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(raw));
    const qPacketKeys = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(raw));

    const keysOverlap = (storedSku, queryKeys, normalizer) => {
      const storedKeys = expandWarehouseSkuMatchKeys(normalizer(storedSku));
      for (const k of queryKeys) {
        if (k && storedKeys.has(k)) return true;
      }
      return false;
    };

    return productAssemblies.filter((a) => {
      const pktList = packetsByAssembly.get(String(a.id)) || [];
      if (String(a.name || '').toLowerCase().includes(qLower)) return true;
      if (String(a.family_sku || '').toLowerCase().includes(qLower)) return true;
      if (keysOverlap(a.family_sku, qProductKeys, normalizeWarehouseProductSku)) return true;
      return pktList.some(
        (p) => String(p.name || '').toLowerCase().includes(qLower)
          || String(p.sku || '').toLowerCase().includes(qLower)
          || keysOverlap(p.sku, qPacketKeys, normalizeWarehousePacketScan),
      );
    });
  }, [productAssemblies, packetsByAssembly, search]);

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openNewProductForm = () => {
    navigation.navigate('ProductForm', {
      prefill: {},
      existing: false,
      warehouseLocationId: catalog?.warehouseLocationId,
      catalogSnapshot: catalog,
    });
  };

  const formatQty = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return String(Math.max(0, Math.floor(n)));
  };

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

  const saveProductQty = useCallback(async (assemblyId, nextQty) => {
    const locId = catalog?.warehouseLocationId;
    if (!locId) {
      setError('Warehouse location is not configured.');
      return;
    }
    setSavingAssemblyId(String(assemblyId));
    setError('');
    try {
      const result = await warehouseMobileRequest('assembly-product-quantity-set', {
        assembly_id: assemblyId,
        warehouse_location_id: locId,
        quantity: nextQty,
      });
      applyCatalogQtyMaps(result);
    } catch (err) {
      setError(err?.message || 'Product quantity update failed');
    } finally {
      setSavingAssemblyId(null);
    }
  }, [applyCatalogQtyMaps, catalog?.warehouseLocationId]);

  const requestProductQtyChange = useCallback((assembly, nextQty) => {
    if (productQtyConfirmRef.current || savingAssemblyId) return;
    const id = String(assembly.id);
    const prev = Math.max(0, Math.floor(Number(assemblyWarehouseQty[id]) || 0));
    const next = Math.max(0, Math.floor(Number(nextQty) || 0));
    if (next <= prev) {
      if (next < prev) {
        setError('Product quantity can only be increased.');
      }
      return;
    }
    const label = String(assembly.name || assembly.family_sku || 'Product').trim();
    productQtyConfirmRef.current = true;
    Alert.alert(
      'Confirm product quantity',
      `${label}\n\nIncrease complete units from ${prev} to ${next}? Linked packet cartons will scale automatically.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => { productQtyConfirmRef.current = false; },
        },
        {
          text: 'Confirm',
          onPress: () => {
            productQtyConfirmRef.current = false;
            saveProductQty(assembly.id, next);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => { productQtyConfirmRef.current = false; },
      },
    );
  }, [assemblyWarehouseQty, saveProductQty, savingAssemblyId]);

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
    const dimLine = formatDimensionsLine(assembly);
    const volumeLine = formatVolumeLine(assembly);

    return (
      <View style={styles.gridCard}>
        <View style={styles.cardPress}>
          <Pressable
            onPress={() => navigation.navigate('WarehouseProductDetail', { assemblyId: id })}
            accessibilityLabel={`Open ${assembly.name}`}
          >
            <ProductThumbnail assembly={assembly} />
            <View style={styles.qtyRibbon} pointerEvents={canEditProductStock ? 'auto' : 'none'}>
              <Text style={styles.qtyRibbonLabel}>{warehouseLabel}</Text>
              {canEditProductStock ? (
                <View style={styles.qtyStepper}>
                  <Pressable
                    style={styles.qtyStepBtn}
                    onPress={() => requestProductQtyChange(assembly, finishedQty + 1)}
                    disabled={savingAssemblyId === id}
                    accessibilityLabel="Increase product quantity by one"
                  >
                    <Text style={styles.qtyStepBtnText}>+</Text>
                  </Pressable>
                  <Text style={styles.qtyRibbonValue}>{formatQty(finishedQty)}</Text>
                </View>
              ) : (
                <Text style={styles.qtyRibbonValue}>{formatQty(finishedQty)}</Text>
              )}
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>{assembly.name}</Text>
            <Text style={styles.cardSku} numberOfLines={1}>{assembly.family_sku}</Text>
            <Text style={styles.cardMeta} numberOfLines={2}>
              {cat || '—'}
              {assembly.packet_count ? ` · ${assembly.packet_count} pkt` : ''}
            </Text>
            {dimLine ? (
              <Text style={styles.cardSpec} numberOfLines={2}>{dimLine}</Text>
            ) : null}
            {volumeLine ? (
              <Text style={styles.cardSpec} numberOfLines={1}>{volumeLine}</Text>
            ) : null}
          </Pressable>
          <Pressable
            style={styles.expandFab}
            onPress={() => toggleExpanded(id)}
            hitSlop={8}
            accessibilityLabel={isOpen ? 'Hide packets' : 'Show packets'}
          >
            <Text style={[styles.expandIcon, isOpen && styles.expandIconOpen]}>▶</Text>
          </Pressable>
        </View>
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
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderTitle}>{warehouseLabel} products</Text>
        <Text style={styles.listHeaderMeta}>
          {filtered.length} item{filtered.length === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          placeholder="Search SKU or name…"
          placeholderTextColor={theme.textDim}
          value={search}
          onChangeText={wedgeAwareTextChange(setSearch, {
            normalize: (v) => normalizeWarehouseWedgeScanInput(v, 'auto'),
          })}
          autoCapitalize="characters"
          autoCorrect={false}
          onBlur={() => {
            const v = search.trim();
            if (!v) return;
            const normalized = normalizeWarehouseCatalogSearchQuery(v);
            if (normalized && normalized !== v) setSearch(normalized);
          }}
        />
        <Pressable
          style={styles.addBtn}
          onPress={openNewProductForm}
          accessibilityLabel="Add new product"
        >
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && catalog && !catalog.warehouseLocationId ? (
        <Text style={styles.error}>
          Warehouse location could not be resolved (same rules as web warehouse products). Pull to refresh.
        </Text>
      ) : null}
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
            <Text style={styles.empty}>No products yet. Tap + to add a product.</Text>
          }
          refreshing={loading}
          onRefresh={load}
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
  listHeaderTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  listHeaderMeta: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
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
  listContent: { paddingHorizontal: 10, paddingBottom: 24 },
  gridRow: { gap: 8, marginBottom: 8 },
  gridCard: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    minWidth: 0,
  },
  cardPress: { padding: 8, paddingBottom: 10, position: 'relative' },
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
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  qtyStepBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#1e40af',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyStepBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  qtyRibbonValue: { color: '#38bdf8', fontSize: 16, fontWeight: '800' },
  expandFab: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: theme.radiusSm,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    zIndex: 2,
  },
  expandIcon: { color: '#94a3b8', fontSize: 10 },
  expandIconOpen: { transform: [{ rotate: '90deg' }] },
  cardTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '700', marginTop: 8 },
  cardSku: { color: '#cbd5e1', fontFamily: 'monospace', fontSize: 11, marginTop: 4 },
  cardMeta: { color: '#94a3b8', marginTop: 4, fontSize: 11, lineHeight: 15 },
  cardSpec: { color: '#cbd5e1', marginTop: 3, fontSize: 10, lineHeight: 14 },
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
});
