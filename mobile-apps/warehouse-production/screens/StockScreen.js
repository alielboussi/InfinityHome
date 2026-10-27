import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../shared/theme';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import ProductionQrScanModal from '../components/ProductionQrScanModal';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { filterPacketsForProductionSearch } from '../lib/productionPacketSearch';
import {
  assemblyWarehouseQty,
  isProductionStockProductId,
  listProductionFinishedStockProducts,
} from '../lib/productionStockCatalog';
import { kioskScreenEdgesSafe } from '../lib/kioskLayout';
import { tUi } from '../lib/productionKioskI18n';
import ProductionLabelPreviewModal from '../components/ProductionLabelPreviewModal';
import {
  fetchProductionCatalog,
  increaseProductionStock,
  resolveProductionScan,
} from '../services/productionApi';

export default function StockScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [assemblyInventory, setAssemblyInventory] = useState([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [qrScanOpen, setQrScanOpen] = useState(false);

  const [modalPacket, setModalPacket] = useState(null);
  const [addQty, setAddQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [labelPreview, setLabelPreview] = useState(null);
  const [labelPng, setLabelPng] = useState('');
  const [labelCopies, setLabelCopies] = useState(1);
  const [labelPrintNote, setLabelPrintNote] = useState('');
  const catalogRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchProductionCatalog();
      catalogRef.current = data;
      setProducts(listProductionFinishedStockProducts(data));
      setAssemblyInventory(data.assemblyInventory || []);
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
    () => filterPacketsForProductionSearch(products, search, { limit: 25 }),
    [products, search],
  );

  const openPacketModal = (packet) => {
    setModalPacket(packet);
    setAddQty(1);
    setError('');
    setSuccess('');
  };

  const rejectIneligibleAssembly = (assemblyId) => {
    const catalog = catalogRef.current;
    if (!catalog || !isProductionStockProductId(catalog, assemblyId)) {
      setError(tUi('stockNotEligible', locale));
      return true;
    }
    return false;
  };

  const tryResolveScan = async (raw) => {
    const scan = String(raw || '').trim();
    if (!scan) return;
    try {
      const result = await resolveProductionScan(scan);
      if (result?.kind === 'assembly' && result.assembly) {
        const asm = result.assembly;
        if (rejectIneligibleAssembly(asm.id)) return;
        openPacketModal({
          id: asm.id,
          assembly_id: asm.id,
          sku: asm.family_sku,
          name: asm.name,
        });
        setSearch(asm.name || scan);
        return;
      }
      if (result?.kind === 'packet' && result.packet) {
        const parentId = result.packet.assembly_id || result.assembly?.id;
        if (parentId && rejectIneligibleAssembly(parentId)) return;
        if (!parentId) {
          setError(tUi('stockNotEligible', locale));
          return;
        }
        openPacketModal({
          ...result.packet,
          assembly_id: parentId,
        });
        setSearch(result.packet.name || scan);
        return;
      }
      const q = scan.replace(/\s+/g, '');
      const local = (products || []).find((p) => String(p.sku).toUpperCase() === q.toUpperCase());
      if (local) {
        openPacketModal(local);
        return;
      }
      const fromSearch = filterPacketsForProductionSearch(products, scan, { limit: 1 });
      if (fromSearch.length === 1) {
        openPacketModal(fromSearch[0]);
        return;
      }
      setError(tUi('stockNoMatch', locale));
    } catch (err) {
      setError(err?.message || tUi('stockNoMatch', locale));
    }
  };

  const runSearch = (queryOverride) => {
    const q = String(queryOverride ?? search ?? '').trim();
    setError('');
    const hits = filterPacketsForProductionSearch(products, q, { limit: 25 });
    if (hits.length === 1) {
      openPacketModal(hits[0]);
      return;
    }
    if (hits.length > 1) {
      if (queryOverride !== undefined) setSearch(q);
      return;
    }
    tryResolveScan(q);
  };

  const onQrScan = (data) => {
    const value = String(data || '').trim();
    if (!value) return;
    setQrScanOpen(false);
    Keyboard.dismiss();
    setSearch(value);
    runSearch(value);
  };

  const currentQty = modalPacket
    ? assemblyWarehouseQty(
      modalPacket.assembly_id || modalPacket.id,
      assemblyInventory,
      warehouseLocationId,
    )
    : 0;

  const onSaveIncrease = async () => {
    if (!modalPacket || !warehouseLocationId) return;
    const delta = Math.max(1, Math.floor(Number(addQty) || 0));
    setSaving(true);
    setError('');
    try {
      const result = await increaseProductionStock({
        assemblyId: modalPacket.assembly_id || modalPacket.id,
        warehouseLocationId,
        delta,
      });
      const printWarning = String(result?.labelPrintWarning || result?.label_print_warning || '').trim();
      setLabelPrintNote(printWarning);
      setSuccess(tUi('stockSaved', locale));
      if (result?.label) {
        const copies = Number(result?.labelCopies ?? result?.label_copies);
        setLabelPreview(result.label);
        let png = result.labelPreviewPngBase64 || result.label_preview_png_base64 || '';
        if (!png && result.label.sku && result.label.name) {
          try {
            const prev = await fetchProductionLabelPreview({
              name: result.label.name,
              sku: result.label.sku,
              printedAt: result.label.printed_at,
            });
            png = prev?.label_preview_png_base64 || '';
          } catch {
            // preview is optional
          }
        }
        setLabelPng(png);
        setLabelCopies(Number.isFinite(copies) && copies > 0 ? copies : delta);
      } else if (delta > 0) {
        setLabelCopies(delta);
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
        contentContainerStyle={[kiosk.screen, kioskScreenEdgesSafe(insets, 32)]}
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
              onSubmitEditing={() => runSearch()}
              autoCorrect={false}
            />
            <Pressable
              style={[kiosk.btn, styles.toolBtn, styles.qrBtn]}
              onPress={() => {
                Keyboard.dismiss();
                setQrScanOpen(true);
              }}
            >
              <Text style={[kiosk.btnText, styles.qrBtnText]}>{tUi('stockQrBtn', locale)}</Text>
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
                    {tUi('stockCurrent', locale)}: {assemblyWarehouseQty(
                      p.assembly_id || p.id,
                      assemblyInventory,
                      warehouseLocationId,
                    )}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ProductionQrScanModal
        visible={qrScanOpen}
        locale={locale}
        onClose={() => setQrScanOpen(false)}
        onScan={onQrScan}
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
        labelsPrinted={!labelPrintNote}
        printWarning={labelPrintNote}
        onClose={() => {
          setLabelPreview(null);
          setLabelPng('');
          setLabelPrintNote('');
        }}
      />
    </>
  );
}

const styles = {
  toolBtn: {
    flexShrink: 0,
    minWidth: 72,
    paddingHorizontal: 10,
  },
  qrBtn: {
    borderColor: theme.primary,
    backgroundColor: theme.primaryBg,
  },
  qrBtnText: {
    color: theme.primary,
  },
};

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
