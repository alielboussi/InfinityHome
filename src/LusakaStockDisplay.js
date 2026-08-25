import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import db from './dataClient';
import { fetchInventorySnapshot } from './services/inventorySnapshot';
import {
  fetchComboLocationPricesForLocation,
  fetchProductLocationPricesForLocation,
} from './services/locationPricing';
import { LUSAKA_BRANCH_ID } from './utils/locationIds';
import { resolveProductImageUrl, resolveProductRecordImageUrl } from './utils/productImageUrl';
import {
  buildComboLocationPriceMap,
  buildProductLocationPriceMap,
  resolveComboLocationPricing,
  resolveProductLocationPricing,
} from './utils/locationPricing';
import { getMaxSetQty } from './utils/setInventoryUtils';
import { buildProductById, buildSetComponents } from './utils/lusakaStockSetComponents';
import {
  buildSetComponentProductIds,
  expandLusakaComboIds,
  filterComboItemsForCombos,
  mergeProductIdsForSets,
} from './utils/lusakaStockSetMatching';
import { clearStaleAppLogin } from './utils/authSession';
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
    const { data, error } = await db.from(table).select(select).in(idField, chunk);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function fetchProductImageMap(productIds) {
  if (!productIds.length) return new Map();
  const map = new Map();
  for (const chunk of chunkArray(productIds, 30)) {
    await Promise.all(chunk.map(async (productId) => {
      const pid = String(productId);
      const { data, error } = await db
        .from('product_images')
        .select('product_id, image_url')
        .eq('product_id', pid)
        .maybeSingle();
      if (error || !data?.image_url) return;
      const url = String(data.image_url).trim();
      if (url) map.set(pid, url);
    }));
  }
  return map;
}

function mergeProductImages(productRows, imageByProductId) {
  return (productRows || []).map((product) => {
    const pid = String(product.id);
    const joinedUrl = imageByProductId.get(pid);
    if (!joinedUrl) return product;
    const existing = Array.isArray(product.product_images) ? product.product_images : [];
    if (existing.some((row) => row?.image_url === joinedUrl)) return product;
    return {
      ...product,
      product_images: [{ image_url: joinedUrl }, ...existing],
    };
  });
}

async function resolveLusakaProductIds(inventoryRows) {
  const ids = new Set();
  const { data: linked, error: plErr } = await db
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
  const { data, error } = await db
    .from('combo_locations')
    .select('combo_id')
    .eq('location_id', LUSAKA_BRANCH_ID);
  if (error) throw error;
  return Array.from(new Set((data || []).map((row) => String(row.combo_id)).filter(Boolean)));
}

const STOCK_SYNC_MS = 60_000;

function StockCardImage({ row, onExpand }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = row.imageUrl || '';
  const showImage = Boolean(imageUrl) && !failed;
  const placeholderLabel = row.type === 'set' ? 'SET' : 'No image';

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const openExpanded = () => {
    if (showImage) onExpand(imageUrl);
  };

  return (
    <button
      type="button"
      className={`lusaka-stock-display__image-btn${showImage ? ' is-expandable' : ''}`}
      onClick={openExpanded}
      aria-label={showImage ? `View larger image for ${row.name}` : `No image for ${row.name}`}
      disabled={!showImage}
    >
      {showImage ? (
        <>
          <img
            key={imageUrl}
            src={imageUrl}
            alt=""
            className="lusaka-stock-display__image"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
          <div className="lusaka-stock-display__image-zoom" aria-hidden="true">
            <img src={imageUrl} alt="" className="lusaka-stock-display__image-zoom-img" />
          </div>
        </>
      ) : (
        <div className="lusaka-stock-display__image-placeholder">
          {placeholderLabel}
        </div>
      )}
    </button>
  );
}

