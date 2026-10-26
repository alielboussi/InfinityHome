import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import ProductionVirtualKeyboard from '../components/ProductionVirtualKeyboard';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { filterPacketsForProductionSearch } from '../lib/productionPacketSearch';
import { kioskScreenEdges } from '../lib/kioskLayout';
import { tUi } from '../lib/productionKioskI18n';
import ProductionLabelPreviewModal from '../components/ProductionLabelPreviewModal';
import {
  fetchProductionCatalog,
  increaseProductionStock,
  resolveProductionScan,
} from '../services/productionApi';

function packetWarehouseQty(packetId, inventory, locationId) {
  const row = (inventory || []).find(
    (r) => String(r.packet_id) === String(packetId) && String(r.location_id) === String(locationId),
  );
  return Math.max(0, Number(row?.quantity) || 0);
}

export default function StockScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign, isArabic } = useProductionKioskLocale();

  const [loading, setLoading] = useState(true);
  const [packets, setPackets] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const [modalPacket, setModalPacket] = useState(null);
  const [addQty, setAddQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [labelPreview, setLabelPreview] = useState(null);
  const [labelPng, setLabelPng] = useState('');
  const [labelCopies, setLabelCopies] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchProductionCatalog();
      setPackets(data.packets || []);
      setInventory(data.inventory || []);
      setWarehouseLocationId(data.warehouseLocationId);
    } catch (err) {
      setError(err?.message || 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => filterPacketsForProductionSearch(packets, search, { limit: 25 }),
    [packets, search],
  );

  const openPacketModal = (packet) => {
    setModalPacket(packet);
    setAddQty(1);
    setError('');
    setSuccess('');
  };

  const tryResolveScan = async (raw) => {
    const scan = String(raw || '').trim();
    if (!scan) return;
    try {
      const result = await resolveProductionScan(scan);
      if (result?.kind === 'packet' && result.packet) {
        openPacketModal(result.packet);
        setSearch(result.packet.name || scan);
        return;
      }
      const q = scan.replace(/\s+/g, '');
      const local = (packets || []).find((p) => String(p.sku).toUpperCase() === q.toUpperCase());
      if (local) {
        openPacketModal(local);
        return;
      }
      const fromSearch = filterPacketsForProductionSearch(packets, scan, { limit: 1 });
      if (fromSearch.length === 1) {
        openPacketModal(fromSearch[0]);
        return;
      }
      setError(tUi('stockNoMatch', locale));
    } catch (err) {
      setError(err?.message || tUi('stockNoMatch', locale));
    }
  };

  const runSearch = () => {
    setError('');
    if (filtered.length === 1) {
      openPacketModal(filtered[0]);
      return;
    }
    if (filtered.length > 1) return;
    tryResolveScan(search);
  };

  const currentQty = modalPacket
    ? packetWarehouseQty(modalPacket.id, inventory, warehouseLocationId)
    : 0;

  const onSaveIncrease = async () => {
    if (!modalPacket || !warehouseLocationId) return;
    const delta = Math.max(1, Math.floor(Number(addQty) || 0));
    setSaving(true);
    setError('');
    try {
      const result = await increaseProductionStock({
        packetId: modalPacket.id,
        warehouseLocationId,
        delta,
      });
      setSuccess(tUi('stockSaved', locale));
      if (result?.label) {
        const copies = Number(result?.label_copies);
        setLabelPreview(result.label);
        setLabelPng(result.label_preview_png_base64 || '');
        setLabelCopies(Number.isFinite(copies) && copies > 0 ? copies : delta);
      }
      await load();
      setModalPacket(null);
      setSearch('');
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const hasQuery = Boolean(String(search || '').trim());

  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[kiosk.screen, kioskScreenEdges(insets, 32)]}
      >
        <ProductionKioskTopBar
          title={tUi('stockTitle', locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
        <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
          <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
        </Pressable>

        {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
        {success ? <Text style={kiosk.noticeOk}>{success}</Text> : null}

        <View style={kiosk.card}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('stockSearch', locale)}</Text>
          <View style={kiosk.row}>
            <TextInput
              style={[kiosk.input, { flex: 1, minWidth: 200, textAlign: 'left' }]}
              placeholderTextColor="#94a3b8"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={runSearch}
              autoCorrect={false}
            />
            <Pressable style={kiosk.btn} onPress={() => setKeyboardOpen(true)}>
              <Text style={kiosk.btnText}>{tUi('keyboardBtn', locale)}</Text>
            </Pressable>
          </View>

          {loading ? <Text style={{ marginTop: 12 }}>{tUi('loading', locale)}</Text> : null}

          {!loading && !hasQuery ? (
            <Text style={kiosk.searchHint}>{tUi('stockSearchHint', locale)}</Text>
          ) : null}

          {!loading && hasQuery && filtered.length === 0 ? (
            <Text style={kiosk.searchHint}>{tUi('stockNoMatch', locale)}</Text>
          ) : null}

          {!loading && filtered.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              {filtered.map((p) => (
                <Pressable key={p.id} style={kiosk.resultBtn} onPress={() => openPacketModal(p)}>
                  <Text style={kiosk.resultTitle}>{p.name}</Text>
                  <Text style={kiosk.resultSku}>{p.sku}</Text>
                  <Text style={kiosk.resultQty}>
                    {tUi('stockCurrent', locale)}: {packetWarehouseQty(p.id, inventory, warehouseLocationId)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ProductionVirtualKeyboard
        visible={keyboardOpen}
        onClose={() => setKeyboardOpen(false)}
        initialLayout={isArabic ? 'ar' : 'en'}
        onKey={(ch) => setSearch((s) => s + ch)}
        onBackspace={() => setSearch((s) => s.slice(0, -1))}
        onSpace={() => setSearch((s) => `${s} `)}
        onEnter={() => {
          setKeyboardOpen(false);
          runSearch();
        }}
      />

      <Modal visible={Boolean(modalPacket)} transparent animationType="fade">
        <Pressable style={modalStyles.backdrop} onPress={() => setModalPacket(null)}>
          <Pressable style={modalStyles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={modalStyles.title}>{modalPacket?.name}</Text>
            <Text style={kiosk.resultSku}>{modalPacket?.sku}</Text>
            <Text style={modalStyles.line}>
              {tUi('stockCurrent', locale)}: <Text style={modalStyles.bold}>{currentQty}</Text>
            </Text>
            <Text style={modalStyles.line}>
              {tUi('stockAfter', locale)}:{' '}
              <Text style={modalStyles.bold}>{currentQty + Math.max(1, addQty)}</Text>
            </Text>
            <View style={modalStyles.qtyRow}>
              <Text style={kiosk.label}>{tUi('stockIncreaseLabel', locale)}</Text>
              <Text style={modalStyles.qtyVal}>{addQty}</Text>
              <Pressable
                style={kiosk.btn}
                onPress={() => setAddQty((n) => n + 1)}
                accessibilityLabel="Increase quantity"
              >
                <Text style={kiosk.btnText}>+</Text>
              </Pressable>
            </View>
            <Pressable
              style={[kiosk.btn, kiosk.btnPrimary, saving && { opacity: 0.6 }]}
              disabled={saving}
              onPress={onSaveIncrease}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[kiosk.btnText, kiosk.btnPrimaryText]}>{tUi('stockSave', locale)}</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ProductionLabelPreviewModal
        visible={Boolean(labelPreview)}
        label={labelPreview}
        pngBase64={labelPng}
        copies={labelCopies}
        locale={locale}
        onClose={() => {
          setLabelPreview(null);
          setLabelPng('');
        }}
      />
    </>
  );
}

const modalStyles = {
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  line: { fontSize: 16, marginTop: 8 },
  bold: { fontWeight: '700' },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 16,
  },
  qtyVal: { fontSize: 22, fontWeight: '700', minWidth: 32, textAlign: 'center' },
};
