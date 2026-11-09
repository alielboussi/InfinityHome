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
} from '../services/paintingApi';
import { theme } from '../shared/theme';
import StoreroomDeductionPromptModal from '../shared/components/StoreroomDeductionPromptModal';
import {
  buildUomLabelMap,
  enrichCatalogMaterialUom,
  filterInStockCatalogMaterials,
  formatMaterialUom,
  humanizeUomCode,
  materialLineKey,
  materialLinesNeedStoreroomPick,
  mergeCatalogByFamilySku,
  parseStoreroomsFromMaterialsApi,
  storeroomDeductionStrings,
} from '../shared/lib/storeroomDeductionFlow';
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
  productionRoute = '',
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
  const [storerooms, setStorerooms] = useState([]);
  const [storeroomPromptVisible, setStoreroomPromptVisible] = useState(false);
  const [pendingSavePayload, setPendingSavePayload] = useState(null);
  const [pendingAddRow, setPendingAddRow] = useState(null);

  const storeroomCopy = useMemo(() => storeroomDeductionStrings(tUi, locale), [locale]);

  useEffect(() => {
    if (!visible) return;
    setLines(
      (initialLines || []).map((row) => ({
        assembly_id: materialKey(row),
        name: row.name || '',
        family_sku: row.family_sku || '',
        uom: row.uom || 'ea',
        uom_label: row.uom_label || humanizeUomCode(row.uom || 'ea'),
        warehouse_location_id: row.warehouse_location_id || '',
        storeroom_label: row.storeroom_label || '',
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
      const payload = await fetchProductionStoreroomMaterials();
      const raw = Array.isArray(payload) ? payload : (payload?.materials || []);
      const uomMap = buildUomLabelMap(Array.isArray(payload) ? {} : payload);
      const list = enrichCatalogMaterialUom(
        filterInStockCatalogMaterials(mergeCatalogByFamilySku(raw)),
        uomMap,
      );
      setCatalog(list);
      const storeroomPayload = Array.isArray(payload) ? { materials: list } : { ...payload, materials: list };
      setStorerooms(parseStoreroomsFromMaterialsApi(storeroomPayload));
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

  const storeroomLabelForId = (id) => {
    const row = (storerooms || []).find((s) => String(s.id) === String(id));
    return row?.label || row?.name || '';
  };

  const finalizeAddMaterial = (row, storeroomLocationId) => {
    if (!row || !storeroomLocationId) return;
    const assemblyId = materialKey(row);
    const locId = String(storeroomLocationId);
    const draft = {
      assembly_id: assemblyId,
      name: row.name,
      family_sku: row.family_sku,
      uom: row.uom || 'ea',
      uom_label: row.uom_label || '',
      warehouse_location_id: locId,
      storeroom_label: storeroomLabelForId(locId),
    };
    const key = materialLineKey(draft);
    setLines((prev) => {
      const found = prev.find((l) => materialLineKey(l) === key);
      if (found) {
        return prev.map((l) => (materialLineKey(l) === key
          ? { ...l, quantity: Math.max(1, (Number(l.quantity) || 0) + 1) }
          : l));
      }
      return [...prev, { ...draft, quantity: 1 }];
    });
    setSearch('');
  };

  const requestAddMaterial = (row) => {
    if (!row) return;
    if (!(storerooms || []).some((s) => String(s.id || '').trim())) {
      Alert.alert(
        tUi('quoteOrderMaterials', locale),
        tUi('storeroomDeductNoList', locale) || 'Storerooms could not be loaded.',
      );
      return;
    }
    setPendingAddRow(row);
    setPendingSavePayload(null);
    setStoreroomPromptVisible(true);
  };

  const handleScan = (value) => {
    setScanOpen(false);
    const matched = matchMaterialByScan(catalog, value);
    if (matched) requestAddMaterial(matched);
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

  const setLineQty = (lineId, raw) => {
    const cleaned = String(raw || '').replace(/[^0-9.]/g, '');
    const n = cleaned === '' ? '' : String(Math.max(0, Math.floor(Number(cleaned) || 0)));
    setLines((prev) => prev.map((l) => (materialLineKey(l) === lineId ? { ...l, quantity: n } : l)));
  };

  const bumpQty = (lineId, delta) => {
    setLines((prev) => prev.map((l) => {
      if (materialLineKey(l) !== lineId) return l;
      const cur = Math.max(0, Math.floor(Number(l.quantity) || 0));
      const next = Math.max(0, cur + delta);
      return { ...l, quantity: next };
    }));
  };

  const removeLine = (lineId) => {
    setLines((prev) => prev.filter((l) => materialLineKey(l) !== lineId));
  };

  const commitSave = async (preferredStoreroomLocationId, payload) => {
    setSaving(true);
    setError('');
    try {
      await saveProductionJobMaterials({
        jobKind,
        jobId,
        returnOrderId,
        productionRoute,
        materialLines: payload,
        preferredStoreroomLocationId,
      });
      onSaved?.(payload);
      onClose?.();
    } catch (e) {
      Alert.alert(tUi('quoteOrderMaterials', locale), e?.message || tUi('saveFailedGeneric', locale));
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    const payload = lines
      .map((l) => ({
        assembly_id: l.assembly_id,
        material_assembly_id: l.assembly_id,
        quantity: Math.max(0, Math.floor(Number(l.quantity) || 0)),
        uom: l.uom || 'ea',
        warehouse_location_id: l.warehouse_location_id || undefined,
      }))
      .filter((l) => l.assembly_id && l.quantity > 0);
    if (!materialLinesNeedStoreroomPick(payload)) {
      await commitSave(null, payload);
      return;
    }
    setPendingSavePayload(payload);
    setStoreroomPromptVisible(true);
  };

  return (
    <>
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Text style={[styles.title, { textAlign }]}>{tUi('quoteOrderMaterials', locale)}</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={[kiosk.input, styles.searchInput, { textAlign: locale === 'ar' ? 'right' : 'left' }]}
            placeholder={tUi('materialsSearch', locale)}
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
              <Pressable key={row.id} style={styles.searchHit} onPress={() => requestAddMaterial(row)}>
                <Text style={styles.hitName}>{row.name}</Text>
                <Text style={styles.hitSku}>{row.family_sku} · {formatMaterialUom(row)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <FlatList
          style={styles.list}
          data={lines}
          keyExtractor={(item) => materialLineKey(item)}
          ListEmptyComponent={(
            <Text style={[kiosk.hint, { textAlign: 'center', marginTop: 12 }]}>
              {tUi('quoteOrderScanPlaceholder', locale)}
            </Text>
          )}
          renderItem={({ item }) => {
            const stock = catalogById.get(item.assembly_id);
            const lineId = materialLineKey(item);
            return (
              <View style={styles.lineRow}>
                <View style={styles.lineHead}>
                  <Text style={styles.lineName}>{item.name || stock?.name}</Text>
                  <Text style={styles.lineSku}>{item.family_sku || stock?.family_sku}</Text>
                  {item.storeroom_label ? (
                    <Text style={styles.lineUom}>{item.storeroom_label}</Text>
                  ) : null}
                  <Text style={styles.lineUom}>{tUi('manufactureRawQty', locale).replace('{qty}', String(stock?.quantity ?? '—'))}</Text>
                  <Text style={styles.lineUomLabel}>
                    {tUi('materialsUomLabel', locale)}: {formatMaterialUom(item) || formatMaterialUom(stock) || 'ea'}
                  </Text>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable style={styles.stepBtn} onPress={() => bumpQty(lineId, -1)}>
                    <Text style={styles.stepTxt}>−</Text>
                  </Pressable>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="number-pad"
                    value={String(item.quantity ?? '')}
                    onChangeText={(txt) => setLineQty(lineId, txt)}
                  />
                  <Pressable style={styles.stepBtn} onPress={() => bumpQty(lineId, 1)}>
                    <Text style={styles.stepTxt}>+</Text>
                  </Pressable>
                  <Pressable onPress={() => removeLine(lineId)} style={styles.removeBtn}>
                    <MaterialCommunityIcons name="close-circle" size={28} color={theme.danger} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
        <View style={styles.footer}>
          <View style={styles.footerSlot}>
            <Pressable
              style={[styles.footerAction, styles.footerCancel]}
              disabled={saving}
              onPress={onClose}
            >
              <Text style={styles.footerCancelText}>{tUi('cancel', locale)}</Text>
            </Pressable>
          </View>
          <View style={styles.footerSlot}>
            <Pressable
              style={[styles.footerAction, styles.footerConfirm]}
              disabled={saving}
              onPress={onSave}
            >
              <Text style={styles.footerConfirmText}>{saving ? '…' : tUi('confirm', locale)}</Text>
            </Pressable>
          </View>
        </View>
        <ProductionQrScanModal
          visible={scanOpen}
          locale={locale}
          onClose={() => setScanOpen(false)}
          onScan={handleScan}
        />
      </View>
    </Modal>
    <StoreroomDeductionPromptModal
      visible={storeroomPromptVisible}
      locale={locale}
      textAlign={textAlign}
      storerooms={storerooms}
      {...storeroomCopy}
      onCancel={() => {
        setStoreroomPromptVisible(false);
        setPendingSavePayload(null);
        setPendingAddRow(null);
      }}
      onConfirm={(preferredId) => {
        setStoreroomPromptVisible(false);
        const addRow = pendingAddRow;
        const payload = pendingSavePayload;
        setPendingAddRow(null);
        setPendingSavePayload(null);
        if (addRow) finalizeAddMaterial(addRow, preferredId);
        else if (payload) commitSave(preferredId, payload);
      }}
    />
    </>
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
  footer: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  footerSlot: { flex: 1, flexBasis: 0, minWidth: 0 },
  footerAction: {
    width: '100%',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: theme.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  footerCancel: {
    backgroundColor: theme.surfaceElevated,
    borderColor: theme.border,
  },
  footerConfirm: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  footerCancelText: { fontWeight: '800', fontSize: 16, color: theme.text, textAlign: 'center' },
  footerConfirmText: { fontWeight: '800', fontSize: 16, color: '#fff', textAlign: 'center' },
});
