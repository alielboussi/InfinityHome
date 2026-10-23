import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchProductionCatalog,
  increaseProductionPacketStock,
  resolveProductionScan,
} from '../services/warehouseProductionApi';
import { normalizeWarehouseCatalogSearchQuery } from '../utils/warehouseScanResolver';
import { tUi } from '../utils/productionKioskI18n';
import { ProductionKioskTopBar, useProductionKioskLocale } from './WarehouseProductionShell';
import ProductionVirtualKeyboard from './ProductionVirtualKeyboard';

function packetWarehouseQty(packetId, inventory, locationId) {
  const row = (inventory || []).find(
    (r) => String(r.packet_id) === String(packetId) && String(r.location_id) === String(locationId),
  );
  return Math.max(0, Number(row?.quantity) || 0);
}

export default function WarehouseProductionStockPage() {
  const navigate = useNavigate();
  const { locale, toggleLocale, dir, isArabic } = useProductionKioskLocale();
  const searchRef = useRef(null);

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

  const filtered = useMemo(() => {
    const q = normalizeWarehouseCatalogSearchQuery(search).toLowerCase();
    if (!q) return (packets || []).slice(0, 40);
    return (packets || []).filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const sku = String(p.sku || '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    }).slice(0, 40);
  }, [packets, search]);

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
      const q = normalizeWarehouseCatalogSearchQuery(scan);
      const local = (packets || []).find((p) => String(p.sku).toUpperCase() === q.toUpperCase());
      if (local) {
        openPacketModal(local);
        return;
      }
      setError(tUi('stockNoMatch', locale));
    } catch (err) {
      setError(err?.message || tUi('stockNoMatch', locale));
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length === 1) {
        openPacketModal(filtered[0]);
      } else {
        tryResolveScan(search);
      }
    }
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
      await increaseProductionPacketStock({
        packetId: modalPacket.id,
        warehouseLocationId,
        delta,
      });
      setSuccess(tUi('stockSaved', locale));
      await load();
      setModalPacket(null);
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const appendSearch = (ch) => setSearch((s) => s + ch);
  const backspaceSearch = () => setSearch((s) => s.slice(0, -1));

  return (
    <div className="warehouse-production-kiosk" dir={dir}>
      <ProductionKioskTopBar title={tUi('stockTitle', locale)} locale={locale} onToggleLocale={toggleLocale} />
      <button type="button" className="warehouse-production-kiosk__back" onClick={() => navigate('/warehouse-production')}>
        {tUi('back', locale)}
      </button>

      {error ? <div className="warehouse-production-kiosk__notice warehouse-production-kiosk__notice--err">{error}</div> : null}
      {success ? <div className="warehouse-production-kiosk__notice warehouse-production-kiosk__notice--ok">{success}</div> : null}

      <div className="warehouse-production-kiosk__card">
        <label className="warehouse-production-kiosk__label" htmlFor="prod-stock-search">
          {tUi('stockSearch', locale)}
        </label>
        <div className="warehouse-production-kiosk__row">
          <input
            id="prod-stock-search"
            ref={searchRef}
            className="warehouse-production-kiosk__input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
            autoComplete="off"
          />
          <button
            type="button"
            className="warehouse-production-kiosk__btn"
            onClick={() => setKeyboardOpen(true)}
          >
            {tUi('keyboardBtn', locale)}
          </button>
        </div>

        {loading ? <p>{tUi('loading', locale)}</p> : (
          <ul className="warehouse-production-kiosk__results">
            {filtered.map((p) => (
              <li key={p.id}>
                <button type="button" className="warehouse-production-kiosk__result-btn" onClick={() => openPacketModal(p)}>
                  <strong>{p.name}</strong>
                  <span className="warehouse-production-kiosk__sku">{p.sku}</span>
                  <span>
                    {tUi('stockCurrent', locale)}: {packetWarehouseQty(p.id, inventory, warehouseLocationId)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProductionVirtualKeyboard
        open={keyboardOpen}
        onClose={() => setKeyboardOpen(false)}
        initialLayout={isArabic ? 'ar' : 'en'}
        onKey={appendSearch}
        onBackspace={backspaceSearch}
        onSpace={() => appendSearch(' ')}
        onEnter={() => {
          setKeyboardOpen(false);
          tryResolveScan(search);
        }}
      />

      {modalPacket ? (
        <div className="production-modal-backdrop" role="presentation" onClick={() => setModalPacket(null)}>
          <div className="production-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="production-modal__title">{modalPacket.name}</h2>
            <p className="production-modal__sku">{modalPacket.sku}</p>
            <p>{tUi('stockCurrent', locale)}: <strong>{currentQty}</strong></p>
            <p>{tUi('stockAfter', locale)}: <strong>{currentQty + Math.max(1, addQty)}</strong></p>
            <div className="production-modal__qty">
              <span>{tUi('stockIncreaseLabel', locale)}</span>
              <button type="button" className="warehouse-production-kiosk__btn" onClick={() => setAddQty((n) => Math.max(1, n - 1))}>−</button>
              <span className="production-modal__qty-val">{addQty}</span>
              <button type="button" className="warehouse-production-kiosk__btn" onClick={() => setAddQty((n) => n + 1)}>+</button>
            </div>
            <button
              type="button"
              className="warehouse-production-kiosk__btn warehouse-production-kiosk__btn--primary"
              disabled={saving}
              onClick={onSaveIncrease}
            >
              {saving ? tUi('saving', locale) : tUi('stockSave', locale)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
