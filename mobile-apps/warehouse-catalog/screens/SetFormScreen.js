import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import WarehouseCatalogFormScroll from '../shared/WarehouseCatalogFormScroll';
import GenerateRandomSkuButton from '../shared/GenerateRandomSkuButton';
import { useWarehouseCatalog } from '../shared/WarehouseCatalogContext';
import { warehouseMobileRequest, formatWarehouseMobileApiError } from '../shared/warehouseMobileApi';
import { isSetAssembly } from '../shared/warehouseCatalogProductCompleteness';
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../../../src/constants/warehouseShowroomLocations.js';
import { normalizeWarehouseProductSku } from '../shared/warehouseScanResolver';
import { theme } from '../shared/theme';
import { formButtonStyles } from '../shared/formButtonStyles';

export default function SetFormScreen({ navigation }) {
  const { catalog, refresh } = useWarehouseCatalog();
  const [name, setName] = useState('');
  const [familySku, setFamilySku] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState([]);

  const products = useMemo(
    () => (catalog?.assemblies || []).filter((a) => !isSetAssembly(a)),
    [catalog],
  );

  const toggleProduct = (assembly) => {
    const id = String(assembly.id);
    setPicked((prev) => {
      const hit = prev.find((p) => String(p.component_assembly_id) === id);
      if (hit) return prev.filter((p) => String(p.component_assembly_id) !== id);
      return [...prev, { component_assembly_id: id, quantity: 1, label: assembly.name }];
    });
  };

  const setQty = (assemblyId, delta) => {
    setPicked((prev) => prev.map((p) => {
      if (String(p.component_assembly_id) !== String(assemblyId)) return p;
      return { ...p, quantity: Math.max(1, (Number(p.quantity) || 1) + delta) };
    }));
  };

  const save = async () => {
    const trimmed = String(name || '').trim();
    const sku = normalizeWarehouseProductSku(familySku);
    if (!trimmed) {
      Alert.alert('Set', 'Name is required.');
      return;
    }
    if (!sku) {
      Alert.alert('Set', 'SKU is required.');
      return;
    }
    if (!picked.length) {
      Alert.alert('Set', 'Add at least one product.');
      return;
    }
    setBusy(true);
    try {
      await warehouseMobileRequest('assembly-save', {
        catalog_kind: 'set',
        create_portal: 'warehouse-catalog-mobile',
        name: trimmed,
        family_sku: sku,
        warehouse_location_id: catalog?.warehouseLocationId,
        set_location_id: WAREHOUSE_FACTORY_LOCATION_ID,
        location_ids: catalog?.warehouseLocationId ? [catalog.warehouseLocationId] : [],
        set_components: picked.map((p) => ({
          component_assembly_id: p.component_assembly_id,
          quantity: p.quantity,
        })),
      });
      await refresh({ force: true, fullPackets: true });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Set', formatWarehouseMobileApiError(err?.message, 'Save failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <WarehouseCatalogFormScroll>
      <Text style={styles.label}>Set name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Living room set" />
      <Text style={styles.label}>Set SKU</Text>
      <View style={styles.skuRow}>
        <TextInput style={[styles.input, styles.skuInput]} value={familySku} onChangeText={setFamilySku} />
        <GenerateRandomSkuButton onGenerated={setFamilySku} />
      </View>
      <Text style={styles.section}>Products in set</Text>
      {products.map((a) => {
        const sel = picked.find((p) => String(p.component_assembly_id) === String(a.id));
        return (
          <View key={a.id} style={styles.productRow}>
            <Pressable style={styles.productPick} onPress={() => toggleProduct(a)}>
              <Text>{sel ? '☑' : '☐'} {a.name}</Text>
            </Pressable>
            {sel ? (
              <View style={styles.qtyRow}>
                <Pressable onPress={() => setQty(a.id, -1)}><Text style={styles.qtyBtn}>−</Text></Pressable>
                <Text style={styles.qtyVal}>{sel.quantity}</Text>
                <Pressable onPress={() => setQty(a.id, 1)}><Text style={styles.qtyBtn}>+</Text></Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
      <Pressable
        style={[formButtonStyles.primaryBtn, busy && formButtonStyles.primaryBtnDisabled]}
        onPress={save}
        disabled={busy}
      >
        <Text style={formButtonStyles.primaryBtnText}>{busy ? 'Saving…' : 'Save set'}</Text>
      </Pressable>
    </WarehouseCatalogFormScroll>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600', marginTop: 12, marginBottom: 6, color: theme.text },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: theme.card,
    color: theme.text,
  },
  skuRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skuInput: { flex: 1 },
  section: { fontWeight: '700', fontSize: 16, marginTop: 20, marginBottom: 8, color: theme.text },
  productRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  productPick: { flex: 1 },
  qtyRow: { flexDirection: 'row', alignItems: 'center' },
  qtyBtn: { fontSize: 20, paddingHorizontal: 10, color: theme.primary },
  qtyVal: { minWidth: 24, textAlign: 'center' },
});
