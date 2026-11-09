import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ProductionQrScanModal from './ProductionQrScanModal';
import { kiosk } from './kioskStyles';
import { tUi } from '../lib/productionKioskI18n';
import {
  fetchProductionStoreroomMaterials,
  saveProductionJobMaterials,
} from '../services/productionApi';
import { theme } from '../shared/theme';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
  sanitizeWarehouseScannerInput,
} from '../shared/warehouseScanResolver';

function materialKey(row) {
  return String(row?.assembly_id || row?.id || '');
}

function matchMaterialByScan(catalog, raw) {
  const cleaned = sanitizeWarehouseScannerInput(raw);
  if (!cleaned) return null;
  const keys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(cleaned));
  const q = cleaned.toLowerCase();
  for (const row of catalog || []) {
    const sku = String(row.family_sku || '');
    if (sku && sku.toLowerCase() === q) return row;
    const stored = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(sku));
    for (const k of keys) {
      if (k && stored.has(k)) return row;
    }
    if (String(row.name || '').toLowerCase().includes(q)) return row;
  }
  return null;
}

export default function ProductionJobMaterialsModal({
  visible,
  onClose,
  locale,
  textAlign,
  jobKind,
  jobId,
  returnOrderId = '',
  initialLines = [],
  onSaved,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setLines(
      (initialLines || []).map((row) => ({
        assembly_id: materialKey(row),
        name: row.name || '',
        family_sku: row.family_sku || '',
        uom: row.uom || 'ea',
        quantity: Math.max(0, Math.floor(Number(row.quantity) || 0)),
      })),
    );
    setSearch('');
    setError('');
  }, [visible, initialLines]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchProductionStoreroomMaterials();
      setCatalog(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || tUi('materialsLoadFailed', locale));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (visible) loadCatalog();
  }, [visible, loadCatalog]);

  const catalogById = useMemo(() => {
    const m = new Map();
    (catalog || []).forEach((row) => m.set(materialKey(row), row));
    return m;
  }, [catalog]);

  const addMaterial = (row) => {
    if (!row) return;
    const id = materialKey(row);
    setLines((prev) => {
      const found = prev.find((l) => l.assembly_id === id);
      if (found) {
        return prev.map((l) => (l.assembly_id === id
          ? { ...l, quantity: Math.max(1, (Number(l.quantity) || 0) + 1) }
          : l));
      }
      return [...prev, {
        assembly_id: id,
        name: row.name,
        family_sku: row.family_sku,
        uom: row.uom || 'ea',
        quantity: 1,
      }];
    });
  };

  const handleScan = (value) => {
    setScanOpen(false);
    const matched = matchMaterialByScan(catalog, value);
    if (matched) addMaterial(matched);
    else Alert.alert(tUi('quoteOrderMaterials', locale), tUi('manufactureSearchNoMatch', locale));
  };

  const filteredSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const keys = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(search));
    return catalog.filter((row) => {
      if (String(row.name || '').toLowerCase().includes(q)) return true;
      if (String(row.family_sku || '').toLowerCase().includes(q)) return true;
      const stored = expandWarehouseSkuMatchKeys(normalizeWarehouseProductSku(row.family_sku));
      for (const k of keys) {
        if (k && stored.has(k)) return true;
      }
      return false;
    }).slice(0, 12);
  }, [catalog, search]);

  const setLineQty = (aid, raw) => {
    const cleaned = String(raw || '').replace(/[^0-9.]/g, '');
    const n = cleaned === '' ? '' : String(Math.max(0, Math.floor(Number(cleaned) || 0)));
    setLines((prev) => prev.map((l) => (l.assembly_id === aid ? { ...l, quantity: n } : l)));
  };

  const bumpQty = (aid, delta) => {
    setLines((prev) => prev.map((l) => {
      if (l.assembly_id !== aid) return l;
      const cur = Math.max(0, Math.floor(Number(l.quantity) || 0));
      const next = Math.max(0, cur + delta);
      return { ...l, quantity: next };
    }));
  };

  const removeLine = (aid) => {
    setLines((prev) => prev.filter((l) => l.assembly_id !== aid));
  };

  const onSave = async () => {
    const payload = lines
      .map((l) => ({
        assembly_id: l.assembly_id,
        material_assembly_id: l.assembly_id,
        quantity: Math.max(0, Math.floor(Number(l.quantity) || 0)),
        uom: l.uom || 'ea',
      }))
      .filter((l) => l.assembly_id && l.quantity > 0);
    setSaving(true);
    setError('');
    try {
      await saveProductionJobMaterials({
        jobKind,
        jobId,
        returnOrderId,
        materialLines: payload,
      });
      onSaved?.(payload);
      onClose?.();
    } catch (e) {
      Alert.alert(tUi('quoteOrderMaterials', locale), e?.message || tUi('saveFailedGeneric', locale));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Text style={[styles.title, { textAlign }]}>{tUi('quoteOrderMaterials', locale)}</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={[kiosk.input, styles.searchInput, { textAlign: locale === 'ar' ? 'right' : 'left' }]}
            placeholder={tUi('manufactureSearch', locale)}
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          <Pressable style={styles.scanBtn} onPress={() => setScanOpen(true)}>
            <MaterialCommunityIcons name="barcode-scan" size={22} color="#fff" />
          </Pressable>
        </View>
        {loading ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 8 }} /> : null}
        {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
        {search.trim() && filteredSearch.length > 0 ? (
          <View style={styles.searchHits}>
            {filteredSearch.map((row) => (
              <Pressable key={row.id} style={styles.searchHit} onPress={() => addMaterial(row)}>
                <Text style={styles.hitName}>{row.name}</Text>
                <Text style={styles.hitSku}>{row.family_sku} · {row.uom || 'ea'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <FlatList
          style={styles.list}
          data={lines}
          keyExtractor={(item) => item.assembly_id}
          ListEmptyComponent={(
            <Text style={[kiosk.hint, { textAlign: 'center', marginTop: 12 }]}>
              {tUi('quoteOrderScanPlaceholder', locale)}
            </Text>
          )}
          renderItem={({ item }) => {
            const stock = catalogById.get(item.assembly_id);
            return (
              <View style={styles.lineRow}>
                <View style={styles.lineHead}>
                  <Text style={styles.lineName}>{item.name || stock?.name}</Text>
                  <Text style={styles.lineSku}>{item.family_sku || stock?.family_sku}</Text>
                  <Text style={styles.lineUom}>{tUi('manufactureRawQty', locale).replace('{qty}', String(stock?.quantity ?? '—'))}</Text>
                  <Text style={styles.lineUomLabel}>
                    {tUi('materialsUomLabel', locale)}: {item.uom || stock?.uom || 'ea'}
                  </Text>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable style={styles.stepBtn} onPress={() => bumpQty(item.assembly_id, -1)}>
                    <Text style={styles.stepTxt}>−</Text>
                  </Pressable>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="number-pad"
                    value={String(item.quantity ?? '')}
                    onChangeText={(txt) => setLineQty(item.assembly_id, txt)}
                  />
                  <Pressable style={styles.stepBtn} onPress={() => bumpQty(item.assembly_id, 1)}>
                    <Text style={styles.stepTxt}>+</Text>
                  </Pressable>
                  <Pressable onPress={() => removeLine(item.assembly_id)} style={styles.removeBtn}>
                    <MaterialCommunityIcons name="close-circle" size={28} color={theme.danger} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
        <View style={styles.footer}>
          <Pressable style={[kiosk.btn, styles.footerBtn]} disabled={saving} onPress={onClose}>
            <Text style={kiosk.btnText}>{tUi('cancel', locale)}</Text>
          </Pressable>
          <Pressable style={[kiosk.btn, kiosk.btnPrimary, styles.footerBtn]} disabled={saving} onPress={onSave}>
            <Text style={[kiosk.btnText, kiosk.btnPrimaryText]}>{saving ? '…' : tUi('confirm', locale)}</Text>
          </Pressable>
        </View>
        <ProductionQrScanModal
          visible={scanOpen}
          locale={locale}
          onClose={() => setScanOpen(false)}
          onScan={handleScan}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.surface, padding: 16, paddingTop: 48 },
  title: { fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 12 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  searchInput: { flex: 1, marginBottom: 0 },
  scanBtn: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchHits: { maxHeight: 140, marginBottom: 8, borderWidth: 1, borderColor: theme.border, borderRadius: 10 },
  searchHit: { padding: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  hitName: { fontWeight: '700', color: theme.text },
  hitSku: { color: theme.textMuted, fontSize: 13 },
  list: { flex: 1 },
  lineRow: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: theme.card,
  },
  lineHead: { marginBottom: 8 },
  lineName: { fontWeight: '800', color: theme.text, fontSize: 16 },
  lineSku: { color: theme.textMuted, fontSize: 13 },
  lineUom: { color: theme.primary, fontSize: 12, marginTop: 4 },
  lineUomLabel: { color: theme.textSecondary, fontSize: 12, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTxt: { fontSize: 22, fontWeight: '800', color: theme.text },
  qtyInput: {
    flex: 1,
    minWidth: 64,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingVertical: 8,
    textAlign: 'center',
    fontWeight: '800',
    color: theme.text,
  },
  removeBtn: { padding: 4 },
  footer: { flexDirection: 'row', gap: 12, marginTop: 8 },
  footerBtn: { flex: 1 },
});
