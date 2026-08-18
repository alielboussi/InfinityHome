import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
import { fetchInventorySnapshot } from './services/inventorySnapshot';
import { fetchProductLocationPricesForLocation } from './services/locationPricing';
import { fetchShopAdminCatalog, saveShopListing, saveShopSettings } from './services/shopApi';
import { LUSAKA_BRANCH_ID } from './utils/locationIds';
import { buildProductLocationPriceMap, resolveProductLocationPricing } from './utils/locationPricing';
import { selectPrice } from './utils/setInventoryUtils';
import { SHOP_IMAGE_BUCKET, SHOP_IMAGE_PREFIX, SHOP_LOCATION_ID } from './utils/shopConstants';
import { SHOP_DEFAULT_SETTINGS } from './utils/shopContent';
import {
  newShopVariantId,
  normalizeShopVariants,
  shopListingUsesVariants,
  shopVariantStockTotal,
} from './utils/shopVariants';
import './ecommerce-setup.css';

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

function buildShopImagePath(productId, fileName) {
  const ext = (fileName || '').split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg';
  return `${SHOP_IMAGE_PREFIX}/${productId}/shop-${Date.now()}.${ext}`;
}

function buildShopVariantImagePath(productId, variantId, fileName) {
  const ext = (fileName || '').split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg';
  return `${SHOP_IMAGE_PREFIX}/${productId}/variants/${variantId}/shop-${Date.now()}.${ext}`;
}

function createEmptyVariant(sortOrder = 0) {
  return {
    id: newShopVariantId(),
    name: '',
    image_urls: [],
    stock_qty: 0,
    sort_order: sortOrder,
  };
}

