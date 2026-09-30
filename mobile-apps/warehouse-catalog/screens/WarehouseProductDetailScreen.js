import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { attachWarehouseStockTotals } from '../shared/warehouseCatalogStock';
import { buildPacketsByAssembly } from '../shared/warehousePacketGrouping';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

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
  return `${fmt(l)} × ${fmt(w)} × ${fmt(h)} cm`;
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
  return `${display} m³`;
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

function formatQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Math.max(0, Math.floor(n)));
}

export default function WarehouseProductDetailScreen({ route }) {
  const assemblyId = String(route.params?.assemblyId || '');
  const matchedSku = route.params?.matchedSku || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState(null);

  const load = useCallback(async () => {
    if (!assemblyId) {
      setError('Missing product id.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await warehouseMobileRequest('catalog-list');
      setCatalog(data);
    } catch (err) {
      setError(err?.message || 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [assemblyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const enriched = useMemo(() => {
    if (!catalog) return null;
    return attachWarehouseStockTotals(catalog);
  }, [catalog]);

  const assembly = useMemo(() => {
    if (!enriched?.assemblies) return null;
    return enriched.assemblies.find((a) => String(a.id) === assemblyId) || null;
  }, [assemblyId, enriched]);

  const warehouseLabel = enriched?.warehouseLocationName || 'Warehouse';
  const warehouseQty = enriched?.assemblyWarehouseQty?.[assemblyId] ?? 0;

  const packetsByAssembly = useMemo(
    () => buildPacketsByAssembly(catalog?.assemblyPackets, catalog?.packets),
    [catalog],
  );
  const packetList = packetsByAssembly.get(assemblyId) || [];

  const categoryName = useMemo(() => {
    const map = new Map((catalog?.categories || []).map((c) => [String(c.id), c.name]));
    return map.get(String(assembly?.category_id)) || '';
  }, [assembly?.category_id, catalog?.categories]);

  const imageUri = assembly ? resolveAssemblyImageUri(assembly) : null;
  const dimLine = assembly ? formatDimensionsLine(assembly) : '';
  const volumeLine = assembly ? formatVolumeLine(assembly) : '';

  if (loading && !assembly) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#38bdf8" size="large" />
      </View>
    );
  }

  if (error || !assembly) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || 'Product not found in catalog.'}</Text>
        <Pressable style={styles.btn} onPress={load}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.hero} resizeMode="cover" />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Text style={styles.heroPlaceholderText}>No photo</Text>
        </View>
      )}

      <Text style={styles.title}>{assembly.name}</Text>
      <Text style={styles.sku}>{assembly.family_sku}</Text>
      {matchedSku && matchedSku !== assembly.family_sku ? (
        <Text style={styles.matched}>Matched from label: {matchedSku}</Text>
      ) : null}

      <View style={styles.stockCard}>
        <Text style={styles.stockLabel}>{warehouseLabel} stock</Text>
        <Text style={styles.stockValue}>{formatQty(warehouseQty)}</Text>
        <Text style={styles.stockHint}>Finished units at warehouse location</Text>
      </View>

      {dimLine ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Dimensions</Text>
          <Text style={styles.rowValue}>{dimLine}</Text>
        </View>
      ) : null}
      {volumeLine ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Volume (m³)</Text>
          <Text style={styles.rowValue}>{volumeLine}</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Category</Text>
        <Text style={styles.rowValue}>{categoryName || '—'}</Text>
      </View>

      {packetList.length > 0 ? (
        <View style={styles.packetBlock}>
          <Text style={styles.packetTitle}>Linked cartons ({packetList.length})</Text>
          {packetList.map((p) => (
            <Text key={p.id} style={styles.packetLine} numberOfLines={1}>
              {p.sku} — {p.name}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  hero: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#1e293b' },
  heroPlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: { color: '#64748b' },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '700', marginTop: 16 },
  sku: { color: '#38bdf8', fontFamily: 'monospace', fontSize: 14, marginTop: 6 },
  matched: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  stockCard: {
    marginTop: 20,
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    padding: 16,
  },
  stockLabel: { color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  stockValue: { color: '#f8fafc', fontSize: 36, fontWeight: '800', marginTop: 4 },
  stockHint: { color: '#cbd5e1', fontSize: 12, marginTop: 4 },
  row: { marginTop: 16 },
  rowLabel: { color: '#64748b', fontSize: 12, marginBottom: 4 },
  rowValue: { color: '#e2e8f0', fontSize: 16 },
  packetBlock: { marginTop: 24 },
  packetTitle: { color: '#94a3b8', fontSize: 13, marginBottom: 8 },
  packetLine: { color: '#cbd5e1', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 },
  error: { color: '#f87171', textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: '#1e3a5f', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#e2e8f0', fontWeight: '600' },
});
