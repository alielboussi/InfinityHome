import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KITWE_LOCATION_ID, LUSAKA_BRANCH_ID } from '../shared/locationIds';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

const INVENTORY_FINISHED = 'finished';
const INVENTORY_PACKETS = 'packets';

const DEFAULT_LOCATION_IDS = [KITWE_LOCATION_ID, LUSAKA_BRANCH_ID];

export default function ProductFormScreen({ route, navigation }) {
  const prefill = route.params?.prefill || {};
  const existing = Boolean(route.params?.existing && prefill.id);
  const warehouseLocationId = route.params?.warehouseLocationId
    || route.params?.catalogSnapshot?.warehouseLocationId;

  const [catalog, setCatalog] = useState(route.params?.catalogSnapshot || null);
  const [name, setName] = useState(prefill.name || '');
  const [familySku, setFamilySku] = useState(prefill.family_sku || '');
  const [finishedOnly, setFinishedOnly] = useState(true);
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

  useEffect(() => {
    if (!catalog && warehouseLocationId) {
      warehouseMobileRequest('catalog-list')
        .then(setCatalog)
        .catch(() => {});
    }
  }, [catalog, warehouseLocationId]);

  const categories = catalog?.categories || [];
  const colors = catalog?.colors || [];
  const packets = catalog?.packets || [];

  const title = useMemo(() => (existing ? 'Product (known SKU)' : 'New product'), [existing]);

  const linkedColorNames = useMemo(() => {
    const map = new Map(colors.map((c) => [String(c.id), c.name]));
    return colorIds.map((id) => map.get(String(id)) || id);
  }, [colorIds, colors]);

  const packetSearchResults = useMemo(() => {
    const q = packetSearch.trim().toLowerCase();
    if (!q) return [];
    const linked = new Set(packetLinks.map((l) => String(l.packet_id)));
    return packets
      .filter((p) => !linked.has(String(p.id)))
      .filter(
        (p) => String(p.sku || '').toLowerCase().includes(q)
          || String(p.name || '').toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [packetSearch, packets, packetLinks]);

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

  const onSave = async () => {
    if (existing) {
      setNotice('Edit on mobile is Phase 2 — open web warehouse for changes.');
      return;
    }
    if (!warehouseLocationId) {
      setError('Warehouse location is not configured.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await warehouseMobileRequest('assembly-save', {
        name: name.trim(),
        family_sku: familySku.trim(),
        category_id: categoryId || null,
        packet_count: finishedOnly ? null : Number(packetCount),
        inventory_mode: finishedOnly ? INVENTORY_FINISHED : INVENTORY_PACKETS,
        has_color_variants: hasColorVariants,
        color_ids: hasColorVariants ? colorIds : [],
        location_ids: DEFAULT_LOCATION_IDS,
        warehouse_location_id: warehouseLocationId,
        packet_links: packetLinks,
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
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="SKU" value={familySku} onChangeText={setFamilySku} editable={!existing} mono />
      <View style={styles.rowSwitch}>
        <Text style={styles.label}>Finished units only — no packet BOM yet</Text>
        <Switch value={finishedOnly} onValueChange={setFinishedOnly} />
      </View>
      {!finishedOnly && (
        <Field
          label="Total packets"
          value={packetCount}
          onChangeText={setPacketCount}
          keyboardType="number-pad"
        />
      )}
      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.chip, String(categoryId) === String(c.id) && styles.chipActive]}
            onPress={() => setCategoryId(c.id)}
          >
            <Text style={styles.chipText}>{c.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.inlineAdd}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="New category name"
          placeholderTextColor="#64748b"
          value={newCategoryName}
          onChangeText={setNewCategoryName}
        />
        <Pressable style={styles.smallBtn} onPress={addCategory} disabled={busy}>
          <Text style={styles.smallBtnText}>Add</Text>
        </Pressable>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Locations</Text>
        <Text style={styles.lockedValue}>Kitwe · Lusaka (fixed)</Text>
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
      {!finishedOnly && (
        <>
          <Text style={styles.label}>Packets that build this product</Text>
          <TextInput
            style={styles.input}
            placeholder="Search packet SKU or name"
            placeholderTextColor="#64748b"
            value={packetSearch}
            onChangeText={setPacketSearch}
          />
          {packetSearchResults.map((p) => (
            <Pressable
              key={p.id}
              style={styles.pickRow}
              onPress={() => {
                setPacketLinks((prev) => [...prev, { packet_id: p.id, qty_per_unit: 1 }]);
                setPacketSearch('');
              }}
            >
              <Text style={styles.pickSku}>{p.sku}</Text>
              <Text style={styles.pickName}>{p.name}</Text>
            </Pressable>
          ))}
          {packetLinks.map((link) => {
            const p = packets.find((x) => String(x.id) === String(link.packet_id));
            return (
              <View key={link.packet_id} style={styles.linkedRow}>
                <Text style={styles.pickName}>{p?.sku || link.packet_id}</Text>
                <Pressable
                  onPress={() => setPacketLinks((prev) =>
                    prev.filter((l) => String(l.packet_id) !== String(link.packet_id)))}
                >
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {!existing && (
        <Pressable style={styles.btn} onPress={onSave} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Saving…' : 'Create product'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Field({ label, value, onChangeText, editable = true, keyboardType, mono }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled, mono && styles.mono]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        placeholderTextColor="#64748b"
        autoCapitalize={mono ? 'characters' : 'sentences'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, backgroundColor: '#0f172a', flexGrow: 1 },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { color: '#94a3b8', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    marginBottom: 8,
  },
  mono: { fontFamily: 'monospace' },
  inputDisabled: { opacity: 0.7 },
  lockedValue: { color: '#cbd5e1', marginBottom: 8 },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { borderColor: '#38bdf8', backgroundColor: '#1e3a5f' },
  chipText: { color: '#e2e8f0', fontSize: 13 },
  inlineAdd: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  smallBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  smallBtnText: { color: '#f8fafc', fontWeight: '600' },
  hint: { color: '#94a3b8', marginBottom: 12, fontSize: 13 },
  pickRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  pickSku: { color: '#38bdf8', fontFamily: 'monospace', width: 100, fontSize: 12 },
  pickName: { color: '#e2e8f0', flex: 1, fontSize: 13 },
  linkedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  remove: { color: '#f87171' },
  btn: {
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#e2e8f0', fontWeight: '600' },
  error: { color: '#f87171', marginTop: 8 },
  notice: { color: '#4ade80', marginTop: 8 },
});
