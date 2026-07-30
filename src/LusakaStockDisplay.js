import React, { useEffect, useMemo, useState } from 'react';
import supabase from './supabase';
import { fetchInventorySnapshot } from './services/inventorySnapshot';
import {
  fetchComboLocationPricesForLocation,
  fetchProductLocationPricesForLocation,
} from './services/locationPricing';
import { LUSAKA_BRANCH_ID } from './utils/locationIds';
import { resolveProductImageUrl } from './utils/productImageUrl';
import {
  buildComboLocationPriceMap,
  buildProductLocationPriceMap,
  resolveComboLocationPricing,
  resolveProductLocationPricing,
} from './utils/locationPricing';
import { getMaxSetQty } from './utils/setInventoryUtils';
import './lusaka-stock-display.css';

function formatLusakaPrice(value, currency) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const c = String(currency || '').toUpperCase();
  const sym = c === 'USD' || c === '$' ? '$' : (c === 'ZMW' || c === 'K' || !c ? 'K' : c);
  return `${sym} ${Math.round(num).toLocaleString('en-US')}`;
}

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

async function fetchRowsByIds(table, idField, select, ids) {
  if (!ids.length) return [];
  const rows = [];
  for (const chunk of chunkArray(ids, 200)) {
    const { data, error } = await supabase.from(table).select(select).in(idField, chunk);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function resolveLusakaProductIds(inventoryRows) {
  const ids = new Set();
  const { data: linked, error: plErr } = await supabase
    .from('product_locations')
    .select('product_id')
    .eq('location_id', LUSAKA_BRANCH_ID);
  if (plErr) throw plErr;

  (linked || []).forEach((row) => {
    if (row?.product_id) ids.add(String(row.product_id));
  });
  (inventoryRows || []).forEach((row) => {
    if (!row?.product_id) return;
    const loc = String(row.location || row.location_id || '');
    if (loc === String(LUSAKA_BRANCH_ID)) ids.add(String(row.product_id));
  });

  return Array.from(ids);
}

async function resolveLusakaComboIds() {
  const { data, error } = await supabase
    .from('combo_locations')
    .select('combo_id')
    .eq('location_id', LUSAKA_BRANCH_ID);
  if (error) throw error;
  return Array.from(new Set((data || []).map((row) => String(row.combo_id)).filter(Boolean)));
}

export default function LusakaStockDisplay() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationName, setLocationName] = useState('Lusaka');
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [productLocationPrices, setProductLocationPrices] = useState([]);
  const [comboLocationPrices, setComboLocationPrices] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedImage, setExpandedImage] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [{ data: locRow }, invSnap, productPriceRows, comboPriceRows] = await Promise.all([
          supabase.from('locations').select('id, name').eq('id', LUSAKA_BRANCH_ID).maybeSingle(),
          fetchInventorySnapshot(LUSAKA_BRANCH_ID),
          fetchProductLocationPricesForLocation(supabase, LUSAKA_BRANCH_ID),
          fetchComboLocationPricesForLocation(supabase, LUSAKA_BRANCH_ID),
        ]);
        const inventoryRows = invSnap?.data || [];
        const [productIdList, comboIdList] = await Promise.all([
          resolveLusakaProductIds(inventoryRows),
          resolveLusakaComboIds(),
        ]);

        const [productRows, comboRows, itemRows] = await Promise.all([
          fetchRowsByIds(
            'products',
            'id',
            'id, name, sku, currency, price, promotional_price, promo_start_date, promo_end_date, image_url, product_images(image_url)',
            productIdList,
          ),
          fetchRowsByIds(
            'combos',
            'id',
            'id, combo_name, sku, currency, combo_price, standard_price, promotional_price, promo_start_date, promo_end_date, picture_url',
            comboIdList,
          ),
          fetchRowsByIds(
            'combo_items',
            'combo_id',
            'combo_id, product_id, quantity',
            comboIdList,
          ),
        ]);

        if (!alive) return;
        setLocationName(locRow?.name || 'Lusaka');
        setProducts(
          productRows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })),
        );
        setCombos(
          comboRows.sort((a, b) => String(a.combo_name || '').localeCompare(String(b.combo_name || ''), undefined, { sensitivity: 'base' })),
        );
        setComboItems(itemRows);
        setInventory(inventoryRows);
        setProductLocationPrices(productPriceRows || []);
        setComboLocationPrices(comboPriceRows || []);
      } catch (err) {
        if (!alive) return;
        setError(err?.message || 'Failed to load Lusaka stock.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const stockByProduct = useMemo(() => {
    const map = new Map();
    (inventory || []).forEach((row) => {
      if (String(row.location || row.location_id) !== String(LUSAKA_BRANCH_ID)) return;
      const pid = String(row.product_id);
      map.set(pid, (map.get(pid) || 0) + (Number(row.quantity) || 0));
    });
    return map;
  }, [inventory]);

  const productLocationPriceMap = useMemo(
    () => buildProductLocationPriceMap(productLocationPrices),
    [productLocationPrices],
  );
  const comboLocationPriceMap = useMemo(
    () => buildComboLocationPriceMap(comboLocationPrices),
    [comboLocationPrices],
  );

  const setQtyByCombo = useMemo(() => {
    const map = new Map();
    (combos || []).forEach((combo) => {
      const items = (comboItems || []).filter((row) => String(row.combo_id) === String(combo.id));
      if (!items.length) {
        map.set(String(combo.id), 0);
        return;
      }
      const stock = {};
      items.forEach((item) => {
        stock[item.product_id] = stockByProduct.get(String(item.product_id)) || 0;
      });
      map.set(String(combo.id), getMaxSetQty(items, stock));
    });
    return map;
  }, [combos, comboItems, stockByProduct]);

  const displayRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sets = (combos || []).map((combo) => {
      const pricing = resolveComboLocationPricing(combo, LUSAKA_BRANCH_ID, comboLocationPriceMap);
      return {
      key: `set-${combo.id}`,
      type: 'set',
      id: combo.id,
      name: combo.combo_name || combo.sku || 'Set',
      sku: combo.sku || '',
      qty: setQtyByCombo.get(String(combo.id)) || 0,
      imageUrl: resolveProductImageUrl(combo.picture_url),
      standardPrice: formatLusakaPrice(pricing.combo_price ?? pricing.standard_price, combo.currency),
      promoPrice: formatLusakaPrice(pricing.promotional_price, combo.currency),
    };
    });

    const items = (products || []).map((product) => {
      const imageFromJoin = product.product_images?.[0]?.image_url;
      const pricing = resolveProductLocationPricing(product, LUSAKA_BRANCH_ID, productLocationPriceMap);
      return {
      key: `product-${product.id}`,
      type: 'product',
      id: product.id,
      name: product.name || product.sku || 'Product',
      sku: product.sku || '',
      qty: stockByProduct.get(String(product.id)) || 0,
      imageUrl: resolveProductImageUrl(imageFromJoin || product.image_url),
      standardPrice: formatLusakaPrice(pricing.price, product.currency),
      promoPrice: formatLusakaPrice(pricing.promotional_price, product.currency),
    };
    });

    const merged = [...sets, ...items]
      .filter((row) => Number(row.qty) > 0)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    if (!term) return merged;
    return merged.filter((row) =>
      row.name.toLowerCase().includes(term)
      || String(row.sku || '').toLowerCase().includes(term));
  }, [combos, products, search, setQtyByCombo, stockByProduct, productLocationPriceMap, comboLocationPriceMap]);

  const totalQty = useMemo(
    () => displayRows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
    [displayRows],
  );

  return (
    <div className="lusaka-stock-display">
      <header className="lusaka-stock-display__header">
        <div>
          <h1 className="lusaka-stock-display__title">{locationName} Stock</h1>
          <p className="lusaka-stock-display__subtitle">
            Products and sets assigned to this location
          </p>
        </div>
        <div className="lusaka-stock-display__stats">
          <span>{displayRows.length} items</span>
          <span>{totalQty} total qty</span>
        </div>
      </header>

      <div className="lusaka-stock-display__search-wrap">
        <input
          type="search"
          className="lusaka-stock-display__search"
          placeholder="Search name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
        />
      </div>

      {error && <div className="lusaka-stock-display__error">{error}</div>}

      {loading ? (
        <div className="lusaka-stock-display__loading">Loading stock…</div>
      ) : (
        <div className="lusaka-stock-display__grid">
          {displayRows.length === 0 ? (
            <div className="lusaka-stock-display__empty">
              No in-stock products or sets at {locationName}.
            </div>
          ) : displayRows.map((row) => (
            <article key={row.key} className="lusaka-stock-display__card">
              <button
                type="button"
                className="lusaka-stock-display__image-btn"
                onClick={() => row.imageUrl && setExpandedImage(row.imageUrl)}
                aria-label={`View image for ${row.name}`}
              >
                {row.imageUrl ? (
                  <img src={row.imageUrl} alt={row.name} className="lusaka-stock-display__image" />
                ) : (
                  <div className="lusaka-stock-display__image-placeholder">
                    {row.type === 'set' ? 'SET' : 'No image'}
                  </div>
                )}
              </button>
              <div className="lusaka-stock-display__body">
                <div className="lusaka-stock-display__type">
                  {row.type === 'set' ? 'Set' : 'Product'}
                </div>
                <h2 className="lusaka-stock-display__name">{row.name}</h2>
                {row.sku ? <div className="lusaka-stock-display__sku">{row.sku}</div> : null}
                <div className="lusaka-stock-display__prices">
                  <div className="lusaka-stock-display__price-row">
                    <span className="lusaka-stock-display__price-label">Standard</span>
                    <span className="lusaka-stock-display__price-value">{row.standardPrice}</span>
                  </div>
                  <div className="lusaka-stock-display__price-row">
                    <span className="lusaka-stock-display__price-label">Promo</span>
                    <span className="lusaka-stock-display__price-value lusaka-stock-display__price-value--promo">
                      {row.promoPrice}
                    </span>
                  </div>
                </div>
                <div className="lusaka-stock-display__qty">
                  <span className="lusaka-stock-display__qty-label">Available</span>
                  <span className={`lusaka-stock-display__qty-value${row.qty > 0 ? '' : ' is-zero'}`}>
                    {row.qty}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {expandedImage && (
        <button
          type="button"
          className="lusaka-stock-display__lightbox"
          onClick={() => setExpandedImage(null)}
          aria-label="Close image"
        >
          <img src={expandedImage} alt="" className="lusaka-stock-display__lightbox-img" />
        </button>
      )}
    </div>
  );
}