export default function EcommerceSetup() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [publishFilter, setPublishFilter] = useState('all');
  const [products, setProducts] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [shopSettings, setShopSettings] = useState({ ...SHOP_DEFAULT_SETTINGS });
  const [settingsOpen, setSettingsOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: linked, error: linkErr }, invSnap, priceRows, { data: listingRows, error: listingErr }, adminCatalog] = await Promise.all([
        db.from('product_locations').select('product_id').eq('location_id', LUSAKA_BRANCH_ID),
        fetchInventorySnapshot(LUSAKA_BRANCH_ID),
        fetchProductLocationPricesForLocation(db, LUSAKA_BRANCH_ID),
        db.from('shop_listings').select('*').eq('location_id', SHOP_LOCATION_ID),
        fetchShopAdminCatalog().catch(() => null),
      ]);
      if (linkErr) throw linkErr;
      if (listingErr) throw listingErr;
      if (invSnap?.error) throw invSnap.error;
      if (adminCatalog?.settings) {
        setShopSettings({ ...SHOP_DEFAULT_SETTINGS, ...adminCatalog.settings });
      }

      const inventoryRows = invSnap?.data || [];

      const productIds = new Set((linked || []).map((row) => String(row.product_id)).filter(Boolean));
      inventoryRows.forEach((row) => {
        if (String(row?.location || '') === String(LUSAKA_BRANCH_ID) && row?.product_id) {
          productIds.add(String(row.product_id));
        }
      });

      const ids = Array.from(productIds);
      let productRows = [];
      for (const chunk of chunkArray(ids, 100)) {
        const { data, error: prodErr } = await db
          .from('products')
          .select('id, name, sku, product_code, price, currency, description')
          .in('id', chunk);
        if (prodErr) throw prodErr;
        productRows = productRows.concat(data || []);
      }

      const qtyByProduct = new Map();
      inventoryRows.forEach((row) => {
        const pid = String(row?.product_id || '');
        if (!pid) return;
        qtyByProduct.set(pid, Math.max(0, Math.floor(Number(row?.quantity || 0))));
      });

      const priceMap = buildProductLocationPriceMap(priceRows || []);
      const listingMap = {};
      (listingRows || []).forEach((row) => {
        listingMap[String(row.product_id)] = row;
      });

      const merged = productRows.map((product) => {
        const pid = String(product.id);
        const listing = listingMap[pid] || {};
        const pricing = resolveProductLocationPricing(product, LUSAKA_BRANCH_ID, priceMap);
        const sellingPrice = selectPrice(pricing.promotional_price, pricing.price);
        const variants = normalizeShopVariants(listing.variants);
        const hasVariants = variants.length > 0;
        const inventoryQty = qtyByProduct.get(pid) || 0;
        return {
          id: pid,
          name: product.name || 'Product',
          sku: product.sku || product.product_code || '',
          shopTitle: listing.shop_title || product.name || '',
          shopDescription: listing.shop_description || product.description || '',
          shopImages: Array.isArray(listing.image_urls) ? listing.image_urls : [],
          variants,
          hasVariants,
          isPublished: Boolean(listing.is_published),
          sortOrder: Number(listing.sort_order || 0),
          price: sellingPrice,
          currency: pricing.currency || product.currency,
          inventoryQty,
          shopQty: hasVariants ? shopVariantStockTotal(variants) : inventoryQty,
        };
      }).sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      setProducts(merged);
    } catch (e) {
      setError(e?.message || 'Failed to load ecommerce setup');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (publishFilter === 'published' && !p.isPublished) return false;
      if (publishFilter === 'unpublished' && p.isPublished) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
    });
  }, [products, search, publishFilter]);

  const stats = useMemo(() => {
    const published = products.filter((p) => p.isPublished).length;
    return { total: products.length, published, unpublished: products.length - published };
  }, [products]);

  const saveSettings = async () => {
    setSettingsBusy(true);
    setError('');
    setSuccess('');
    try {
      const saved = await saveShopSettings(shopSettings);
      setShopSettings({ ...SHOP_DEFAULT_SETTINGS, ...saved });
      setSuccess('Shop settings saved');
    } catch (e) {
      setError(e?.message || 'Failed to save shop settings');
    } finally {
      setSettingsBusy(false);
    }
  };

  const updateLocal = (productId, patch) => {
    setProducts((prev) => prev.map((row) => (
      String(row.id) === String(productId) ? { ...row, ...patch } : row
    )));
  };

  const updateVariants = (productId, variants) => {
    const normalized = normalizeShopVariants(variants);
    const product = products.find((row) => String(row.id) === String(productId));
    updateLocal(productId, {
      variants: normalized,
      hasVariants: normalized.length > 0,
      shopQty: normalized.length > 0
        ? shopVariantStockTotal(normalized)
        : (product?.inventoryQty ?? 0),
    });
  };

  const persistListing = async (product) => {
    setBusyId(product.id);
    setError('');
    setSuccess('');
    try {
      const variants = normalizeShopVariants(product.variants);
      if (variants.some((row) => !row.name.trim())) {
        throw new Error('Every shop variant needs a name');
      }
      await saveShopListing({
        product_id: product.id,
        location_id: SHOP_LOCATION_ID,
        shop_title: product.shopTitle,
        shop_description: product.shopDescription,
        image_urls: product.shopImages,
        variants,
        is_published: product.isPublished,
        sort_order: product.sortOrder,
      });
      updateLocal(product.id, {
        variants,
        hasVariants: variants.length > 0,
        shopQty: variants.length > 0 ? shopVariantStockTotal(variants) : product.inventoryQty,
      });
      setSuccess(`Saved ${product.name}`);
    } catch (e) {
      setError(e?.message || 'Failed to save listing');
    } finally {
      setBusyId('');
    }
  };

  const uploadShopImage = async (product, file) => {
    if (!file) return;
    setBusyId(product.id);
    setError('');
    try {
      const path = buildShopImagePath(product.id, file.name);
      const bucket = db.storage.from(SHOP_IMAGE_BUCKET);
      const { error: uploadErr } = await bucket.upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: pub } = bucket.getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error('Failed to get image URL');
      const nextImages = [...(product.shopImages || []), url];
      updateLocal(product.id, { shopImages: nextImages });
      await persistListing({ ...product, shopImages: nextImages });
    } catch (e) {
      setError(e?.message || 'Image upload failed');
      setBusyId('');
    }
  };

  const removeShopImage = async (product, url) => {
    const nextImages = (product.shopImages || []).filter((entry) => entry !== url);
    updateLocal(product.id, { shopImages: nextImages });
    await persistListing({ ...product, shopImages: nextImages });
  };

  const uploadVariantImage = async (product, variantId, file) => {
    if (!file) return;
    setBusyId(product.id);
    setError('');
    try {
      const path = buildShopVariantImagePath(product.id, variantId, file.name);
      const bucket = db.storage.from(SHOP_IMAGE_BUCKET);
      const { error: uploadErr } = await bucket.upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: pub } = bucket.getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error('Failed to get image URL');
      const nextVariants = (product.variants || []).map((variant) => (
        String(variant.id) === String(variantId)
          ? { ...variant, image_urls: [...(variant.image_urls || []), url] }
          : variant
      ));
      updateVariants(product.id, nextVariants);
      await persistListing({ ...product, variants: nextVariants });
    } catch (e) {
      setError(e?.message || 'Variant image upload failed');
      setBusyId('');
    }
  };

  const removeVariantImage = async (product, variantId, url) => {
    const nextVariants = (product.variants || []).map((variant) => (
      String(variant.id) === String(variantId)
        ? { ...variant, image_urls: (variant.image_urls || []).filter((entry) => entry !== url) }
        : variant
    ));
    updateVariants(product.id, nextVariants);
    await persistListing({ ...product, variants: nextVariants });
  };

  return (
    <div className="ecom-setup">
      <div className="ecom-setup__header">
        <BackToDashboard />
        <div>
          <h1>E-commerce Setup</h1>
          <p className="ecom-setup__sub">
            Shop images and online-only variants. Prices follow Products; stock uses Lusaka inventory unless variants are added.
          </p>
        </div>
        <Link to="/ecommerce-sales" className="ecom-setup__preview">
          Online orders
        </Link>
        <Link to="/shop" target="_blank" rel="noopener noreferrer" className="ecom-setup__preview">
          Open shop ↗
        </Link>
      </div>

      <section className="ecom-setup__settings">
        <button
          type="button"
          className="ecom-setup__settings-toggle"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          Shop settings {settingsOpen ? '▾' : '▸'}
        </button>
        {settingsOpen ? (
          <div className="ecom-setup__settings-body">
            <p className="ecom-setup__settings-note">
              Store name, tagline, and WhatsApp number appear on the public shop landing page and product enquiry links.
            </p>
            <div className="ecom-setup__settings-grid">
              <label>
                Store name
                <input
                  value={shopSettings.storeName || ''}
                  onChange={(e) => setShopSettings((prev) => ({ ...prev, storeName: e.target.value }))}
                />
              </label>
              <label>
                Support email
                <input
                  type="email"
                  value={shopSettings.supportEmail || ''}
                  onChange={(e) => setShopSettings((prev) => ({ ...prev, supportEmail: e.target.value }))}
                />
              </label>
              <label>
                WhatsApp number (digits only, e.g. 26097…)
                <input
                  value={shopSettings.whatsappE164 || ''}
                  onChange={(e) => setShopSettings((prev) => ({
                    ...prev,
                    whatsappE164: e.target.value.replace(/\D/g, ''),
                  }))}
                  placeholder="2609XXXXXXXX"
                />
              </label>
              <label className="ecom-setup__settings-wide">
                Tagline
                <textarea
                  rows={2}
                  value={shopSettings.tagline || ''}
                  onChange={(e) => setShopSettings((prev) => ({ ...prev, tagline: e.target.value }))}
                />
              </label>
            </div>
            <button
              type="button"
              className="ecom-setup__save ecom-setup__save--inline"
              disabled={settingsBusy}
              onClick={saveSettings}
            >
              {settingsBusy ? 'Saving…' : 'Save shop settings'}
            </button>
          </div>
        ) : null}
      </section>

      <div className="ecom-setup__stats">
        <span><strong>{stats.published}</strong> published on shop</span>
        <span><strong>{stats.unpublished}</strong> not published</span>
        <span><strong>{stats.total}</strong> Lusaka products</span>
      </div>

      <div className="ecom-setup__toolbar">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="ecom-setup__search"
        />
        <select
          className="ecom-setup__filter"
          value={publishFilter}
          onChange={(e) => setPublishFilter(e.target.value)}
        >
          <option value="all">All products</option>
          <option value="published">Published only</option>
          <option value="unpublished">Not published</option>
        </select>
        <span className="ecom-setup__count">{filtered.length} shown</span>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="ecom-setup__error">{error}</p>}
      {success && <p className="ecom-setup__success">{success}</p>}

      <div className="ecom-setup__list">
        {filtered.map((product) => {
          const hasVariants = shopListingUsesVariants(product.variants);
          const displayQty = hasVariants ? shopVariantStockTotal(product.variants) : product.inventoryQty;
          return (
            <article key={product.id} className="ecom-setup__card">
              <div className="ecom-setup__images">
                <span className="ecom-setup__label">Shop images</span>
                <div className="ecom-setup__shop-images">
                  {(product.shopImages || []).map((url) => (
                    <div key={url} className="ecom-setup__shop-thumb">
                      <img src={url} alt="" />
                      <button type="button" onClick={() => removeShopImage(product, url)} aria-label="Remove image">×</button>
                    </div>
                  ))}
                  <label className="ecom-setup__upload" title="Add shop image">
                    +
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => uploadShopImage(product, e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>

              <div className="ecom-setup__meta">
                <div className="ecom-setup__title-row">
                  <strong>{product.name}</strong>
                  <span>{product.sku}</span>
                </div>
                <p>
                  Lusaka: {product.currency === 'USD' ? '$' : 'K'} {Number(product.price || 0).toLocaleString()}
                  {' · '}
                  {hasVariants
                    ? `Online stock (variants): ${displayQty}`
                    : `Shop stock (Lusaka inventory): ${displayQty}`}
                </p>

                <label>
                  Shop title
                  <input
                    value={product.shopTitle}
                    onChange={(e) => updateLocal(product.id, { shopTitle: e.target.value })}
                  />
                </label>
                <label>
                  Shop description
                  <textarea
                    rows={2}
                    value={product.shopDescription}
                    onChange={(e) => updateLocal(product.id, { shopDescription: e.target.value })}
                  />
                </label>

                <div className="ecom-setup__variants">
                  <div className="ecom-setup__variants-head">
                    <span className="ecom-setup__label">Shop variants (online only)</span>
                    <button
                      type="button"
                      className="ecom-setup__variant-add"
                      onClick={() => updateVariants(product.id, [
                        ...(product.variants || []),
                        createEmptyVariant((product.variants || []).length),
                      ])}
                    >
                      + Add variant
                    </button>
                  </div>
                  {hasVariants && (
                    <p className="ecom-setup__variants-note">
                      Stock is managed per variant on the shop only. Lusaka inventory is not used while variants exist.
                    </p>
                  )}
                  {(product.variants || []).map((variant, variantIndex) => (
                    <div key={variant.id} className="ecom-setup__variant-card">
                      <div className="ecom-setup__variant-row">
                        <label>
                          Variant name
                          <input
                            value={variant.name}
                            onChange={(e) => {
                              const next = [...(product.variants || [])];
                              next[variantIndex] = { ...variant, name: e.target.value };
                              updateVariants(product.id, next);
                            }}
                            placeholder="e.g. Walnut / Large"
                          />
                        </label>
                        <label>
                          Online stock qty
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={variant.stock_qty}
                            onChange={(e) => {
                              const next = [...(product.variants || [])];
                              next[variantIndex] = {
                                ...variant,
                                stock_qty: Math.max(0, Math.floor(Number(e.target.value || 0))),
                              };
                              updateVariants(product.id, next);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="ecom-setup__variant-remove"
                          onClick={() => {
                            const next = (product.variants || []).filter((row) => row.id !== variant.id);
                            updateVariants(product.id, next);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="ecom-setup__variant-images">
                        {(variant.image_urls || []).map((url) => (
                          <div key={url} className="ecom-setup__shop-thumb ecom-setup__shop-thumb--small">
                            <img src={url} alt="" />
                            <button
                              type="button"
                              onClick={() => removeVariantImage(product, variant.id, url)}
                              aria-label="Remove variant image"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <label className="ecom-setup__upload ecom-setup__upload--small" title="Add variant image">
                          +
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => uploadVariantImage(product, variant.id, e.target.files?.[0])}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <label>
                  Sort order (lower = first on shop)
                  <input
                    type="number"
                    step="1"
                    value={product.sortOrder}
                    onChange={(e) => updateLocal(product.id, {
                      sortOrder: Number(e.target.value || 0),
                    })}
                  />
                </label>

                <label className="ecom-setup__publish">
                  <input
                    type="checkbox"
                    checked={product.isPublished}
                    onChange={(e) => updateLocal(product.id, { isPublished: e.target.checked })}
                  />
                  Published on shop
                </label>
                <button
                  type="button"
                  className="ecom-setup__save"
                  disabled={busyId === product.id}
                  onClick={() => persistListing(product)}
                >
                  {busyId === product.id ? 'Saving…' : 'Save'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
