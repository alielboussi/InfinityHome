import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme } from '../shared/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import KioskStickyFooter from '../components/KioskStickyFooter';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import {
  buildProductionItemName,
  normalizeProductionNameInput,
  PRODUCTION_SEAT_PRESETS,
} from '../lib/productionItemName';
import { kioskFooterBottomPad, kioskScreenEdges } from '../lib/kioskLayout';
import { presetLabel, tUi } from '../lib/productionKioskI18n';
import ProductionLabelPreviewModal from '../components/ProductionLabelPreviewModal';
import ProductionPhotoCaptureModal from '../components/ProductionPhotoCaptureModal';
import { prepareProductionPhotoForUpload } from '../lib/prepareProductionPhotoUpload';
import {
  createProductionPacket,
  fetchProductionCatalog,
  fetchProductionSuggestedBaseName,
  isProductionPacketNameTaken,
} from '../services/productionApi';
export default function CreateScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, textAlign } = useProductionKioskLocale();

  const [loading, setLoading] = useState(true);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [baseNameEn, setBaseNameEn] = useState('');
  const [preset, setPreset] = useState('');
  const [productNameEn, setProductNameEn] = useState('');
  const [qty, setQty] = useState('1');

  const [nameGenBusy, setNameGenBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState('');
  const [labelPreview, setLabelPreview] = useState(null);
  const [labelPng, setLabelPng] = useState('');
  const [labelCopies, setLabelCopies] = useState(1);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [photoCaptureOpen, setPhotoCaptureOpen] = useState(false);
  const scrollRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const deferFormResetRef = useRef(false);

  const englishProductName = useMemo(() => {
    if (productNameEn.trim()) return normalizeProductionNameInput(productNameEn);
    return buildProductionItemName(baseNameEn, preset);
  }, [baseNameEn, preset, productNameEn]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchProductionCatalog();
      setWarehouseLocationId(data.warehouseLocationId);
      setWarehouseLocationName(data.warehouseLocationName || 'Warehouse');
      if (!data.warehouseLocationId) {
        setError(tUi('noWarehouse', locale));
      }
    } catch (err) {
      setError(err?.message || 'Failed to load warehouse');
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const scrollQtyIntoView = () => {
    const scroll = () => scrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(scroll);
    setTimeout(scroll, 120);
  };

  useEffect(() => {
    if (keyboardHeight > 0) scrollQtyIntoView();
  }, [keyboardHeight]);

  const applyBaseName = (value, { normalize = false } = {}) => {
    setSuccess('');
    setError('');
    const next = normalize ? normalizeProductionNameInput(value) : String(value || '');
    setBaseNameEn(next);
    setProductNameEn('');
    if (preset) {
      setProductNameEn(buildProductionItemName(next, preset));
    }
  };

  const ensureProductNameAvailable = async (fullName) => {
    const taken = await isProductionPacketNameTaken(fullName);
    if (taken) {
      setError(tUi('duplicateName', locale));
      return false;
    }
    return true;
  };

  const onSelectPreset = (value) => {
    if (!baseNameEn.trim()) {
      setError(tUi('needBaseName', locale));
      return;
    }
    setError('');
    setPreset(value);
    setProductNameEn(buildProductionItemName(baseNameEn, value));
  };

  const onGenerateName = async () => {
    setNameGenBusy(true);
    setError('');
    setSuccess('');
    try {
      const { baseName, productName } = await fetchProductionSuggestedBaseName({ preset });
      if (!baseName) {
        setError('Could not generate a name.');
        return;
      }
      setBaseNameEn(baseName);
      if (preset && productName) {
        const ok = await ensureProductNameAvailable(productName);
        if (!ok) {
          setPreset('');
          setProductNameEn('');
          return;
        }
        setProductNameEn(productName);
      } else {
        setProductNameEn('');
      }
    } catch (err) {
      setError(err?.message || 'Could not generate a name.');
    } finally {
      setNameGenBusy(false);
    }
  };

  const resetForm = () => {
    setBaseNameEn('');
    setPreset('');
    setProductNameEn('');
    setQty('1');
  };

  const showSaveFailure = (message) => {
    const msg = String(message || '').trim() || 'Save failed.';
    setError(msg);
    Alert.alert(tUi('saveFailedTitle', locale), msg);
  };

  const finishSaveWithPhoto = async (imageBase64) => {
    const pending = pendingSaveRef.current;
    if (!pending?.name || !pending.warehouseLocationId) {
      showSaveFailure('Save data was lost. Tap Save production item again.');
      return;
    }

    setPhotoCaptureOpen(false);
    setSavePhase('processing');
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const available = await ensureProductNameAvailable(pending.name);
      if (!available) return;

      const uploadPhoto = await prepareProductionPhotoForUpload(imageBase64);
      const result = await createProductionPacket({
        name: pending.name,
        warehouseLocationId: pending.warehouseLocationId,
        initialQuantity: pending.qtyNum,
        imageBase64: uploadPhoto,
      });

      pendingSaveRef.current = null;
      const labelCount = result.labelCopies > 0 ? result.labelCopies : pending.qtyNum;
      let successMsg = tUi('saved', locale);
      if (result.labelPrintWarning) {
        successMsg = `${successMsg} ${result.labelPrintWarning}`;
      } else if (labelCount < 1) {
        successMsg = tUi('savedNoLabelsQty', locale);
      }
      setSuccess(successMsg);

      if (labelCount > 0) {
        const labelMeta = result.label || {
          sku: result.packet?.sku || '',
          name: result.packet?.name || pending.name,
          print_date: new Date().toLocaleDateString('en-GB'),
          print_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        };
        deferFormResetRef.current = true;
        setLabelPreview(labelMeta);
        setLabelPng(result.labelPreviewPngBase64 || '');
        setLabelCopies(labelCount);
      } else {
        resetForm();
      }
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('already exists')) {
        showSaveFailure(tUi('duplicateName', locale));
      } else {
        showSaveFailure(msg);
      }
    } finally {
      setSaving(false);
      setSavePhase('');
    }
  };

  const onSave = () => {
    setError('');
    setSuccess('');
    if (!warehouseLocationId) {
      setError(tUi('noWarehouse', locale));
      return;
    }
    if (!baseNameEn.trim()) {
      setError(tUi('needBaseName', locale));
      return;
    }
    if (!preset) {
      setError(tUi('needPreset', locale));
      return;
    }
    const name = englishProductName;
    const qtyNum = Number(String(qty).trim());
    if (!Number.isFinite(qtyNum) || qtyNum < 1 || !/^\d+$/.test(String(qty).trim())) {
      setError(tUi('needQty', locale));
      return;
    }

    Keyboard.dismiss();
    pendingSaveRef.current = {
      name,
      qtyNum,
      warehouseLocationId,
    };
    setPhotoCaptureOpen(true);
  };

  const saveDisabled = saving || loading || !warehouseLocationId || photoCaptureOpen;
  const footerPad = kioskFooterBottomPad(insets) + 72;
  const keyboardOpen = keyboardHeight > 0;
  const scrollBottomPad = keyboardOpen
    ? keyboardHeight + 24
    : footerPad;

  return (
    <>
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        kiosk.screen,
        kioskScreenEdges(insets, scrollBottomPad),
        styles.scrollContent,
      ]}
    >
      <ProductionKioskTopBar
        title={tUi('pageTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Text style={[kiosk.subtitle, { textAlign }]}>{tUi('subtitle', locale)}</Text>

      {loading ? <Text>{tUi('loading', locale)}</Text> : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {success ? <Text style={kiosk.noticeOk}>{success}</Text> : null}

      <View style={kiosk.card}>
        <View style={kiosk.field}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('locationLabel', locale)}</Text>
          <Text style={kiosk.locationPill}>
            {warehouseLocationName} — {tUi('warehouseOnly', locale)}
          </Text>
        </View>

        <View style={kiosk.field}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('baseNameLabel', locale)}</Text>
          <Text style={[kiosk.hint, { textAlign }]}>{tUi('baseNameHint', locale)}</Text>
          <TextInput
            style={[kiosk.input, { textAlign: 'left' }]}
            value={baseNameEn}
            onChangeText={(v) => applyBaseName(v)}
            onBlur={() => applyBaseName(baseNameEn, { normalize: true })}
            editable={!saving}
            placeholderTextColor="#94a3b8"
          />
          <View style={kiosk.row}>
            <Pressable
              style={kiosk.btn}
              onPress={onGenerateName}
              disabled={nameGenBusy || saving}
            >
              <Text style={kiosk.btnText}>
                {nameGenBusy ? '…' : tUi('generateName', locale)}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={kiosk.field}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('presetLabel', locale)}</Text>
          <View style={kiosk.row}>
            {PRODUCTION_SEAT_PRESETS.map((p) => (
              <Pressable
                key={p}
                style={[
                  kiosk.btn,
                  kiosk.presetChip,
                  preset === p && kiosk.btnActive,
                  (!baseNameEn.trim() || saving) && { opacity: 0.45 },
                ]}
                onPress={() => onSelectPreset(p)}
                disabled={!baseNameEn.trim() || saving}
              >
                <Text style={[kiosk.btnText, preset === p && kiosk.btnActiveText]}>
                  {presetLabel(p, locale)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={kiosk.field}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('productNameLabel', locale)}</Text>
          <TextInput
            style={[kiosk.input, kiosk.inputReadOnly, { textAlign: 'left' }]}
            value={englishProductName}
            editable={false}
          />
        </View>

        <View style={kiosk.field}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('qtyLabel', locale)}</Text>
          <TextInput
            style={[kiosk.input, { textAlign: 'left' }]}
            keyboardType="number-pad"
            value={qty}
            onChangeText={setQty}
            onFocus={scrollQtyIntoView}
            editable={!saving}
            placeholderTextColor="#94a3b8"
          />
        </View>
      </View>
    </ScrollView>
    {!keyboardOpen ? (
      <KioskStickyFooter>
        <Pressable
          style={[kiosk.btn, kiosk.btnPrimary, styles.saveBtn, saveDisabled && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={saveDisabled}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[kiosk.btnText, kiosk.btnPrimaryText]}>{tUi('save', locale)}</Text>
          )}
        </Pressable>
      </KioskStickyFooter>
    ) : null}
    </KeyboardAvoidingView>
    <Modal visible={savePhase === 'processing'} transparent animationType="fade">
      <View style={styles.busyBackdrop}>
        <View style={styles.busyCard}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.busyText}>{tUi('photoProcessing', locale)}</Text>
        </View>
      </View>
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
        if (deferFormResetRef.current) {
          deferFormResetRef.current = false;
          resetForm();
        }
      }}
    />
    <ProductionPhotoCaptureModal
      visible={photoCaptureOpen}
      locale={locale}
      onCancel={() => {
        if (saving || savePhase === 'processing') return;
        setPhotoCaptureOpen(false);
        pendingSaveRef.current = null;
        setError(tUi('photoCancelled', locale));
      }}
      onCaptured={(dataUri) => {
        finishSaveWithPhoto(dataUri);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  saveBtn: {
    marginTop: 0,
    marginBottom: 0,
    minHeight: 54,
    width: '100%',
  },
  busyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  busyCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  busyText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.text,
    textAlign: 'center',
    lineHeight: 22,
  },
});
