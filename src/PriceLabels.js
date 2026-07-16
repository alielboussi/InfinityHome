/* eslint-disable no-unused-vars */
import React, { useCallback, useEffect, useState } from 'react';
import supabase from './supabase';
import { QRCodeSVG } from 'qrcode.react';
import { cacheGet, cacheSet } from './utils/staleCache';
import BackToDashboard from './BackToDashboard';
import { logUserActivity } from './utils/userActivityLog';

// PriceLabels: search, select, and print/export two-up A4 labels
const PriceLabels = () => {
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [company, setCompany] = useState({ name: 'Best Rest Furniture' });

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState([]); // { type, id, data, qty }
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [categoryQty, setCategoryQty] = useState('1');
  const [categoryBulkMessage, setCategoryBulkMessage] = useState('');

  const fetchLabelData = useCallback(async ({ useCache = false, showLoading = false } = {}) => {
    if (showLoading) setIsRefreshing(true);
    try {
      // Hydrate instantly from cache
      if (useCache) {
        try {
          const p = cacheGet('labels:products:v2'); if (p) setProducts(p);
          const c = cacheGet('labels:combos:v2'); if (c) setCombos(c);
          const ci = cacheGet('labels:comboItems:v2'); if (ci) setComboItems(ci);
          const cat = cacheGet('labels:categories:v2'); if (cat) setCategories(cat);
          const co = cacheGet('labels:company:v2'); if (co) setCompany(co);
        } catch {}
      }

      const { data: productsData } = await supabase.from('products').select('*');
      const nextProducts = productsData || [];
      setProducts(nextProducts);
      try { cacheSet('labels:products:v2', nextProducts, 10 * 60 * 1000); } catch {}

      const { data: categoriesData } = await supabase.from('categories').select('id, name').order('name', { ascending: true });
      const nextCategories = categoriesData || [];
      setCategories(nextCategories);
      try { cacheSet('labels:categories:v2', nextCategories, 10 * 60 * 1000); } catch {}

      const { data: combosData } = await supabase.from('combos').select('*');
      const nextCombos = combosData || [];
      setCombos(nextCombos);
      try { cacheSet('labels:combos:v2', nextCombos, 10 * 60 * 1000); } catch {}

      const { data: ci } = await supabase.from('combo_items').select('*');
      const nextComboItems = ci || [];
      setComboItems(nextComboItems);
      try { cacheSet('labels:comboItems:v2', nextComboItems, 10 * 60 * 1000); } catch {}

      const { data: companyData } = await supabase.from('company_settings').select('name').maybeSingle();
      if (companyData && companyData.name) setCompany(companyData);
      try { cacheSet('labels:company:v2', companyData || { name: 'Best Rest Furniture' }, 60 * 60 * 1000); } catch {}

      // Keep current selections, but refresh their data if it changed server-side
      setSelected((prev) => prev.map((s) => {
        if (s.type === 'product') {
          const updated = nextProducts.find((p) => p.id === s.id);
          return updated ? { ...s, data: updated } : s;
        }
        if (s.type === 'set') {
          const updated = nextCombos.find((c) => c.id === s.id);
          return updated ? { ...s, data: updated } : s;
        }
        return s;
      }));
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLabelData({ useCache: true });
  }, [fetchLabelData]);

  // simple search
  useEffect(() => {
    if (!search.trim()) return setSearchResults([]);
    const q = search.toLowerCase();
    const p = products.filter((x) => (x.name || '').toLowerCase().includes(q));
    const s = combos.filter((c) => (c.combo_name || '').toLowerCase().includes(q));
    // Do not de-duplicate; allow selecting both a product and a set even if names/SKUs match
    setSearchResults([
      ...p.map((x) => ({ type: 'product', id: x.id, data: x })),
      ...s.map((c) => ({ type: 'set', id: c.id, data: c })),
    ]);
  }, [search, products, combos]);

  const normalizeQty = (qty) => Math.max(1, parseInt(String(qty).replace(/[^\d]/g, ''), 10) || 1);

  const promptQty = (label, defaultQty = 1) => {
    const raw = window.prompt(`Enter qty for ${label}`, String(defaultQty));
    if (raw === null) return null;
    const trimmed = String(raw).trim();
    if (!/^\d+$/.test(trimmed)) {
      alert('Enter a whole number quantity.');
      return null;
    }
    const qty = Math.max(1, parseInt(trimmed, 10));
    if (!Number.isFinite(qty) || qty <= 0) {
      alert('Enter a valid quantity.');
      return null;
    }
    return qty;
  };

  const addItem = (item, qty) => {
    setSelected((prev) => {
      const idx = prev.findIndex((s) => s.type === item.type && s.id === item.id);
      if (idx === -1) return [...prev, { ...item, qty }];
      const next = [...prev];
      const existing = next[idx];
      next[idx] = { ...existing, qty: normalizeQty(existing.qty) + normalizeQty(qty) };
      return next;
    });
  };

  const addCategoryProducts = () => {
    const catKey = String(categoryId || '').trim();
    if (!catKey) {
      alert('Select a category first.');
      return;
    }
    const qty = normalizeQty(categoryQty);
    const matches = products.filter((product) => String(product.category_id) === catKey);
    if (!matches.length) {
      alert('No products found in this category.');
      return;
    }

    setSelected((prev) => {
      const next = [...prev];
      matches.forEach((product) => {
        const item = { type: 'product', id: product.id, data: product };
        const idx = next.findIndex((s) => s.type === item.type && s.id === item.id);
        if (idx === -1) {
          next.push({ ...item, qty });
        } else {
          next[idx] = {
            ...next[idx],
            data: product,
            qty: normalizeQty(next[idx].qty) + qty,
          };
        }
      });
      return next;
    });

    const categoryName = categories.find((cat) => String(cat.id) === catKey)?.name || 'category';
    setCategoryBulkMessage(`Added ${matches.length} product${matches.length === 1 ? '' : 's'} from ${categoryName} (qty ${qty} each).`);
  };
  // Add and clear search box/results
  const handleAdd = (item) => {
    const label = item.type === 'product' ? (item.data?.name || 'Product') : (item.data?.combo_name || 'Set');
    const qty = promptQty(label, 1);
    if (qty === null) return;
    addItem(item, qty);
    setSearch('');
    setSearchResults([]);
  };
  const removeItem = (item) => setSelected((prev) => prev.filter((s) => !(s.type === item.type && s.id === item.id)));
  const handleQtyChange = (item, rawValue) => {
    const cleaned = String(rawValue).replace(/[^\d]/g, '');
    setSelected((prev) => prev.map((s) => (
      s.type === item.type && s.id === item.id ? { ...s, qty: cleaned } : s
    )));
  };

  const handleQtyBlur = (item) => {
    setSelected((prev) => prev.map((s) => (
      s.type === item.type && s.id === item.id ? { ...s, qty: normalizeQty(s.qty) } : s
    )));
  };

  const getComboComponents = (comboId) => comboItems.filter((c) => c.combo_id === comboId);

  // Note: Do not infer combo components for standalone products. Only explicit sets show components.

  const formatCurrency = (v) => (v === null || v === undefined || v === '' ? '' : `K ${Number(v).toLocaleString()}`);
  const getDiscountPercent = (oldP, promoP) => {
    if (!oldP || !promoP) return null;
    const percent = Math.round((1 - promoP / oldP) * 100);
    return percent > 0 ? percent : null;
  };

  // Build a friendly default filename for the browser's "Save as PDF" dialog
  const buildPriceLabelsFilename = () => {
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `Price_Printing_${date}_${time}`;
  };

  // Trigger print with a temporary document.title so the PDF default name matches our pattern.
  const printWithAutoFilename = (showExportHint = false) => {
    const oldTitle = document.title;
    const autoTitle = buildPriceLabelsFilename();
    const labelSummary = selected.map((item) => {
      const name = item.type === 'product' ? item.data?.name : item.data?.combo_name;
      return `${name || item.type} x${normalizeQty(item.qty)}`;
    }).join('; ');
    logUserActivity({
      actionType: 'price_label_print',
      actionLabel: showExportHint ? 'Price Labels Exported (PDF)' : 'Price Labels Printed',
      details: `${selected.length} item${selected.length === 1 ? '' : 's'} • ${labelSummary}`,
      reference: autoTitle,
      entityType: 'price_label_batch',
      entityId: String(selected.length),
    });
    try {
      document.title = autoTitle;
    } catch {}
    // Open print dialog; user can choose printer or "Save as PDF"
    window.print();
    // Restore quickly; Chrome/Edge capture title at invocation time
    setTimeout(() => {
      try { document.title = oldTitle; } catch {}
      if (showExportHint) {
        alert('Choose "Save as PDF" in the print dialog to export.');
      }
    }, 400);
  };

  // Expand selection by qty and create label pairs (2 per page)
  // - Mix products and sets in sequence
  // - If total is odd, the last page will contain a single label (second half blank)
  const expanded = selected.flatMap((s) => Array(normalizeQty(s.qty)).fill(s));
  const pairs = [];
  for (let i = 0; i < expanded.length; i += 2) pairs.push([expanded[i], expanded[i + 1] || null]);

  // Always render two halves per sheet; if the second item is null we render an empty placeholder.
  // This guarantees the dashed cut line appears even when only one label is selected.

  // Render a single label - matches CSS layout
  const LabelCard = ({ item }) => {
  if (!item) return <div className="label-card" />; // placeholder to keep half-page blank only on last page
  const isProduct = item.type === 'product';
  const data = item.data;
  // Only show components when the selected item is a set
  const components = item.type === 'set' ? getComboComponents(item.id) : [];
    const oldPrice = isProduct ? data.price : data.standard_price || data.combo_price;
    const promoPrice = data.promotional_price;
    const hasPromo = promoPrice || promoPrice === 0;
    const discount = hasPromo ? getDiscountPercent(oldPrice, promoPrice) : null;

    return (
      <div className="label-card">
        <div className="label-watermark"><img src="/bestrest-logo.png" alt="wm" /></div>
        <div className="label-header">
          <img src="/bestrest-logo.png" className="header-logo" alt="logo" />
          <div className="header-company">{company.name || 'Best Rest Furniture'}</div>
          <img src="/bestrest-logo.png" className="header-logo" alt="logo" />
        </div>

        {/* Product name line, left-aligned below header */}
        <div className="label-name">
          <span className="label-name-label">Product Name:</span>
          <span className="label-name-value">{isProduct ? data.name : data.combo_name}</span>
        </div>

        {components && components.length > 0 && (
          <ul className="label-components">
            {components.map((c) => {
              const prod = products.find((p) => p.id === c.product_id) || {};
              return (
                <li key={c.product_id}>{prod.name || c.product_id} x{c.quantity}</li>
              );
            })}
          </ul>
        )}

        {/* Digital stamp overlay (subtle) */}
        <div className="label-stamp">
          <img src="/bestreststamp.png" alt="stamp" />
        </div>

        <div className="label-bl">
          <div className="label-qr"><QRCodeSVG value={(isProduct ? data.sku : data.sku) || ''} /></div>
          <div className="label-sku"><span className="sku-label">Code:</span> {isProduct ? data.sku : data.sku}</div>
        </div>

        <div className="label-br">
          {/* Old price (standard) with label and strike-through when promo exists */}
          {hasPromo ? (
            <div className="price-old price-old-labeled">
              <span className="price-old-label">Old Price:</span>{' '}
              <span className="price-old-amount diagonal">{formatCurrency(oldPrice)}</span>
            </div>
          ) : null}

          {/* Price line(s) */}
          {hasPromo ? (
            <div className="price-now promo">
              <span className="price-now-label">PROMO PRICE:</span> {formatCurrency(promoPrice)}!
            </div>
          ) : (
            <div className="price-now">
              <span className="price-now-label">Price:</span> {formatCurrency(oldPrice)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="price-labels-page">
      <div className="page-header-row">
        <BackToDashboard />
        <h2 style={{ margin: 0 }}>Price Labels</h2>
      </div>
      <div className="label-search-bar">
        <input placeholder="Search products or sets..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button
          type="button"
          className="label-refresh-btn"
          onClick={() => fetchLabelData({ showLoading: true })}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh list'}
        </button>
      </div>

      <div className="label-category-bulk-bar">
        <label className="label-category-bulk-item">
          <span className="label-category-bulk-label">Category</span>
          <span className="label-category-bulk-control-shell label-category-bulk-control-shell--category">
            <select
              className="label-category-bulk-control"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setCategoryBulkMessage('');
              }}
              aria-label="Category for bulk add"
            >
              <option value="">Select category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </span>
        </label>
        <label className="label-category-bulk-item label-category-bulk-qty">
          <span className="label-category-bulk-label">Qty</span>
          <span className="label-category-bulk-control-shell label-category-bulk-control-shell--qty">
            <input
              className="label-category-bulk-control"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Qty"
              value={categoryQty}
              onChange={(e) => {
                setCategoryQty(e.target.value.replace(/[^\d]/g, ''));
                setCategoryBulkMessage('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCategoryProducts();
                }
              }}
              aria-label="Quantity for each product in category"
            />
          </span>
        </label>
        <button type="button" className="label-category-bulk-btn" onClick={addCategoryProducts}>
          Add category
        </button>
        {categoryBulkMessage ? (
          <span className="label-category-bulk-message" role="status">{categoryBulkMessage}</span>
        ) : null}
      </div>

      {search && searchResults.length > 0 && (
        <div className="label-search-results">
          <ul className="search-list">
            {searchResults.map((r) => (
              <li className="search-item" key={r.type + '-' + r.id}>
                <div className="search-item-name">{r.type === 'product' ? r.data.name : r.data.combo_name}</div>
                <div className="search-item-type">{r.type}</div>
                <button className="search-item-add" onClick={() => handleAdd(r)}>Add</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="label-selected-table">
        <h3>Labels to Print</h3>
        {selected.length === 0 ? <div style={{ color: '#aaa' }}>No items selected.</div> : (
          <table className="labels-table-full">
            <thead><tr><th>Name</th><th>Type</th><th>Qty</th><th>Remove</th></tr></thead>
            <tbody>
              {selected.map((s) => (
                <tr key={s.type + '-' + s.id}>
                  <td>{s.type === 'product' ? s.data.name : s.data.combo_name}</td>
                  <td>{s.type}</td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={s.qty}
                      onChange={(e) => handleQtyChange(s, e.target.value)}
                      onBlur={() => handleQtyBlur(s)}
                      style={{ width: 64 }}
                      aria-label="Print quantity"
                    />
                  </td>
                  <td><button onClick={() => removeItem(s)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="label-actions">
        <button disabled={selected.length === 0} onClick={() => printWithAutoFilename(false)}>Print</button>
        <button disabled={selected.length === 0} onClick={() => printWithAutoFilename(true)}>Export as PDF</button>
      </div>

      {/* Print-only labels */}
      <div className="labels-a4">
        {pairs.length === 0 ? null : pairs.map((pair, idx) => (
          <div className="a4-pair" key={idx}>
            <div className="a4-label"><LabelCard item={pair[0]} /></div>
            <div className="a4-label"><LabelCard item={pair[1] || null} /></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PriceLabels;
