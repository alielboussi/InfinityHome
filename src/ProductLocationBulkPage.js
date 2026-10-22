import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { removeComboLocations, upsertComboLocations } from './services/comboLocations';
import { removeProductLocations, syncProductLocations } from './services/productLocations';

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function itemKey(kind, id) {
  return `${kind}:${id}`;
}

export default function ProductLocationBulkPage() {
  const canManage = canManageCatalog(getCurrentUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [locations, setLocations] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState(() => new Set());
  const [locationIds, setLocationIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [prodRes, comboRes, locRes] = await Promise.all([
        db.from('products').select('id, name, sku').order('name', { ascending: true }),
        db.from('combos').select('id, combo_name, sku').order('combo_name', { ascending: true }),
        db.from('locations').select('id, name').order('name', { ascending: true }),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (comboRes.error) throw comboRes.error;
      if (locRes.error) throw locRes.error;
      setProducts(prodRes.data || []);
      setCombos(comboRes.data || []);
      setLocations(locRes.data || []);
    } catch (err) {
      setError(err?.message || 'Failed to load catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const catalogRows = useMemo(() => {
    const rows = [
      ...(products || []).map((p) => ({
        key: itemKey('product', p.id),
        kind: 'product',
        id: p.id,
        name: p.name || '',
        sku: p.sku || '',
        typeLabel: 'Product',
      })),
      ...(combos || []).map((c) => ({
        key: itemKey('combo', c.id),
        kind: 'combo',
        id: c.id,
        name: c.combo_name || '',
        sku: c.sku || '',
        typeLabel: 'Set',
      })),
    ];
    rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return rows;
  }, [products, combos]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return catalogRows;
    return catalogRows.filter((row) =>
      row.name.toLowerCase().includes(term)
      || String(row.sku).toLowerCase().includes(term),
    );
  }, [catalogRows, search]);

  const filteredKeys = useMemo(() => filteredRows.map((r) => r.key), [filteredRows]);

  const allFilteredSelected = filteredKeys.length > 0
    && filteredKeys.every((key) => selectedItems.has(key));

  const someFilteredSelected = filteredKeys.some((key) => selectedItems.has(key));

  const toggleItem = (key) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredKeys.forEach((key) => next.delete(key));
      } else {
        filteredKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  };

  const toggleLocationId = (locId) => {
    const id = String(locId);
    setLocationIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const selectedProductIds = useMemo(() => (
    [...selectedItems]
      .filter((key) => key.startsWith('product:'))
      .map((key) => key.slice('product:'.length))
  ), [selectedItems]);

  const selectedComboIds = useMemo(() => (
    [...selectedItems]
      .filter((key) => key.startsWith('combo:'))
      .map((key) => key.slice('combo:'.length))
  ), [selectedItems]);

  const applyLocations = async (mode) => {
    if (!canManage) {
      alert('You do not have permission to change product locations.');
      return;
    }
    const productIds = selectedProductIds;
    const comboIds = selectedComboIds;
    if (!productIds.length && !comboIds.length) {
      alert('Select at least one product or set.');
      return;
    }
    if (!locationIds.length) {
      alert('Select at least one location.');
      return;
    }
    const verb = mode === 'assign' ? 'assign' : 'remove';
    const total = productIds.length + comboIds.length;
    if (!window.confirm(
      `${mode === 'assign' ? 'Assign' : 'Remove'} ${locationIds.length} location(s) `
      + `${mode === 'assign' ? 'to' : 'from'} ${total} selected item${total === 1 ? '' : 's'}?`,
    )) {
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    try {
      if (mode === 'assign') {
        const productRows = productIds.flatMap((productId) => (
          locationIds.map((locId) => ({ product_id: productId, location_id: locId }))
        ));
        for (const chunk of chunkArray(productRows, 500)) {
          await syncProductLocations({ rows: chunk }, db);
        }
        const comboRows = comboIds.flatMap((comboId) => (
          locationIds.map((locId) => ({ combo_id: comboId, location_id: locId }))
        ));
        for (const chunk of chunkArray(comboRows, 500)) {
          await upsertComboLocations(chunk);
        }
        setMessage(`Assigned locations to ${total} item${total === 1 ? '' : 's'}.`);
      } else {
        const productRows = productIds.flatMap((productId) => (
          locationIds.map((locId) => ({ product_id: productId, location_id: locId }))
        ));
        for (const chunk of chunkArray(productRows, 500)) {
          await removeProductLocations(chunk, db);
        }
        const comboRows = comboIds.flatMap((comboId) => (
          locationIds.map((locId) => ({ combo_id: comboId, location_id: locId }))
        ));
        for (const chunk of chunkArray(comboRows, 500)) {
          await removeComboLocations(chunk);
        }
        setMessage(`Removed locations from ${total} item${total === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      setError(err?.message || `Failed to ${verb} locations.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="products-list-page product-location-bulk-page">
      <div className="page-header-row">
        <BackToDashboard
          to="/products-list"
          title="Back to All Products"
          ariaLabel="Back to All Products"
        />
        <h1 className="products-title" style={{ margin: 0 }}>Product locations</h1>
      </div>
      <p className="stc-note" style={{ margin: '8px 0 16px', opacity: 0.85 }}>
        Select products and sets, then choose locations to assign or unassign.
        <Link to="/products-list" style={{ marginLeft: 8 }}>Back to All Products</Link>
      </p>

      {!canManage && (
        <div className="products-toolbar-message" role="alert">
          You can view this page but location changes require catalog management permission.
        </div>
      )}

      {error ? <div className="stock-periods-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      {message ? <div className="products-toolbar-message">{message}</div> : null}

      <div className="product-location-bulk-layout">
        <section className="product-location-bulk-panel">
          <div className="product-location-bulk-panel__head">
            <h2>Products &amp; sets</h2>
            <span className="product-location-bulk-meta">
              {selectedItems.size} selected
            </span>
          </div>
          <input
            type="text"
            className="products-toolbar-input pos-control product-location-bulk-search"
            placeholder="Search name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products and sets"
          />
          {loading ? (
            <p className="stc-note">Loading…</p>
          ) : (
            <div className="product-location-bulk-table-wrap">
              <table className="product-location-bulk-table">
                <thead>
                  <tr>
                    <th className="product-location-bulk-check-col">
                      <input
                        type="checkbox"
                        className="products-bulk-checkbox"
                        aria-label="Select all visible items"
                        checked={allFilteredSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                        }}
                        onChange={toggleSelectAllFiltered}
                        disabled={!filteredRows.length}
                      />
                    </th>
                    <th>Type</th>
                    <th>Name</th>
                    <th>SKU</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No matches.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.key}>
                        <td className="product-location-bulk-check-col">
                          <input
                            type="checkbox"
                            className="products-bulk-checkbox"
                            checked={selectedItems.has(row.key)}
                            onChange={() => toggleItem(row.key)}
                            aria-label={`Select ${row.name}`}
                          />
                        </td>
                        <td>{row.typeLabel}</td>
                        <td>{row.name}</td>
                        <td>{row.sku || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="product-location-bulk-panel product-location-bulk-panel--locations">
          <div className="product-location-bulk-panel__head">
            <h2>Locations</h2>
            <span className="product-location-bulk-meta">
              {locationIds.length} selected
            </span>
          </div>
          <div className="product-location-bulk-locations">
            {(locations || []).map((loc) => {
              const id = String(loc.id);
              const checked = locationIds.includes(id);
              return (
                <label key={id} className="products-toolbar-bulk-locations-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLocationId(id)}
                  />
                  <span>{loc.name}</span>
                </label>
              );
            })}
          </div>
          <div className="product-location-bulk-actions">
            <button
              type="button"
              className="products-toolbar-btn"
              disabled={busy || !canManage}
              onClick={() => applyLocations('assign')}
            >
              {busy ? 'Working…' : 'Assign to locations'}
            </button>
            <button
              type="button"
              className="products-toolbar-btn products-toolbar-btn--delete"
              disabled={busy || !canManage}
              onClick={() => applyLocations('remove')}
            >
              {busy ? 'Working…' : 'Remove from locations'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