function StockCard({ row, onExpandImage }) {
  const [showComponents, setShowComponents] = useState(false);
  const hasComponents = row.type === 'set' && Array.isArray(row.components) && row.components.length > 0;

  return (
    <article className="lusaka-stock-display__card">
      <StockCardImage row={row} onExpand={onExpandImage} />
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
        {hasComponents ? (
          <>
            <button
              type="button"
              className={`lusaka-stock-display__components-toggle${showComponents ? ' is-open' : ''}`}
              aria-expanded={showComponents}
              aria-label={showComponents ? 'Hide set components' : 'Show set components'}
              onClick={() => setShowComponents((open) => !open)}
            >
              <span className="lusaka-stock-display__components-caret" aria-hidden="true" />
            </button>
            {showComponents ? (
              <ul className="lusaka-stock-display__components-list">
                {row.components.map((component) => (
                  <li key={component.productId} className="lusaka-stock-display__components-item">
                    <div className="lusaka-stock-display__components-name">{component.name}</div>
                    <div className="lusaka-stock-display__components-meta">
                      {component.requiredQty > 1 ? `${component.requiredQty} per set · ` : ''}
                      {component.qty} in stock
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

export default function LusakaStockDisplay() {
  const navigate = useNavigate();
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
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const refreshStock = useCallback(async ({ initial = false } = {}) => {
    if (initial) {
      setLoading(true);
      setError('');
    }
    try {
      const [{ data: locRow }, invSnap, productPriceRows, comboPriceRows] = await Promise.all([
        db.from('locations').select('id, name').eq('id', LUSAKA_BRANCH_ID).maybeSingle(),
        fetchInventorySnapshot(LUSAKA_BRANCH_ID),
        fetchProductLocationPricesForLocation(db, LUSAKA_BRANCH_ID),
        fetchComboLocationPricesForLocation(db, LUSAKA_BRANCH_ID),
      ]);
      const inventoryRows = invSnap?.data || [];
      const [productIdList, linkedComboIds] = await Promise.all([
        resolveLusakaProductIds(inventoryRows),
        resolveLusakaComboIds(),
      ]);

      const [
        { data: allCombosData },
        { data: allComboItemsData },
        productRows,
        imageByProductId,
      ] = await Promise.all([
        db.from('combos').select('*'),
        db.from('combo_items').select('combo_id, product_id, quantity'),
        fetchRowsByIds(
          'products',
          'id',
          'id, name, sku, currency, price, promotional_price, promo_start_date, promo_end_date, image_url, product_images(image_url)',
          productIdList,
        ),
        fetchProductImageMap(productIdList),
      ]);

      const allCombos = allCombosData || [];
      const allComboItems = allComboItemsData || [];
      let mergedProducts = mergeProductImages(productRows, imageByProductId)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

      let expandedComboIds = expandLusakaComboIds(linkedComboIds, mergedProducts, allCombos);
      let itemRows = filterComboItemsForCombos(allComboItems, expandedComboIds);
      const fullProductIdList = mergeProductIdsForSets(productIdList, itemRows, expandedComboIds);

      if (fullProductIdList.length > productIdList.length) {
        const extraRows = await fetchRowsByIds(
          'products',
          'id',
          'id, name, sku, currency, price, promotional_price, promo_start_date, promo_end_date, image_url, product_images(image_url)',
          fullProductIdList.filter((id) => !productIdList.includes(String(id))),
        );
        const extraImages = await fetchProductImageMap(
          fullProductIdList.filter((id) => !productIdList.includes(String(id))),
        );
        mergedProducts = mergeProductImages(
          [...mergedProducts, ...extraRows],
          new Map([...imageByProductId, ...extraImages]),
        ).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
        expandedComboIds = expandLusakaComboIds(linkedComboIds, mergedProducts, allCombos);
        itemRows = filterComboItemsForCombos(allComboItems, expandedComboIds);
      }

      const comboRows = allCombos.filter((combo) => expandedComboIds.includes(String(combo.id)));

      setLocationName(locRow?.name || 'Lusaka');
      setProducts(mergedProducts);
      setCombos(
        comboRows.sort((a, b) => String(a.combo_name || '').localeCompare(String(b.combo_name || ''), undefined, { sensitivity: 'base' })),
      );
      setComboItems(itemRows);
      setInventory(inventoryRows);
      setProductLocationPrices(productPriceRows || []);
      setComboLocationPrices(comboPriceRows || []);
      setError('');
      setLastSyncedAt(new Date());
    } catch (err) {
      if (initial) {
        setError(err?.message || 'Failed to load Lusaka stock.');
      }
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async (initial) => {
      if (!alive) return;
      await refreshStock({ initial });
    };
    run(true);
    const timer = setInterval(() => run(false), STOCK_SYNC_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshStock]);

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
        stock[String(item.product_id)] = stockByProduct.get(String(item.product_id)) || 0;
      });
      map.set(String(combo.id), getMaxSetQty(items, stock));
    });
    return map;
  }, [combos, comboItems, stockByProduct]);

  const setComponentProductIds = useMemo(
    () => buildSetComponentProductIds(combos, comboItems),
    [combos, comboItems],
  );

  const displayRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const productById = buildProductById(products);
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
      components: buildSetComponents(combo.id, comboItems, productById, stockByProduct),
    };
    });

    const items = (products || [])
      .filter((product) => !setComponentProductIds.has(String(product.id)))
      .map((product) => {
      const pricing = resolveProductLocationPricing(product, LUSAKA_BRANCH_ID, productLocationPriceMap);
      return {
      key: `product-${product.id}`,
      type: 'product',
      id: product.id,
      name: product.name || product.sku || 'Product',
      sku: product.sku || '',
      qty: stockByProduct.get(String(product.id)) || 0,
      imageUrl: resolveProductRecordImageUrl(product),
      standardPrice: formatLusakaPrice(pricing.price, product.currency),
      promoPrice: formatLusakaPrice(pricing.promotional_price, product.currency),
    };
    });

    const merged = [...sets, ...items]
      .filter((row) => Number(row.qty) > 0)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    if (!term) return merged;
    return merged.filter((row) => {
      if (row.name.toLowerCase().includes(term)) return true;
      if (String(row.sku || '').toLowerCase().includes(term)) return true;
      if (row.type === 'set' && Array.isArray(row.components)) {
        return row.components.some((component) =>
          String(component.name || '').toLowerCase().includes(term)
          || String(component.sku || '').toLowerCase().includes(term));
      }
      return false;
    });
  }, [combos, products, comboItems, search, setQtyByCombo, setComponentProductIds, stockByProduct, productLocationPriceMap, comboLocationPriceMap]);

  const totalQty = useMemo(
    () => displayRows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
    [displayRows],
  );

  useEffect(() => {
    if (!expandedImage) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setExpandedImage(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expandedImage]);

  const handleLogout = async () => {
    try { await db.auth.signOut(); } catch {}
    clearStaleAppLogin();
    navigate('/login?next=%2Flusaka-stock', { replace: true });
  };

  return (
    <div className="lusaka-stock-display">
      <header className="lusaka-stock-display__header">
        <div>
          <h1 className="lusaka-stock-display__title">{locationName} Stock</h1>
          <p className="lusaka-stock-display__subtitle">
            Products and sets assigned to this location
            {lastSyncedAt ? ` · updated ${lastSyncedAt.toLocaleTimeString()}` : ''}
          </p>
        </div>
        <div className="lusaka-stock-display__header-actions">
          <div className="lusaka-stock-display__stats">
            <span>{displayRows.length} items</span>
            <span>{totalQty} total qty</span>
          </div>
          <button
            type="button"
            className="lusaka-stock-display__logout"
            onClick={handleLogout}
          >
            Log out
          </button>
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
            <StockCard key={row.key} row={row} onExpandImage={setExpandedImage} />
          ))}
        </div>
      )}

      {expandedImage && (
        <div
          className="lusaka-stock-display__lightbox"
          onClick={() => setExpandedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded product image"
        >
          <button
            type="button"
            className="lusaka-stock-display__lightbox-close"
            onClick={() => setExpandedImage(null)}
            aria-label="Close image"
          >
            ×
          </button>
          <img
            src={expandedImage}
            alt=""
            className="lusaka-stock-display__lightbox-img"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
