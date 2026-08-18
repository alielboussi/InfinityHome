import React, { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { fetchShopCatalog } from '../services/shopApi';
import {
  SHOP_CATEGORY_SHOWCASE,
  SHOP_DEFAULT_SETTINGS,
  resolveCategoryFilterParam,
} from '../utils/shopContent';
import { buildShopWhatsAppUrl } from '../utils/shopConstants';
import { addToShopCart } from './shopCartStorage';

function formatPrice(amount, currency) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const sym = String(currency || 'K').toUpperCase() === 'USD' ? '$' : 'K';
  return `${sym} ${Math.round(n).toLocaleString()}`;
}

export default function ShopProducts() {
  const { bumpCart } = useOutletContext() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(SHOP_DEFAULT_SETTINGS);
  const [search, setSearch] = useState('');
  const [addedId, setAddedId] = useState('');
  const [cartError, setCartError] = useState('');
  const [selectedVariants, setSelectedVariants] = useState({});

  const categoryParam = searchParams.get('category') || '';
  const activeCategoryId = useMemo(
    () => resolveCategoryFilterParam(categories, categoryParam),
    [categories, categoryParam],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchShopCatalog();
        if (!cancelled) {
          setProducts(data?.products || []);
          setCategories(data?.categories || []);
          setSettings({ ...SHOP_DEFAULT_SETTINGS, ...(data?.settings || {}) });
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load products');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeCategories = useMemo(
    () => categories.filter((cat) => Number(cat.productCount || 0) > 0),
    [categories],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = products;
    if (activeCategoryId) {
      rows = rows.filter((p) => String(p.categoryId) === String(activeCategoryId));
    }
    if (!term) return rows;
    return rows.filter((p) => (
      String(p.name || '').toLowerCase().includes(term)
      || String(p.sku || '').toLowerCase().includes(term)
      || String(p.categoryName || '').toLowerCase().includes(term)
    ));
  }, [products, search, activeCategoryId]);

  const activeCategoryName = useMemo(() => {
    if (!activeCategoryId) return 'All products';
    return categories.find((cat) => String(cat.id) === String(activeCategoryId))?.name || 'Category';
  }, [activeCategoryId, categories]);

  const setCategory = (categoryId) => {
    const next = new URLSearchParams(searchParams);
    if (!categoryId) next.delete('category');
    else {
      const cat = categories.find((row) => String(row.id) === String(categoryId));
      const showcase = SHOP_CATEGORY_SHOWCASE.find((row) => {
        const needles = (row.categoryMatch || []).map((v) => v.toLowerCase());
        const name = String(cat?.name || '').toLowerCase();
        return needles.some((needle) => name.includes(needle));
      });
      next.set('category', cat?.slug || showcase?.slug || String(categoryId));
    }
    setSearchParams(next, { replace: true });
  };

  const selectVariant = (productId, variantId) => {
    setSelectedVariants((prev) => ({ ...prev, [String(productId)]: String(variantId) }));
    setCartError('');
  };

  const resolveSelectedVariant = (product) => {
    if (!product?.hasVariants) return null;
    const variants = product.variants || [];
    const selectedId = selectedVariants[String(product.id)];
    return variants.find((row) => String(row.id) === String(selectedId)) || null;
  };

  const handleAdd = (product) => {
    setCartError('');
    try {
      const variant = resolveSelectedVariant(product);
      if (product.hasVariants && !variant) {
        setCartError(`Choose a variant for ${product.name}`);
        return;
      }
      const qtyAvailable = variant ? Number(variant.stockQty || 0) : Number(product.qty || 0);
      addToShopCart(product, 1, variant);
      bumpCart?.();
      setAddedId(variant ? `${product.id}::${variant.id}` : product.id);
      window.setTimeout(() => setAddedId(''), 1200);
    } catch (e) {
      setCartError(e?.message || 'Could not add to cart');
    }
  };

  return (
    <div className="shop-page shop-products-page">
      <div className="shop-products-hero">
        <div>
          <p className="shop-section__eyebrow">Catalogue</p>
          <h1>{activeCategoryName}</h1>
          <p className="shop-muted">Live stock and pricing — updated in real time.</p>
        </div>
        <div className="shop-search shop-search--wide">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products or SKU…"
            aria-label="Search products"
          />
        </div>
      </div>

      <div className="shop-products-layout">
        <aside className="shop-sidebar" aria-label="Categories">
          <h2>Categories</h2>
          <button
            type="button"
            className={`shop-sidebar__link${!activeCategoryId ? ' is-active' : ''}`}
            onClick={() => setCategory(null)}
          >
            All products
            <span>{products.length}</span>
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`shop-sidebar__link${String(activeCategoryId) === String(cat.id) ? ' is-active' : ''}`}
              onClick={() => setCategory(cat.id)}
            >
              {cat.name}
              <span>{cat.productCount}</span>
            </button>
          ))}
        </aside>

        <div className="shop-products-main">
          <div className="shop-catalog__head">
            <p className="shop-muted">{filtered.length} product{filtered.length === 1 ? '' : 's'}</p>
            <Link to="/shop" className="shop-section__link">← Back to home</Link>
          </div>

          {cartError && <p className="shop-error">{cartError}</p>}
          {loading && <p className="shop-muted">Loading products…</p>}
          {error && <p className="shop-error">{error}</p>}

          {!loading && !error && filtered.length === 0 && (
            <div className="shop-empty">
              <p>No products in this collection yet.</p>
              <p className="shop-muted">Publish products in E-commerce Setup to see them here.</p>
              {activeCategoryId && (
                <button type="button" className="shop-btn shop-btn--primary" onClick={() => setCategory(null)}>
                  View all products
                </button>
              )}
            </div>
          )}

          <div className="shop-grid">
            {filtered.map((product) => {
              const selectedVariant = resolveSelectedVariant(product);
              const imageUrl = selectedVariant?.imageUrls?.[0]
                || product.imageUrls?.[0]
                || '';
              const waUrl = buildShopWhatsAppUrl({ productName: product.name, sku: product.sku })
                || (settings?.whatsappE164 ? `https://wa.me/${settings.whatsappE164}` : '');
              const stockQty = selectedVariant
                ? Number(selectedVariant.stockQty || 0)
                : Number(product.qty || 0);
              const outOfStock = stockQty <= 0;
              const lineKey = selectedVariant
                ? `${product.id}::${selectedVariant.id}`
                : product.id;
              return (
                <article key={product.id} className="shop-card">
                  <div className="shop-card__media">
                    {imageUrl ? (
                      <img src={imageUrl} alt={product.name} loading="lazy" />
                    ) : (
                      <div className="shop-card__placeholder">No image</div>
                    )}
                  </div>
                  <div className="shop-card__body">
                    {product.categoryName && (
                      <p className="shop-card__category">{product.categoryName}</p>
                    )}
                    <h3>{product.name}</h3>
                    {product.sku && <p className="shop-card__sku">SKU: {product.sku}</p>}
                    <p className="shop-card__price">{formatPrice(product.price, product.currency)}</p>

                    {product.hasVariants ? (
                      <div className="shop-card__variants">
                        <p className="shop-card__variants-label">Choose variant</p>
                        <div className="shop-card__variant-list">
                          {(product.variants || []).map((variant) => {
                            const active = String(selectedVariant?.id) === String(variant.id);
                            const variantOut = Number(variant.stockQty || 0) <= 0;
                            return (
                              <button
                                key={variant.id}
                                type="button"
                                className={`shop-card__variant${active ? ' is-active' : ''}${variantOut ? ' is-out' : ''}`}
                                onClick={() => selectVariant(product.id, variant.id)}
                                disabled={variantOut}
                              >
                                <span>{variant.name}</span>
                                <small>{variantOut ? 'Out' : `${variant.stockQty} left`}</small>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className={`shop-card__stock${outOfStock ? ' is-out' : ''}`}>
                        {outOfStock ? 'Out of stock' : `${stockQty} in stock`}
                      </p>
                    )}

                    <div className="shop-card__actions">
                      <button
                        type="button"
                        className="shop-btn shop-btn--primary"
                        disabled={outOfStock || (product.hasVariants && !selectedVariant)}
                        onClick={() => handleAdd(product)}
                      >
                        {addedId === lineKey ? 'Added ✓' : 'Add to cart'}
                      </button>
                      {waUrl && (
                        <a
                          className="shop-btn shop-btn--whatsapp"
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Enquire
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
