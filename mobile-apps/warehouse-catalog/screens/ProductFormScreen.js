import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView as ModalScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import WarehouseCatalogFormScroll from '../shared/WarehouseCatalogFormScroll';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehousePacketScan,
  normalizeWarehouseProductSku,
  normalizeWarehouseWedgeScanInput,
} from '../shared/warehouseScanResolver';
import { theme } from '../shared/theme';
import {
  useKeepSoftKeyboardOnScanSubmit,
  wedgeAwareTextChange,
} from '../shared/useKeepSoftKeyboardOnScanSubmit';

const INVENTORY_FINISHED = 'finished';
const INVENTORY_PACKETS = 'packets';

export default function ProductFormScreen({ route, navigation }) {
  const prefill = route.params?.prefill || {};
  const existing = Boolean(route.params?.existing && prefill.id);
  const [catalog, setCatalog] = useState(route.params?.catalogSnapshot || null);
  const [name, setName] = useState(prefill.name || '');
  const [turkishName, setTurkishName] = useState('');
  const [familySku, setFamilySku] = useState(prefill.family_sku || '');
  const [finishedOnly, setFinishedOnly] = useState(false);
  const [packetCount, setPacketCount] = useState(prefill.packet_count || '');
  const [categoryId, setCategoryId] = useState(prefill.category_id || '');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [hasColorVariants, setHasColorVariants] = useState(false);
  const [colorIds, setColorIds] = useState([]);
  const [colorDraft, setColorDraft] = useState('');
  const [packetLinks, setPacketLinks] = useState([]);
  const [packetSearch, setPacketSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const skuInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const turkishNameInputRef = useRef(null);
  const packetSearchInputRef = useRef(null);
  const scrollRef = useRef(null);
  const packetSearchSectionY = useRef(0);
  const {
    keepFocusAfterSubmit: keepSkuKeyboard,
    wrapOnBlur: wrapSkuBlur,
    stripScanTerminator: stripSkuTerminator,
  } = useKeepSoftKeyboardOnScanSubmit(skuInputRef);
  const {
    keepFocusAfterSubmit: keepPacketSearchKeyboard,
    wrapOnBlur: wrapPacketSearchBlur,
    stripScanTerminator: stripPacketSearchTerminator,
  } = useKeepSoftKeyboardOnScanSubmit(packetSearchInputRef);

  const warehouseLocationId = useMemo(
    () => catalog?.warehouseLocationId
      || route.params?.warehouseLocationId
      || route.params?.catalogSnapshot?.warehouseLocationId
      || null,
    [catalog, route.params?.warehouseLocationId, route.params?.catalogSnapshot],
  );
  const warehouseLocationName = useMemo(
    () => catalog?.warehouseLocationName
      || route.params?.catalogSnapshot?.warehouseLocationName
      || 'Warehouse',
    [catalog, route.params?.catalogSnapshot],
  );

  const focusSku = useCallback(() => {
    setTimeout(() => skuInputRef.current?.focus?.(), 50);
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      const data = await warehouseMobileRequest('catalog-list');
      setCatalog(data);
    } catch {
      /* keep last catalog if refresh fails */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshCatalog();
      if (!existing) focusSku();
    }, [existing, focusSku, refreshCatalog]),
  );

  const categories = catalog?.categories || [];
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => String(a.name || '').localeCompare(
      String(b.name || ''),
      undefined,
      { sensitivity: 'base' },
    )),
    [categories],
  );
  const selectedCategoryLabel = useMemo(() => {
    if (!categoryId) return 'Select category';
    const row = sortedCategories.find((c) => String(c.id) === String(categoryId));
    return row?.name || 'Select category';
  }, [categoryId, sortedCategories]);
  const colors = catalog?.colors || [];
  const packets = catalog?.packets || [];

  const title = useMemo(() => {
    if (existing) return 'Product (known SKU)';
    return 'New product';
  }, [existing]);

  const linkedColorNames = useMemo(() => {
    const map = new Map(colors.map((c) => [String(c.id), c.name]));
    return colorIds.map((id) => map.get(String(id)) || id);
  }, [colorIds, colors]);

  const packetSearchResults = useMemo(() => {
    const raw = packetSearch.trim();
    if (!raw) return [];
    const qKeys = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(raw));
    const linked = new Set(packetLinks.map((l) => String(l.packet_id)));
    return packets
      .filter((p) => !linked.has(String(p.id)))
      .filter((p) => {
        const nameMatch = String(p.name || '').toLowerCase().includes(raw.toLowerCase());
        if (nameMatch) return true;
        const stored = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(p.sku));
        for (const k of qKeys) {
          if (k && stored.has(k)) return true;
        }
        return String(p.sku || '').toLowerCase().includes(raw.toLowerCase());
      })
      .slice(0, 12);
  }, [packetSearch, packets, packetLinks]);

  const normalizeSkuField = () => {
    const normalized = normalizeWarehouseProductSku(familySku);
    if (normalized && normalized !== familySku.trim()) setFamilySku(normalized);
  };

  const addCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const { category } = await warehouseMobileRequest('category-create', { name: trimmed });
      setCatalog((prev) => ({
        ...(prev || {}),
        categories: [...(prev?.categories || []), category].sort((a, b) =>
          String(a.name).localeCompare(String(b.name))),
      }));
      setCategoryId(category.id);
      setNewCategoryName('');
      setNotice(`Category "${category.name}" added.`);
    } catch (err) {
      setError(err?.message || 'Failed to add category');
    } finally {
      setBusy(false);
    }
  };

  const addColor = async () => {
    const trimmed = colorDraft.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const { color } = await warehouseMobileRequest('color-find-or-create', { name: trimmed });
      setCatalog((prev) => ({
        ...(prev || {}),
        colors: [...(prev?.colors || []).filter((c) => String(c.id) !== String(color.id)), color],
      }));
      if (!colorIds.some((id) => String(id) === String(color.id))) {
        setColorIds((prev) => [...prev, color.id]);
      }
      setColorDraft('');
    } catch (err) {
      setError(err?.message || 'Failed to add color');
    } finally {
      setBusy(false);
    }
  };

  const addPacketLink = (packet) => {
    const defaultQty = Math.max(1, Number(packet?.qty_per_unit) || 1);
    setPacketLinks((prev) => [...prev, { packet_id: packet.id, qty_per_unit: defaultQty }]);
    keepPacketSearchKeyboard();
  };

  const scrollPacketSearchIntoView = useCallback(() => {
    setTimeout(() => {
      const y = Math.max(0, packetSearchSectionY.current - 12);
      scrollRef.current?.scrollTo?.({ y, animated: true });
    }, 120);
  }, []);

  const onPacketBarcodeScan = useCallback((normalized) => {
    const linked = new Set(packetLinks.map((l) => String(l.packet_id)));
    const match = (packets || []).find((p) => {
      if (linked.has(String(p.id))) return false;
      const keys = expandWarehouseSkuMatchKeys(normalizeWarehousePacketScan(p.sku));
      const scanKeys = expandWarehouseSkuMatchKeys(normalized);
      for (const k of scanKeys) {
        if (k && keys.has(k)) return true;
      }
      return false;
    });
    if (match) {
      addPacketLink(match);
      return;
    }
    setPacketSearch(normalized);
    keepPacketSearchKeyboard();
  }, [keepPacketSearchKeyboard, packetLinks, packets]);

  const onProductSkuSubmit = () => {
    normalizeSkuField();
    keepSkuKeyboard();
  };

  const onPacketSearchSubmit = () => {
    const normalized = normalizeWarehousePacketScan(packetSearch);
    if (normalized) onPacketBarcodeScan(normalized);
    else keepPacketSearchKeyboard();
  };

  const onSave = async () => {
    if (existing) {
      setNotice('Edit on mobile is Phase 2 — open web warehouse for changes.');
      return;
    }
    if (!warehouseLocationId) {
      setError(
        'Warehouse location could not be resolved. Open Warehouse Products on the web once to confirm catalog loads, then retry.',
      );
      return;
    }
    const normalizedSku = normalizeWarehouseProductSku(familySku);
    if (!normalizedSku) {
      setError('Product SKU is required.');
      return;
    }
    if (!finishedOnly && packetLinks.length === 0) {
      setError('Link at least one packet, or turn on finished-only mode.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await warehouseMobileRequest('assembly-save', {
        name: name.trim(),
        family_sku: normalizedSku,
        category_id: categoryId || null,
        packet_count: finishedOnly ? null : Number(packetCount),
        inventory_mode: finishedOnly ? INVENTORY_FINISHED : INVENTORY_PACKETS,
        has_color_variants: hasColorVariants,
        color_ids: hasColorVariants ? colorIds : [],
        location_ids: [],
        warehouse_location_id: warehouseLocationId,
        packet_links: finishedOnly ? [] : packetLinks,
      });
      setNotice('Product created.');
      setTimeout(() => navigation.navigate('WarehouseProducts'), 800);
    } catch (err) {
      setError(err?.message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <WarehouseCatalogFormScroll scrollRef={scrollRef} contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {!existing ? (
        <>
          <View style={styles.rowSwitch}>
            <Text style={styles.label}>Finished units only — no packet BOM</Text>
            <Switch value={finishedOnly} onValueChange={setFinishedOnly} />
          </View>
          <Text style={styles.hint}>
            {finishedOnly
              ? 'Pre-boxed sellable units only. Link packets on Warehouse Packets if you build from cartons.'
              : 'Link warehouse packets below: set total packets and qty per product (e.g. 2 of the same carton).'}
          </Text>
        </>
      ) : null}
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        inputRef={nameInputRef}
        returnKeyType="next"
        onSubmitEditing={() => turkishNameInputRef.current?.focus?.()}
      />
      <Field
        label="Turkish name"
        value={turkishName}
        onChangeText={setTurkishName}
        inputRef={turkishNameInputRef}
        placeholder="Optional — not saved to catalog"
        returnKeyType="next"
        onSubmitEditing={focusSku}
      />
      <Text style={styles.fieldHint}>Turkish name is for your reference only on this screen.</Text>
      <Field
        label="SKU (finished product)"
        value={familySku}
        editable={!existing}
        mono
        onBlur={wrapSkuBlur(normalizeSkuField)}
        inputRef={skuInputRef}
        returnKeyType="done"
        onChangeText={wedgeAwareTextChange(setFamilySku, {
          stripScanTerminator: stripSkuTerminator,
          keepFocusAfterSubmit: keepSkuKeyboard,
          transform: (v) => v.toUpperCase(),
          normalize: (v) => normalizeWarehouseWedgeScanInput(v, 'product'),
        })}
        onSubmitEditing={onProductSkuSubmit}
      />
      {!existing && !finishedOnly && (
        <Field
          label="Total packets"
          value={packetCount}
          onChangeText={setPacketCount}
          keyboardType="number-pad"
        />
      )}
      <Text style={styles.label}>Category</Text>
      <Pressable
        style={styles.select}
        onPress={() => setCategoryPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Choose category"
      >
        <Text style={styles.selectText}>{selectedCategoryLabel}</Text>
        <Text style={styles.selectChevron}>▾</Text>
      </Pressable>
      <Modal
        visible={categoryPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCategoryPickerOpen(false)}>
          <View style={styles.pickerSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerTitle}>Category (A–Z)</Text>
            <ModalScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              <Pressable
                style={styles.pickerRow}
                onPress={() => {
                  setCategoryId('');
                  setCategoryPickerOpen(false);
                }}
              >
                <Text style={styles.pickerRowText}>— None —</Text>
              </Pressable>
              {sortedCategories.map((c) => (
                <Pressable
                  key={c.id}
                  style={[
                    styles.pickerRow,
                    String(categoryId) === String(c.id) && styles.pickerRowActive,
                  ]}
                  onPress={() => {
                    setCategoryId(c.id);
                    setCategoryPickerOpen(false);
                  }}
                >
                  <Text style={styles.pickerRowText}>{c.name}</Text>
                </Pressable>
              ))}
            </ModalScrollView>
          </View>
        </Pressable>
      </Modal>
      <View style={styles.inlineAdd}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="New category name"
          placeholderTextColor="#64748b"
          value={newCategoryName}
          onChangeText={setNewCategoryName}
          blurOnSubmit={false}
          showSoftInputOnFocus
        />
        <Pressable style={styles.smallBtn} onPress={addCategory} disabled={busy}>
          <Text style={styles.smallBtnText}>Add</Text>
        </Pressable>
      </View>
      <View style={styles.rowSwitch}>
        <Text style={styles.label}>Variant colors</Text>
        <Switch value={hasColorVariants} onValueChange={setHasColorVariants} />
      </View>
      {hasColorVariants ? (
        <>
          <View style={styles.inlineAdd}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Color name"
              placeholderTextColor="#64748b"
              value={colorDraft}
              onChangeText={setColorDraft}
              blurOnSubmit={false}
              showSoftInputOnFocus
            />
            <Pressable style={styles.smallBtn} onPress={addColor} disabled={busy}>
              <Text style={styles.smallBtnText}>Add</Text>
            </Pressable>
          </View>
          {linkedColorNames.length ? (
            <Text style={styles.hint}>Colors: {linkedColorNames.join(', ')}</Text>
          ) : null}
        </>
      ) : null}
      {!existing && !finishedOnly && (
        <View
          collapsable={false}
          onLayout={(e) => {
            packetSearchSectionY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.label}>Packets that build this product</Text>
          <Text style={styles.label}>Search packet SKU or name</Text>
          <TextInput
            ref={packetSearchInputRef}
            style={styles.input}
            placeholder="Type to filter — stays after you add a packet"
            placeholderTextColor="#64748b"
            value={packetSearch}
            onChangeText={wedgeAwareTextChange(setPacketSearch, {
              stripScanTerminator: stripPacketSearchTerminator,
              keepFocusAfterSubmit: keepPacketSearchKeyboard,
              transform: (v) => v.toUpperCase(),
              normalize: (v) => normalizeWarehouseWedgeScanInput(v, 'packet'),
            })}
            autoCapitalize="characters"
            blurOnSubmit={false}
            showSoftInputOnFocus
            returnKeyType="done"
            onSubmitEditing={onPacketSearchSubmit}
            onBlur={wrapPacketSearchBlur()}
            onFocus={scrollPacketSearchIntoView}
          />
          {packetSearchResults.map((p) => (
            <Pressable
              key={p.id}
              style={styles.pickRow}
              onPress={() => addPacketLink(p)}
            >
              <Text style={styles.pickSku}>{p.sku}</Text>
              <Text style={styles.pickName}>{p.name}</Text>
            </Pressable>
          ))}
          {packetLinks.map((link) => {
            const p = packets.find((x) => String(x.id) === String(link.packet_id));
            return (
              <View key={link.packet_id} style={styles.linkedRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickSku}>{p?.sku || link.packet_id}</Text>
                  <Text style={styles.pickName} numberOfLines={1}>{p?.name}</Text>
                </View>
                <Text style={styles.qtyLabel}>Qty</Text>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="number-pad"
                  blurOnSubmit={false}
                  showSoftInputOnFocus
                  value={String(link.qty_per_unit)}
                  onChangeText={(v) => {
                    const qty = Math.max(1, Math.floor(Number(v) || 1));
                    setPacketLinks((prev) => prev.map((l) => (
                      String(l.packet_id) === String(link.packet_id)
                        ? { ...l, qty_per_unit: qty }
                        : l
                    )));
                  }}
                />
                <Pressable
                  onPress={() => setPacketLinks((prev) =>
                    prev.filter((l) => String(l.packet_id) !== String(link.packet_id)))}
                >
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {!existing && (
        <Pressable style={styles.btn} onPress={onSave} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Saving…' : 'Create product'}</Text>
        </Pressable>
      )}
    </WarehouseCatalogFormScroll>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editable = true,
  keyboardType,
  mono,
  onBlur,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  placeholder,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={[styles.input, !editable && styles.inputDisabled, mono && styles.mono]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        autoCapitalize={mono ? 'characters' : 'sentences'}
        autoComplete="off"
        blurOnSubmit={false}
        showSoftInputOnFocus
        onBlur={onBlur}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, backgroundColor: theme.bg, flexGrow: 1 },
  title: { color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  field: { marginBottom: 14 },
  label: { color: theme.textMuted, marginBottom: 6, flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: theme.text,
    marginBottom: 8,
  },
  mono: { fontFamily: 'monospace' },
  inputDisabled: { opacity: 0.7 },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  fieldHint: {
    color: theme.textDim,
    fontSize: 12,
    marginTop: -6,
    marginBottom: 12,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 8,
    backgroundColor: '#1e293b',
  },
  selectText: { color: theme.text, fontSize: 15, flex: 1 },
  selectChevron: { color: theme.textMuted, fontSize: 16, marginLeft: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  pickerSheet: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '70%',
    paddingVertical: 12,
  },
  pickerTitle: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pickerList: { maxHeight: 360 },
  pickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  pickerRowActive: { backgroundColor: '#0c4a6e' },
  pickerRowText: { color: theme.text, fontSize: 16 },
  inlineAdd: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  smallBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  smallBtnText: { color: '#f8fafc', fontWeight: '600' },
  hint: { color: theme.textMuted, marginBottom: 12, fontSize: 13, lineHeight: 18 },
  pickRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  pickSku: { color: '#38bdf8', fontFamily: 'monospace', width: 110, fontSize: 11 },
  pickName: { color: '#e2e8f0', flex: 1, fontSize: 13 },
  linkedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  qtyLabel: { color: theme.textMuted, fontSize: 12 },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: theme.text,
    width: 48,
    textAlign: 'center',
  },
  remove: { color: '#f87171' },
  btn: {
    backgroundColor: theme.primaryBg,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.primaryDark,
  },
  btnText: { color: theme.text, fontWeight: '600' },
  error: { color: theme.danger, marginTop: 8 },
  notice: { color: theme.success, marginTop: 8 },
});
