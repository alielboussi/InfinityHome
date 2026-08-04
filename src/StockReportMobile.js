/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import React, { useState, useEffect, useMemo } from 'react';
import { getMaxSetQty as calcMaxSetQty, selectPrice, formatAmount } from './utils/setInventoryUtils';
import db from './dataClient';
import { getCurrentUser, getLockedLocationIdForUser } from './accessControl';
import { fetchInventorySnapshot } from './services/inventorySnapshot';
import { resolveProductImageUrl } from './utils/productImageUrl';

const StockReportMobile = () => {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [units, setUnits] = useState([]);
  const [productImages, setProductImages] = useState([]);
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [comboLocations, setComboLocations] = useState([]);
  const [expandedImage, setExpandedImage] = useState(null);
  const [incompletePackages, setIncompletePackages] = useState([]);
  const [expandedCombos, setExpandedCombos] = useState(new Set());
  const [lockLocation, setLockLocation] = useState(false);
  const [lockedNote, setLockedNote] = useState('');

  const visibleLocations = useMemo(() => {
    if (!lockLocation) return locations;
    const lockedOnly = locations.filter(l => String(l.id) === String(location));
    if (lockedOnly.length === 0 && location) {
      return [{ id: location, name: location }];
    }
    return lockedOnly;
  }, [lockLocation, locations, location]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: prods } = await db.from('products').select('*');
  setProducts(prods || []);
  const { data: locs } = await db.from('locations').select('*');
  setLocations(locs || []);
      const { data: cats } = await db.from('categories').select('*');
      setCategories(cats || []);
      const invSnap = await fetchInventorySnapshot();
      setInventory(invSnap?.data || []);
      const { data: unitData } = await db.from('unit_of_measure').select('*');
      setUnits(unitData || []);
      const { data: images } = await db.from('product_images').select('*');
      setProductImages(images || []);
  const { data: combosData } = await db.from('combos').select('*');
      setCombos(combosData || []);
      const { data: comboItemsData } = await db.from('combo_items').select('*');
      setComboItems(comboItemsData || []);
  const { data: comboLocs } = await db.from('combo_locations').select('*');
  setComboLocations(comboLocs || []);
  const { data: ip } = await db.from('incomplete_packages').select('*');
  setIncompletePackages(ip || []);
  // ...existing code...

      // If restricted user, lock to a specific location and disable switching
      const user = getCurrentUser();
      const lockId = getLockedLocationIdForUser(user);
      const shouldLock = Boolean(lockId);
      setLockLocation(shouldLock);
      if (shouldLock) {
        const found = (locs || []).find(l => String(l.id) === String(lockId));
        setLocation(String(lockId));
        setLockedNote(found ? `Location locked to ${found.name}` : `Location locked to ${lockId}`);
      }
    };
    fetchData();
  }, []);

  // Aggregate stock per product from inventory only (current on-hand after sales/transfers/periods)
  function getStockForProduct(productId, locId = '') {
    const loc = locId === undefined || locId === null ? '' : locId;
    const fromInv = inventory
      .filter(inv => String(inv.product_id) === String(productId) && (!loc || String(inv.location) === String(loc) || String(inv.location_id) === String(loc)))
      .reduce((sum, inv) => sum + (Number(inv.quantity) || 0), 0);
    return fromInv;
  }

  // Calculate max sets for a combo (global or by location)
  function computeComboMaxQty(comboId, locId) {
    const items = comboItems.filter(ci => ci.combo_id === comboId);
    if (!items.length) return 0;
    const productStock = {};
    for (const item of items) {
      productStock[item.product_id] = getStockForProduct(item.product_id, locId);
    }
    return calcMaxSetQty(items, productStock);
  }

  // Note: mobile view shows actual on-hand stock only (no deduction for potential sets)

  // Compute buildable set qty per combo at the selected location, then sum used component stock
  const comboSetQty = new Map(); // combo_id -> set qty
  for (const combo of combos) {
    const qty = computeComboMaxQty(combo.id, location || '');
    if (qty > 0) comboSetQty.set(combo.id, qty);
  }
  const usedStock = {}; // product_id -> qty used by sets
  if (comboSetQty.size > 0) {
    for (const [comboId, setQty] of comboSetQty.entries()) {
      const items = comboItems.filter(ci => ci.combo_id === comboId);
      for (const item of items) {
        usedStock[item.product_id] = (usedStock[item.product_id] || 0) + (Number(item.quantity) || 0) * setQty;
      }
    }
  }

  // Filter products: only show if stock remains after sets
  const filteredProducts = useMemo(() => {
    const searchValue = (search || '').trim().toLowerCase();
    return products.filter(p => {
      const totalStock = getStockForProduct(p.id, location || '');
      // Hide a component if all its stock would be consumed by buildable sets
      const isSetComponent = comboItems.some(ci => String(ci.product_id) === String(p.id) && comboSetQty.has(ci.combo_id));
      if (isSetComponent) {
        const remaining = totalStock - (usedStock[p.id] || 0);
        if (remaining <= 0) return false;
      }
      const matchesCategory = !category || String(p.category_id) === String(category);
      const matchesSearch = !searchValue || (p.name && p.name.toLowerCase().includes(searchValue));
      return matchesCategory && matchesSearch;
    });
  }, [products, comboItems, comboSetQty, usedStock, getStockForProduct, location, category, search]);

  // Filter combos: show sets available at location (if selected) and matching search
  const filteredCombos = useMemo(() => {
    const searchValue = (search || '').trim().toLowerCase();
    return combos.filter(c => {
      if (location) {
        const linked = (comboLocations || []).some(cl => String(cl.combo_id) === String(c.id) && String(cl.location_id) === String(location));
        if (!linked) return false;
      }
      // Combos have their own categories: show only if All Categories is selected or category matches combo.category_id
      if (category) {
        if (String(c.category_id) !== String(category)) return false;
      }
      if (searchValue) {
        const matches = (c.combo_name && c.combo_name.toLowerCase().includes(searchValue)) || (c.sku && c.sku.toLowerCase().includes(searchValue));
        if (!matches) return false;
      }
      return true;
    });
  }, [combos, comboLocations, location, category, search]);

  const toggleComboExpanded = (id) => {
    setExpandedCombos(prev => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="stock-report-mobile-container">
      <div className="stock-report-mobile-filters">
        <select
          className="stock-report-mobile-select"
          value={location}
          onChange={e => setLocation(e.target.value)}
          disabled={lockLocation}
        >
          {!lockLocation && <option value="">All Locations</option>}
          {visibleLocations.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        {lockLocation && lockedNote && (
          <div style={{ color: '#ffcc80', fontSize: 12, marginTop: 4 }}>{lockedNote}</div>
        )}
        <select
          className="stock-report-mobile-select"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          className="stock-report-mobile-search"
          placeholder="Search Products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="stock-report-mobile-list">
        {(incompletePackages || []).filter(r => !location || String(r.location_id) === String(location)).length > 0 && (
          <div className="stock-report-mobile-card" style={{ border: '2px dashed #ff9800', background: '#2b2416' }}>
            <div style={{ fontWeight: 'bold', color: '#ffcc80', marginBottom: 6 }}>Incomplete Packages</div>
            <div style={{ color: '#fff' }}>
        {(incompletePackages || [])
                .filter(r => !location || String(r.location_id) === String(location))
                .map(r => {
                  const combo = combos.find(c => String(c.id) === String(r.combo_id));
                  const loc = locations.find(l => String(l.id) === String(r.location_id));
                  return (
                    <div key={`ip-${r.id}`} style={{ marginBottom: 4 }}>
          {(loc ? loc.name : r.location_id)}: <b>{(r.item_name && r.item_name.trim()) ? r.item_name : (combo ? combo.combo_name : r.combo_id)}</b> – Qty {r.quantity}{r.notes ? ` (${r.notes})` : ''}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
        {/* Render sets (combos) first */}
        {filteredCombos.map(c => {
          const qty = computeComboMaxQty(c.id, location || '');
          const pic = resolveProductImageUrl(c.picture_url || '');
          const stdPrice = c.combo_price || c.standard_price || '';
          const promo = c.promotional_price || '';
          const isExpanded = expandedCombos.has(String(c.id));
          const items = comboItems.filter(ci => ci.combo_id === c.id);
          return (
            <div className="stock-report-mobile-card glowing-green" key={`combo-${c.id}`}>
              <div className="stock-report-mobile-card-row">
                <div className="stock-report-mobile-card-img-wrap" style={{width: 60, height: 60, minWidth: 60, minHeight: 60, marginRight: 10}}>
                  {pic ? (
                    <img
                      src={pic}
                      alt={c.combo_name}
                      className="stock-report-mobile-card-img"
                      style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, cursor: 'pointer'}}
                      onClick={() => setExpandedImage(pic)}
                    />
                  ) : (
                    <div className="stock-report-mobile-card-img-placeholder">Set</div>
                  )}
                </div>
                <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <button
                      onClick={() => toggleComboExpanded(c.id)}
                      aria-label={isExpanded ? 'Hide components' : 'Show components'}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        border: '1px solid #00e676',
                        background: 'transparent',
                        color: '#00e676',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        lineHeight: 1,
                        padding: 0
                      }}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                    <div style={{fontWeight: 'bold', fontSize: '1.25em', color: '#fff'}}>{c.combo_name}</div>
                  </div>
                  <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: '1.1em'}}>
                    <span style={{fontWeight: 'bold', color: '#00e676'}}>Buildable Sets: {qty}</span>
                    <span style={{color: '#fff'}}>Set</span>
                  </div>
                  {isExpanded && (
                    <div style={{marginTop: 8, padding: 8, background: '#1e1e1e', borderRadius: 8, color: '#fff'}}>
                      {items && items.length > 0 ? (
                        items.map((item) => {
                          const prod = products.find(p => String(p.id) === String(item.product_id));
                          return (
                            <div key={`combo-${c.id}-item-${item.product_id}`} style={{display:'flex', justifyContent:'space-between', marginBottom: 4}}>
                              <span>{prod ? prod.name : item.product_id}</span>
                              <span>x {Number(item.quantity) || 0}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{opacity: 0.8}}>No components</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={{display: 'flex', flexDirection: 'row', gap: 16, marginTop: 8, justifyContent: 'space-between'}}>
                <div style={{fontSize: '1.1em', color: '#fff'}}>Standard Price: <b>{stdPrice !== '' ? (c.currency ? `${c.currency} ` : '') + stdPrice : '-'}</b></div>
                <div style={{fontSize: '1.1em', color: '#fff'}}>Promotional Price: <b>{promo !== '' ? (c.currency ? `${c.currency} ` : '') + promo : '-'}</b></div>
              </div>
            </div>
          );
        })}
        {/* Then render individual products */}
        {filteredProducts.map(p => {
          let unit = '';
          if (p.unit_of_measure_id) {
            const unitObj = units.find(u => u.id === p.unit_of_measure_id);
            unit = unitObj ? (unitObj.abbreviation || unitObj.name || '') : '';
          }
          const totalStock = getStockForProduct(p.id, location || '');
          const remainingStock = Math.max(0, totalStock - (usedStock[p.id] || 0));
          const imageObj = productImages.find(img => img.product_id === p.id);
          const imageUrl = resolveProductImageUrl(imageObj ? imageObj.image_url : p.image_url);
          return (
            <div className="stock-report-mobile-card glowing-green" key={p.id}>
              <div className="stock-report-mobile-card-row">
                <div className="stock-report-mobile-card-img-wrap" style={{width: 60, height: 60, minWidth: 60, minHeight: 60, marginRight: 10}}>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={p.name}
                      className="stock-report-mobile-card-img"
                      style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, cursor: 'pointer'}}
                      onClick={() => setExpandedImage(imageUrl)}
                    />
                  ) : (
                    <div className="stock-report-mobile-card-img-placeholder">No Image</div>
                  )}
                </div>
                <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                  <div style={{fontWeight: 'bold', fontSize: '1.25em', color: '#fff'}}>{p.name}</div>
                  <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: '1.1em'}}>
                    <span style={{fontWeight: 'bold', color: '#00e676'}}>Stock: {remainingStock}</span>
                    <span style={{color: '#fff'}}>{unit}</span>
                  </div>
                </div>
              </div>
              <div style={{display: 'flex', flexDirection: 'row', gap: 16, marginTop: 8, justifyContent: 'space-between'}}>
                <div style={{fontSize: '1.1em', color: '#fff'}}>Standard Price: <b>{p.price !== undefined && p.price !== null && p.price !== '' ? (p.currency ? `${p.currency} ` : '') + p.price : '-'}</b></div>
                <div style={{fontSize: '1.1em', color: '#fff'}}>Promotional Price: <b>{p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? (p.currency ? `${p.currency} ` : '') + p.promotional_price : '-'}</b></div>
              </div>
            </div>
          );
        })}
        {expandedImage && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              border: '1px solid #1f4148',
            }}
            onClick={() => setExpandedImage(null)}
          >
            <img
              src={expandedImage}
              alt="Expanded Product"
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                borderRadius: '10px',
                boxShadow: '0 0 20px #00e676',
                background: '#fff',
              }}
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setExpandedImage(null)}
              style={{
                position: 'fixed',
                top: 30,
                right: 40,
                fontSize: 32,
                background: 'transparent',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                zIndex: 1001,
              }}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        )}
    </div>
    </div>
  );
};

export default StockReportMobile;
