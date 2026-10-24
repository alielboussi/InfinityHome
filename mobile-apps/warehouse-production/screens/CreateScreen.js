import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductionKioskTopBar from '../components/ProductionKioskTopBar';
import { kiosk } from '../components/kioskStyles';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import {
  buildProductionItemName,
  normalizeProductionNameInput,
  PRODUCTION_SEAT_PRESETS,
} from '../lib/productionItemName';
import { tUi, translateEnToAr } from '../lib/productionKioskI18n';
import ProductionLabelPreviewModal from '../components/ProductionLabelPreviewModal';
import {
  createProductionPacket,
  fetchProductionCatalog,
  fetchProductionSuggestedBaseName,
  isProductionPacketNameTaken,
} from '../services/productionApi';
export default function CreateScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, dir, isArabic } = useProductionKioskLocale();

  const [loading, setLoading] = useState(true);
  const [warehouseLocationId, setWarehouseLocationId] = useState(null);
  const [warehouseLocationName, setWarehouseLocationName] = useState('Warehouse');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [baseNameEn, setBaseNameEn] = useState('');
  const [preset, setPreset] = useState('');
  const [productNameEn, setProductNameEn] = useState('');
  const [qty, setQty] = useState('0');

  const [nameGenBusy, setNameGenBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayOverrides, setDisplayOverrides] = useState({});
  const [labelPreview, setLabelPreview] = useState(null);
  const [labelPng, setLabelPng] = useState('');
  const [labelCopies, setLabelCopies] = useState(1);

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

  const refreshArabicDisplay = useCallback(async () => {
    if (!isArabic) {
      setDisplayOverrides({});
      return;
    }
    const next = {};
    const tasks = [];
    if (baseNameEn.trim()) {
      tasks.push(translateEnToAr(baseNameEn).then((v) => { next.baseName = v; }));
    }
    if (englishProductName.trim()) {
      tasks.push(translateEnToAr(englishProductName).then((v) => { next.productName = v; }));
    }
    if (qty.trim()) {
      tasks.push(translateEnToAr(qty).then((v) => { next.qty = v; }));
    }
    for (const p of PRODUCTION_SEAT_PRESETS) {
      tasks.push(translateEnToAr(p).then((v) => { next[`preset:${p}`] = v; }));
    }
    await Promise.all(tasks);
    setDisplayOverrides(next);
  }, [baseNameEn, englishProductName, isArabic, qty]);

  useEffect(() => {
    refreshArabicDisplay();
  }, [refreshArabicDisplay]);

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

  const onSelectPreset = async (value) => {
    if (!baseNameEn.trim()) {
      setError(tUi('needBaseName', locale));
      return;
    }
    setError('');
    const built = buildProductionItemName(baseNameEn, value);
    const ok = await ensureProductNameAvailable(built);
    if (!ok) return;
    setPreset(value);
    setProductNameEn(built);
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
    setQty('0');
    setDisplayOverrides({});
  };

  const onSave = async () => {
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
    if (!Number.isFinite(qtyNum) || qtyNum < 0 || !/^\d+$/.test(String(qty).trim())) {
      setError(tUi('needQty', locale));
      return;
    }

    setSaving(true);
    try {
      const available = await ensureProductNameAvailable(name);
      if (!available) return;

      const result = await createProductionPacket({
        name,
        warehouseLocationId,
        initialQuantity: qtyNum,
      });
      setSuccess(tUi('saved', locale));
      if (result?.label) {
        setLabelPreview(result.label);
        setLabelPng(result.label_preview_png_base64 || '');
        setLabelCopies(Math.max(1, qtyNum));
      }
      resetForm();
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('already exists')) {
        setError(tUi('duplicateName', locale));
      } else {
        setError(msg || 'Save failed.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        kiosk.screen,
        dir === 'rtl' && kiosk.screenRtl,
        { paddingTop: insets.top + 8, paddingBottom: 40 },
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
      <Text style={kiosk.subtitle}>{tUi('subtitle', locale)}</Text>

      {loading ? <Text>{tUi('loading', locale)}</Text> : null}
      {error ? <Text style={kiosk.noticeErr}>{error}</Text> : null}
      {success ? <Text style={kiosk.noticeOk}>{success}</Text> : null}

      <View style={kiosk.card}>
        <View style={kiosk.field}>
          <Text style={kiosk.label}>{tUi('locationLabel', locale)}</Text>
          <Text style={kiosk.locationPill}>
            {warehouseLocationName} — {tUi('warehouseOnly', locale)}
          </Text>
        </View>

        <View style={kiosk.field}>
          <Text style={kiosk.label}>{tUi('baseNameLabel', locale)}</Text>
          <Text style={kiosk.hint}>{tUi('baseNameHint', locale)}</Text>
          <TextInput
            style={[kiosk.input, isArabic && kiosk.inputDisabled]}
            value={isArabic ? (displayOverrides.baseName ?? baseNameEn) : baseNameEn}
            onChangeText={(v) => {
              if (isArabic) return;
              applyBaseName(v);
            }}
            onBlur={() => {
              if (isArabic) return;
              applyBaseName(baseNameEn, { normalize: true });
            }}
            editable={!isArabic && !saving}
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
          <Text style={kiosk.label}>{tUi('presetLabel', locale)}</Text>
          <View style={kiosk.row}>
            {PRODUCTION_SEAT_PRESETS.map((p) => (
              <Pressable
                key={p}
                style={[kiosk.btn, preset === p && kiosk.btnActive]}
                onPress={() => onSelectPreset(p)}
                disabled={!baseNameEn.trim() || saving}
              >
                <Text style={kiosk.btnText}>
                  {isArabic ? (displayOverrides[`preset:${p}`] ?? p) : p}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={kiosk.field}>
          <Text style={kiosk.label}>{tUi('productNameLabel', locale)}</Text>
          <TextInput
            style={[kiosk.input, kiosk.inputDisabled]}
            value={isArabic ? (displayOverrides.productName ?? englishProductName) : englishProductName}
            editable={false}
          />
        </View>

        <View style={kiosk.field}>
          <Text style={kiosk.label}>{tUi('qtyLabel', locale)}</Text>
          <TextInput
            style={kiosk.input}
            keyboardType="number-pad"
            value={isArabic ? (displayOverrides.qty ?? qty) : qty}
            onChangeText={(v) => {
              if (isArabic) return;
              setQty(v);
            }}
            editable={!saving}
          />
        </View>

        <Pressable
          style={[kiosk.btn, kiosk.btnPrimary, (saving || loading || !warehouseLocationId) && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={saving || loading || !warehouseLocationId}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[kiosk.btnText, kiosk.btnPrimaryText]}>{tUi('save', locale)}</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
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
