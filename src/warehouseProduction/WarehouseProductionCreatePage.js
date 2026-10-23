import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createProductionPacket,
  fetchProductionCatalog,
} from '../services/warehouseProductionApi';
import {
  buildProductionItemName,
  fetchRandomFemaleFirstName,
  normalizeProductionNameInput,
  PRODUCTION_SEAT_PRESETS,
} from '../utils/productionItemName';
import { tUi, translateEnToAr } from '../utils/productionKioskI18n';
import { ProductionKioskTopBar, useProductionKioskLocale } from './WarehouseProductionShell';

export default function WarehouseProductionCreatePage() {
  const navigate = useNavigate();
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
      const name = await fetchRandomFemaleFirstName();
      setBaseNameEn(name);
      setPreset('');
      setProductNameEn('');
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
      await createProductionPacket({
        name,
        warehouseLocationId,
        initialQuantity: qtyNum,
      });
      setSuccess(tUi('saved', locale));
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
    <div className="warehouse-production-kiosk" dir={dir}>
      <ProductionKioskTopBar title={tUi('pageTitle', locale)} locale={locale} onToggleLocale={toggleLocale} />
      <button type="button" className="warehouse-production-kiosk__back" onClick={() => navigate('/warehouse-production')}>
        {tUi('back', locale)}
      </button>
      <p className="warehouse-production-kiosk__subtitle">{tUi('subtitle', locale)}</p>

      {loading ? <p>{tUi('loading', locale)}</p> : null}
      {error ? <div className="warehouse-production-kiosk__notice warehouse-production-kiosk__notice--err">{error}</div> : null}
      {success ? <div className="warehouse-production-kiosk__notice warehouse-production-kiosk__notice--ok">{success}</div> : null}

      <div className="warehouse-production-kiosk__card">
        <div className="warehouse-production-kiosk__field">
          <span className="warehouse-production-kiosk__label">{tUi('locationLabel', locale)}</span>
          <span className="warehouse-production-kiosk__location-pill">
            {warehouseLocationName} — {tUi('warehouseOnly', locale)}
          </span>
        </div>

        <div className="warehouse-production-kiosk__field">
          <label className="warehouse-production-kiosk__label" htmlFor="prod-base-name">
            {tUi('baseNameLabel', locale)}
          </label>
          <p className="warehouse-production-kiosk__hint">{tUi('baseNameHint', locale)}</p>
          <input
            id="prod-base-name"
            className="warehouse-production-kiosk__input"
            value={isArabic ? (displayOverrides.baseName ?? baseNameEn) : baseNameEn}
            onChange={(e) => {
              if (isArabic) return;
              applyBaseName(e.target.value);
            }}
            onBlur={(e) => {
              if (isArabic) return;
              applyBaseName(e.target.value, { normalize: true });
            }}
            autoComplete="off"
            disabled={isArabic}
          />
          <div className="warehouse-production-kiosk__row">
            <button
              type="button"
              className="warehouse-production-kiosk__btn"
              onClick={onGenerateName}
              disabled={nameGenBusy || saving}
            >
              {nameGenBusy ? '…' : tUi('generateName', locale)}
            </button>
          </div>
        </div>

        <div className="warehouse-production-kiosk__field">
          <span className="warehouse-production-kiosk__label">{tUi('presetLabel', locale)}</span>
          <div className="warehouse-production-kiosk__row">
            {PRODUCTION_SEAT_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`warehouse-production-kiosk__btn warehouse-production-kiosk__preset${preset === p ? ' is-active' : ''}`}
                onClick={() => onSelectPreset(p)}
                disabled={!baseNameEn.trim() || saving}
              >
                {isArabic ? (displayOverrides[`preset:${p}`] ?? p) : p}
              </button>
            ))}
          </div>
        </div>

        <div className="warehouse-production-kiosk__field">
          <label className="warehouse-production-kiosk__label" htmlFor="prod-full-name">
            {tUi('productNameLabel', locale)}
          </label>
          <input
            id="prod-full-name"
            className="warehouse-production-kiosk__input"
            value={isArabic ? (displayOverrides.productName ?? englishProductName) : englishProductName}
            readOnly
            disabled
          />
        </div>

        <div className="warehouse-production-kiosk__field">
          <label className="warehouse-production-kiosk__label" htmlFor="prod-qty">
            {tUi('qtyLabel', locale)}
          </label>
          <input
            id="prod-qty"
            className="warehouse-production-kiosk__input"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={isArabic ? (displayOverrides.qty ?? qty) : qty}
            onChange={(e) => {
              if (isArabic) return;
              setQty(e.target.value);
            }}
            disabled={saving}
          />
        </div>

        <button
          type="button"
          className="warehouse-production-kiosk__btn warehouse-production-kiosk__btn--primary"
          onClick={onSave}
          disabled={saving || loading || !warehouseLocationId}
        >
          {saving ? tUi('saving', locale) : tUi('save', locale)}
        </button>
      </div>
    </div>
  );
}
