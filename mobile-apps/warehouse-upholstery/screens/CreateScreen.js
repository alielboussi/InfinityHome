import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  PRODUCTION_CARPENTRY_PRESETS,
  PRODUCTION_SEATER_PRESETS,
} from '../lib/productionItemName';
import ProductionDimensionsInput from '../components/ProductionDimensionsInput';
import ProductionPresetPicker from '../components/ProductionPresetPicker';
import { kioskFooterBottomPad, kioskScreenEdges } from '../lib/kioskLayout';
import { presetLabel, prefetchPresetArabicLabels, tUi, textForDisplay } from '../lib/productionKioskI18n';
import ProductionLabelPreviewModal from '../components/ProductionLabelPreviewModal';
import ProductionPhotoCaptureModal from '../components/ProductionPhotoCaptureModal';
import { prepareProductionPhotoForUpload } from '../lib/prepareProductionPhotoUpload';
import {
  attachProductionProductPhoto,
  cancelProductionPacketDraft,
  createProductionPacket,
  createProductionProductOnly,
  createCarpentryFloor2Product,
  uploadCarpentryFloor2ProductPhoto,
  fetchProductionCatalog,
  fetchProductionPresets,
  fetchProductionSuggestedBaseName,
} from '../services/productionApi';
import { isMattressCatalogProductName } from '../lib/isMattressCatalogProductName';
import { formatProductionNameClashMessage } from '../lib/productionNameClashUi';
/** @param {'upholstery'|'carpentry'} presetGroup — upholstery = seater presets only; carpentry = carpentry presets only */
export default function CreateScreen({ navigation, presetGroup = 'upholstery', inventoryTarget }) {
  const carpentryOnly = presetGroup === 'carpentry';
  const floor2Create = inventoryTarget === 'floor2' || carpentryOnly;
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
  const [aiPhotoStatus, setAiPhotoStatus] = useState('');
  const [labelPreview, setLabelPreview] = useState(null);
  const [labelPng, setLabelPng] = useState('');
  const [labelCopies, setLabelCopies] = useState(1);
  const [labelPrintNote, setLabelPrintNote] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [photoCaptureOpen, setPhotoCaptureOpen] = useState(false);
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const [activePresets, setActivePresets] = useState(
    carpentryOnly ? PRODUCTION_CARPENTRY_PRESETS : PRODUCTION_SEATER_PRESETS,
  );
  const [presetArLabels, setPresetArLabels] = useState({});
  const [dimL, setDimL] = useState('');
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const scrollRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const pendingPhotoRef = useRef(null);
  const deferFormResetRef = useRef(false);
  const [photoRetryOpen, setPhotoRetryOpen] = useState(false);
  const [photoRetryMessage, setPhotoRetryMessage] = useState('');

  const englishProductName = useMemo(() => {
    if (productNameEn.trim()) return normalizeProductionNameInput(productNameEn);
    return buildProductionItemName(baseNameEn, preset);
  }, [baseNameEn, preset, productNameEn]);

  const mattressProduct = useMemo(
    () => isMattressCatalogProductName(englishProductName),
    [englishProductName],
  );

  const selectedPresetValue = preset && activePresets.includes(preset) ? preset : '';

  const applyRemotePresets = useCallback((data) => {
    if (!data) return;
    if (carpentryOnly) {
      const remoteCarpentry = data.carpentry_presets || data.carpentry || data.production_presets?.carpentry;
      if (Array.isArray(remoteCarpentry) && remoteCarpentry.length) {
        setActivePresets(remoteCarpentry);
      }
      return;
    }
    const remoteSeater = data.seater_presets || data.seater || data.production_presets?.seater;
    if (Array.isArray(remoteSeater) && remoteSeater.length) {
      setActivePresets(remoteSeater.map((p) => String(p || '').trim()).filter(Boolean));
    }
  }, [carpentryOnly]);

  const reloadPresetsFromServer = useCallback(async () => {
    try {
      const grouped = await fetchProductionPresets();
      applyRemotePresets(grouped);
    } catch {
      /* keep last known list */
    }
  }, [applyRemotePresets]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (floor2Create) {
        setWarehouseLocationId('floor2');
        setWarehouseLocationName('Warehouse Floor 2');
        await reloadPresetsFromServer();
      } else {
        const [data] = await Promise.all([
          fetchProductionCatalog(),
          reloadPresetsFromServer(),
        ]);
        setWarehouseLocationId(data.warehouseLocationId);
        setWarehouseLocationName(data.warehouseLocationName || 'Warehouse');
        applyRemotePresets(data);
        if (!data.warehouseLocationId) {
          setError(tUi('noWarehouse', locale));
        }
      }
    } catch (err) {
      setError(err?.message || tUi('loadWarehouseFailed', locale));
      await reloadPresetsFromServer();
    } finally {
      setLoading(false);
    }
  }, [applyRemotePresets, floor2Create, locale, reloadPresetsFromServer]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (locale !== 'ar') {
        setPresetArLabels({});
        return;
      }
      const labels = await prefetchPresetArabicLabels([...activePresets]);
      if (!cancelled) setPresetArLabels(labels);
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, activePresets]);

  useFocusEffect(
    useCallback(() => {
      reloadPresetsFromServer();
    }, [reloadPresetsFromServer]),
  );

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
    const { checkProductionProductName } = await import('../services/productionApi');
    const check = await checkProductionProductName(fullName);
    if (!check?.taken) return true;
    const msg = formatProductionNameClashMessage(check, tUi('duplicateName', locale));
    setError(msg);
    showSaveFailure(msg);
    return false;
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
    setDimL('');
    setDimW('');
    setDimH('');
  };

  const showSaveFailure = (message) => {
    const msg = String(message || '').trim() || tUi('saveFailedGeneric', locale);
    setError(msg);
    Alert.alert(tUi('saveFailedTitle', locale), msg);
  };

  const applyCreateResult = async (pending, result) => {
    pendingSaveRef.current = null;
    await load();
    const labelCount = result.labelCopies > 0 ? result.labelCopies : pending.qtyNum;
    const printWarning = String(result.labelPrintWarning || '').trim();
    setLabelPrintNote(printWarning);
    if (printWarning) {
      setSuccess(tUi('savedItemOnly', locale));
      setError(printWarning);
    } else if (labelCount < 1) {
      setSuccess(tUi('savedNoLabelsQty', locale));
    } else if (isMattressCatalogProductName(pending.name)) {
      setSuccess(tUi('savedMattressNoPhoto', locale));
    } else {
      setSuccess(tUi('savedWithLabels', locale));
    }

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
  };

  const finishSaveWithoutPhoto = async () => {
    const pending = pendingSaveRef.current;
    if (!pending?.name || !pending.warehouseLocationId) {
      showSaveFailure(tUi('createSaveDataLost', locale));
      return;
    }
    setSavePhase('processing');
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const available = await ensureProductNameAvailable(pending.name);
      if (!available) return;
      if (floor2Create) {
        const result = await createCarpentryFloor2Product({
          name: pending.name,
          baseName: baseNameEn,
          preset: pending.preset,
          quantity: pending.qtyNum,
          dimLength: pending.dimLength,
          dimWidth: pending.dimWidth,
          dimHeight: pending.dimHeight,
        });
        await applyCreateResult(pending, result);
        return;
      }
      const result = await createProductionPacket({
        name: pending.name,
        warehouseLocationId: pending.warehouseLocationId,
        initialQuantity: pending.qtyNum,
        dimLength: pending.dimLength,
        dimWidth: pending.dimWidth,
        dimHeight: pending.dimHeight,
        preset: pending.preset,
      });
      await applyCreateResult(pending, result);
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

  const discardPendingDraft = async () => {
    const resumeId = String(pendingSaveRef.current?.resumeAssemblyId || '').trim();
    pendingSaveRef.current = null;
    pendingPhotoRef.current = null;
    setPhotoRetryOpen(false);
    setPhotoRetryMessage('');
    if (!resumeId) return;
    try {
      await cancelProductionPacketDraft(resumeId);
    } catch (e) {
      setError(e?.message || tUi('createDiscardDraftFailed', locale));
    }
  };

  const finishSaveWithPhoto = async (photoSource) => {
    const pending = pendingSaveRef.current;
    if (!pending?.name || !pending.warehouseLocationId) {
      showSaveFailure(tUi('createSaveDataLost', locale));
      return;
    }

    if (!photoSource) return;
    pendingPhotoRef.current = photoSource;

    setPhotoCaptureOpen(false);
    setPhotoRetryOpen(false);
    setPhotoRetryMessage('');
    setSavePhase('processing');
    setAiPhotoStatus('');
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      setAiPhotoStatus(tUi('savePhasePreparingPhoto', locale));
      const uploadPhoto = await prepareProductionPhotoForUpload(photoSource);

      if (floor2Create) {
        let parsed;
        if (pending.resumeAssemblyId) {
          parsed = {
            assemblyId: pending.resumeAssemblyId,
            pendingLabelPrint: pending.pendingLabelPrint || null,
            labelCopies: pending.qtyNum,
            packet: {
              id: pending.resumeAssemblyId,
              assembly_id: pending.resumeAssemblyId,
              sku: pending.pendingLabelPrint?.sku || '',
              name: pending.name,
            },
          };
        } else {
          const available = await ensureProductNameAvailable(pending.name);
          if (!available) return;
          setAiPhotoStatus(tUi('savePhaseCreatingProduct', locale));
          parsed = await createCarpentryFloor2Product({
            name: pending.name,
            baseName: baseNameEn,
            preset: pending.preset,
            quantity: pending.qtyNum,
            dimLength: pending.dimLength,
            dimWidth: pending.dimWidth,
            dimHeight: pending.dimHeight,
          });
          if (!parsed.assemblyId) throw new Error('Product save failed — server did not return a product id.');
          pendingSaveRef.current = {
            ...pending,
            resumeAssemblyId: parsed.assemblyId,
            pendingLabelPrint: parsed.pendingLabelPrint || null,
          };
        }
        setAiPhotoStatus(tUi('photoProcessing', locale));
        let photoPayload;
        try {
          photoPayload = await attachProductionProductPhoto({
            assemblyId: parsed.assemblyId,
            imageBase64: uploadPhoto,
            pendingLabelPrint: pendingSaveRef.current?.pendingLabelPrint || parsed.pendingLabelPrint,
            alsoFloor2Wip: true,
            pendingPortalSetup: {
              portal_catalog: 'carpentry',
              floor2_product_qty: pending.qtyNum,
            },
            preset: pending.preset,
            onAttempt: (attempt, max) => {
              setAiPhotoStatus(tUi('aiPhotoRetry', locale).replace('{n}', String(attempt)).replace('{max}', String(max)));
            },
          });
        } catch (photoErr) {
          await uploadCarpentryFloor2ProductPhoto({
            assemblyId: parsed.assemblyId,
            imageBase64: uploadPhoto,
          });
          throw photoErr;
        }
        const result = {
          ...parsed,
          labelJobId: photoPayload?.label_job_id || parsed.labelJobId || null,
          labelPrintWarning: photoPayload?.label_print_warning || parsed.labelPrintWarning || null,
          labelPreviewPngBase64: photoPayload?.label_preview_png_base64 || parsed.labelPreviewPngBase64 || '',
          photoSaved: true,
          catalogImageUrl: photoPayload?.catalog_image_url || null,
        };
        await applyCreateResult(pending, result);
        pendingSaveRef.current = null;
        pendingPhotoRef.current = null;
        return;
      }

      let parsed;
      if (pending.resumeAssemblyId) {
        parsed = {
          assemblyId: pending.resumeAssemblyId,
          pendingLabelPrint: pending.pendingLabelPrint || null,
          labelCopies: pending.qtyNum,
          packet: { id: pending.resumeAssemblyId, assembly_id: pending.resumeAssemblyId },
        };
      } else {
        const available = await ensureProductNameAvailable(pending.name);
        if (!available) return;
        setAiPhotoStatus(tUi('savePhaseCreatingProduct', locale));
        parsed = await createProductionProductOnly({
          name: pending.name,
          warehouseLocationId: pending.warehouseLocationId,
          initialQuantity: pending.qtyNum,
          dimLength: pending.dimLength,
          dimWidth: pending.dimWidth,
          dimHeight: pending.dimHeight,
          preset: pending.preset,
        });
        pendingSaveRef.current = {
          ...pending,
          resumeAssemblyId: parsed.assemblyId,
          pendingLabelPrint: parsed.pendingLabelPrint || null,
          pendingPortalSetup: parsed.pendingPortalSetup || null,
        };
      }

      setAiPhotoStatus(tUi('photoProcessing', locale));
      const photoPayload = await attachProductionProductPhoto({
        assemblyId: parsed.assemblyId,
        imageBase64: uploadPhoto,
        pendingLabelPrint: pendingSaveRef.current?.pendingLabelPrint || parsed.pendingLabelPrint,
        pendingPortalSetup: pendingSaveRef.current?.pendingPortalSetup || parsed.pendingPortalSetup,
        preset: pending.preset,
        alsoFloor2Wip: true,
        onAttempt: (attempt, max) => {
          setAiPhotoStatus(tUi('aiPhotoRetry', locale).replace('{n}', String(attempt)).replace('{max}', String(max)));
        },
      });

      const result = {
        ...parsed,
        labelJobId: photoPayload?.label_job_id || parsed.labelJobId || null,
        labelPrintWarning: photoPayload?.label_print_warning || parsed.labelPrintWarning || null,
        labelPreviewPngBase64: photoPayload?.label_preview_png_base64 || parsed.labelPreviewPngBase64 || '',
        photoSaved: true,
        catalogImageUrl: photoPayload?.catalog_image_url || null,
      };

      await applyCreateResult(pending, result);
      pendingSaveRef.current = null;
      pendingPhotoRef.current = null;
    } catch (err) {
      const msg = String(err?.message || '').trim()
        || tUi('createAiPhotoFailedHint', locale);
      const resumeId = String(pendingSaveRef.current?.resumeAssemblyId || '').trim();
      if (resumeId) {
        setPhotoRetryMessage(msg);
        setPhotoRetryOpen(true);
        setError('');
        setSuccess('');
        return;
      }
      if (msg.toLowerCase().includes('already exists')) {
        showSaveFailure(tUi('duplicateName', locale));
      } else {
        showSaveFailure(msg || tUi('saveFailedConnection', locale));
      }
    } finally {
      setSaving(false);
      setSavePhase('');
    }
  };

  const retryAiPhotoSave = () => {
    const photo = pendingPhotoRef.current;
    if (!photo || !pendingSaveRef.current?.resumeAssemblyId) {
      setPhotoRetryOpen(false);
      showSaveFailure(tUi('createAiPhotoRetryLost', locale));
      return;
    }
    finishSaveWithPhoto(photo);
  };

  const onSave = async () => {
    setError('');
    setSuccess('');
    setLabelPrintNote('');
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
    const pending = {
      name,
      qtyNum,
      warehouseLocationId,
      preset: String(preset || '').trim(),
      dimLength: dimL.trim() || undefined,
      dimWidth: dimW.trim() || undefined,
      dimHeight: dimH.trim() || undefined,
      resumeAssemblyId: pendingSaveRef.current?.resumeAssemblyId,
      pendingLabelPrint: pendingSaveRef.current?.pendingLabelPrint,
      pendingPortalSetup: pendingSaveRef.current?.pendingPortalSetup,
    };
    pendingSaveRef.current = pending;

    if (isMattressCatalogProductName(name)) {
      finishSaveWithoutPhoto();
      return;
    }

    if (!pending.resumeAssemblyId) {
      setSaving(true);
      try {
        const available = await ensureProductNameAvailable(name);
        if (!available) {
          pendingSaveRef.current = null;
          return;
        }
      } finally {
        setSaving(false);
      }
    }

    setPhotoCaptureOpen(true);
  };

  const saveDisabled = saving || loading || !warehouseLocationId || photoCaptureOpen || photoRetryOpen;
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
        title={tUi(carpentryOnly ? 'dashCarpentryTitle' : 'pageTitle', locale)}
        locale={locale}
        onToggleLocale={toggleLocale}
      />
      <Pressable style={kiosk.backBtn} onPress={() => navigation.goBack()}>
        <Text style={kiosk.backText}>{tUi('back', locale)}</Text>
      </Pressable>
      <Text style={[kiosk.subtitle, { textAlign }]}>{tUi('subtitle', locale)}</Text>

      {loading ? <Text>{tUi('loading', locale)}</Text> : null}
      {error ? <Text style={kiosk.noticeErr}>{textForDisplay(error, '')}</Text> : null}
      {success ? <Text style={kiosk.noticeOk}>{textForDisplay(success, '')}</Text> : null}

      <View style={kiosk.card}>
        <View style={kiosk.field}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('locationLabel', locale)}</Text>
          <Text style={kiosk.locationPill}>
            {warehouseLocationName === 'Warehouse Floor 2'
              ? tUi('locationWarehouseFloor2', locale)
              : warehouseLocationName === 'Warehouse'
                ? tUi('locationWarehouse', locale)
                : textForDisplay(warehouseLocationName, tUi('locationWarehouse', locale))}
            {' — '}
            {tUi('warehouseOnly', locale)}
          </Text>
        </View>

        <View style={kiosk.field}>
          <Text style={[kiosk.label, { textAlign }]}>{tUi('baseNameLabel', locale)}</Text>
          <Text style={[kiosk.hint, { textAlign }]}>{tUi('baseNameHint', locale)}</Text>
          <Pressable
            style={[kiosk.btn, styles.suggestFullWidth, nameGenBusy && { opacity: 0.6 }]}
            onPress={onGenerateName}
            disabled={nameGenBusy || saving}
          >
            <Text style={kiosk.btnText}>
              {nameGenBusy ? '…' : tUi('generateName', locale)}
            </Text>
          </Pressable>
          <TextInput
            style={[kiosk.input, styles.nameInput, { textAlign: 'left' }]}
            value={baseNameEn}
            onChangeText={(v) => applyBaseName(v)}
            onBlur={() => applyBaseName(baseNameEn, { normalize: true })}
            editable={!saving}
            placeholderTextColor="#94a3b8"
            autoCorrect={false}
            autoCapitalize="words"
          />
          <View style={styles.dropdownColumn}>
            <Text style={[kiosk.label, styles.groupLabel, { textAlign }]}>
              {tUi(carpentryOnly ? 'carpentryGroupLabel' : 'seaterGroupLabel', locale)}
            </Text>
            <Pressable
              style={[
                kiosk.btn,
                styles.presetDropdownBtn,
                selectedPresetValue && kiosk.btnActive,
                (!baseNameEn.trim() || saving) && { opacity: 0.45 },
              ]}
              onPress={() => {
                if (!baseNameEn.trim()) {
                  setError(tUi('needBaseName', locale));
                  return;
                }
                setPresetPickerOpen(true);
              }}
              disabled={!baseNameEn.trim() || saving}
            >
              <Text
                style={[kiosk.btnText, selectedPresetValue && kiosk.btnActiveText, styles.presetDropdownText]}
                numberOfLines={2}
              >
                {selectedPresetValue
                  ? presetLabel(selectedPresetValue, locale, presetArLabels)
                  : tUi(carpentryOnly ? 'carpentryPickerPlaceholder' : 'seaterPickerPlaceholder', locale)}
              </Text>
            </Pressable>
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

        <ProductionDimensionsInput
          locale={locale}
          textAlign={textAlign}
          dimL={dimL}
          dimW={dimW}
          dimH={dimH}
          onChangeL={setDimL}
          onChangeW={setDimW}
          onChangeH={setDimH}
          disabled={saving}
        />

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
          <Text style={styles.busyText}>
            {textForDisplay(aiPhotoStatus || tUi('photoProcessing', locale), tUi('photoProcessing', locale))}
          </Text>
        </View>
      </View>
    </Modal>
    <Modal visible={photoRetryOpen} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.busyBackdrop}>
        <View style={styles.busyCard}>
          <Text style={styles.busyTitle}>{tUi('saveFailedTitle', locale)}</Text>
          <Text style={styles.busyText}>
            {textForDisplay(photoRetryMessage || tUi('createAiPhotoFailedHint', locale), tUi('createAiPhotoFailedHint', locale))}
          </Text>
          <Pressable
            style={[kiosk.btn, kiosk.btnPrimary, styles.retryBtn]}
            onPress={retryAiPhotoSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[kiosk.btnText, kiosk.btnPrimaryText]}>{tUi('createAiPhotoRetry', locale)}</Text>
            )}
          </Pressable>
          <Pressable
            style={[kiosk.btn, styles.retryBtn]}
            onPress={async () => {
              await discardPendingDraft();
            }}
            disabled={saving}
          >
            <Text style={kiosk.btnText}>{tUi('createDiscardDraft', locale)}</Text>
          </Pressable>
        </View>
      </View>
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
        if (deferFormResetRef.current) {
          deferFormResetRef.current = false;
          resetForm();
        }
      }}
    />
    <ProductionPresetPicker
      visible={presetPickerOpen}
      title={tUi(carpentryOnly ? 'carpentryGroupLabel' : 'seaterGroupLabel', locale)}
      presets={activePresets}
      locale={locale}
      presetArLabels={presetArLabels}
      textAlign={textAlign}
      selectedPreset={selectedPresetValue}
      disabled={!baseNameEn.trim() || saving}
      onClose={() => setPresetPickerOpen(false)}
      onSelect={(value) => onSelectPreset(value)}
    />
    <ProductionPhotoCaptureModal
      visible={photoCaptureOpen}
      locale={locale}
      onCancel={() => {
        if (saving || savePhase === 'processing') return;
        setPhotoCaptureOpen(false);
        pendingSaveRef.current = null;
        pendingPhotoRef.current = null;
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
  busyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 14,
    width: '100%',
    minHeight: 48,
  },
  nameActionsHint: {
    marginTop: 10,
    marginBottom: 0,
  },
  suggestFullWidth: {
    width: '100%',
    marginBottom: 8,
  },
  nameInput: {
    marginTop: 0,
  },
  dropdownColumn: {
    marginTop: 12,
    gap: 6,
  },
  groupLabel: {
    marginBottom: 4,
    marginTop: 4,
  },
  presetDropdownBtn: {
    width: '100%',
    minHeight: 50,
    paddingHorizontal: 10,
  },
  presetDropdownText: {
    textAlign: 'center',
  },
  presetInlineChip: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
  },
});
