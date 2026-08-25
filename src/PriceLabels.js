/* eslint-disable no-unused-vars */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import db from './dataClient';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import { FaWhatsapp } from 'react-icons/fa';
import { cacheClear, cacheGet, cacheSet } from './utils/staleCache';
import BackToDashboard from './BackToDashboard';
import { logUserActivity } from './utils/userActivityLog';
import { sendLabelsWhatsApp } from './services/whatsapp';
import {
  applyComboLocationPricing,
  applyProductLocationPricing,
  buildComboLocationPriceMap,
  buildProductLocationPriceMap,
} from './utils/locationPricing';
import {
  fetchComboLocationPrices,
  fetchProductLocationPrices,
} from './services/locationPricing';
import { brandLogoOnError, preloadBrandAssets, STATIC_BRAND_LOGO, STATIC_BRAND_STAMP } from './utils/brandAssets';
import { buildPriceLabelFilename, renderLabelNodeToCanvas, waitForLayout } from './utils/labelPdfCapture';
import { buildLabelImageQrValue } from './utils/labelImageQr';

const PRODUCTS_LIST_CATALOG_CACHE_KEY = 'products:list:catalog:v3';

// PriceLabels: search, select, and print/export two-up A4 labels
const PriceLabels = () => {
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogCombos, setCatalogCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [labelLocationId, setLabelLocationId] = useState('');
  const [productLocationPrices, setProductLocationPrices] = useState([]);
  const [comboLocationPrices, setComboLocationPrices] = useState([]);
  const [company, setCompany] = useState({ name: 'Best Rest Furniture' });
  const [logoSrc, setLogoSrc] = useState(STATIC_BRAND_LOGO);
  const [stampSrc, setStampSrc] = useState(STATIC_BRAND_STAMP);
  const [assetsReady, setAssetsReady] = useState(false);

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState([]); // { type, id, data, qty }
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [categoryQty, setCategoryQty] = useState('1');
  const [categoryBulkMessage, setCategoryBulkMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const sendRenderRef = useRef(null);
  const addedOrderRef = useRef(1);
  const fetchSeqRef = useRef(0);

  const productLocationPriceMap = useMemo(
    () => buildProductLocationPriceMap(productLocationPrices),
    [productLocationPrices],
  );
  const comboLocationPriceMap = useMemo(
    () => buildComboLocationPriceMap(comboLocationPrices),
    [comboLocationPrices],
  );

  const pricingLocationId = useMemo(
    () => String(labelLocationId || '').trim(),
    [labelLocationId],
  );

  const getPricedCatalogItem = useCallback((type, id) => {
    if (!id) return null;
    if (type === 'product') {
      const row = (catalogProducts || []).find((product) => String(product.id) === String(id));
      if (!row) return null;
      if (!pricingLocationId) return row;
      return applyProductLocationPricing(row, pricingLocationId, productLocationPriceMap);
    }
    const row = (catalogCombos || []).find((combo) => String(combo.id) === String(id));
    if (!row) return null;
    if (!pricingLocationId) return row;
    return applyComboLocationPricing(row, pricingLocationId, comboLocationPriceMap);
  }, [
    catalogCombos,
    catalogProducts,
    comboLocationPriceMap,
    pricingLocationId,
    productLocationPriceMap,
  ]);

  const resolveItemLocationPrices = useCallback((item) => {
    const priced = getPricedCatalogItem(item?.type, item?.id) || item?.data || {};
    if (item?.type === 'product') {
      return {
        standard: priced.price,
        promo: priced.promotional_price,
        currency: priced.currency,
      };
    }
    return {
      standard: priced.combo_price ?? priced.standard_price,
      promo: priced.promotional_price,
      currency: priced.currency,
    };
  }, [getPricedCatalogItem]);

  const getNextAddedOrder = useCallback(() => {
    const order = addedOrderRef.current;
    addedOrderRef.current += 1;
    return order;
  }, []);

  const sortByAddOrder = useCallback((items) => (
    [...items]
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const ao = Number.isFinite(a.item.addedOrder) ? a.item.addedOrder : a.index + 1;
        const bo = Number.isFinite(b.item.addedOrder) ? b.item.addedOrder : b.index + 1;
        return ao - bo;
      })
      .map(({ item }) => item)
  ), []);

  const selectedInAddOrder = useMemo(
    () => sortByAddOrder(selected),
    [selected, sortByAddOrder],
  );

  const locationPriceCacheKey = 'labels:locationPrices:v6:all';

  const fetchLabelData = useCallback(async ({
    useCache = false,
    showLoading = false,
    bustCache = false,
  } = {}) => {
    const fetchSeq = ++fetchSeqRef.current;
    if (showLoading) setIsRefreshing(true);
    if (bustCache) {
      try { cacheClear(locationPriceCacheKey); } catch {}
    }
    try {
      if (useCache) {
        try {
          const sharedCatalog = cacheGet(PRODUCTS_LIST_CATALOG_CACHE_KEY);
          if (sharedCatalog && typeof sharedCatalog === 'object') {
            if (sharedCatalog.products?.length) setCatalogProducts(sharedCatalog.products);
            if (sharedCatalog.combos?.length) setCatalogCombos(sharedCatalog.combos);
            if (sharedCatalog.productLocationPrices?.length) {
              setProductLocationPrices(sharedCatalog.productLocationPrices);
            }
            if (sharedCatalog.comboLocationPrices?.length) {
              setComboLocationPrices(sharedCatalog.comboLocationPrices);
            }
            if (sharedCatalog.categories?.length) setCategories(sharedCatalog.categories);
            if (sharedCatalog.locations?.length) setLocations(sharedCatalog.locations);
          }
          const cachedPrices = cacheGet(locationPriceCacheKey);
          const p = cacheGet('labels:catalogProducts:v7');
          const c = cacheGet('labels:catalogCombos:v6');
          if (p?.length) setCatalogProducts(p);
          if (c?.length) setCatalogCombos(c);
          if (cachedPrices) {
            setProductLocationPrices(cachedPrices.productLocationPrices || []);
            setComboLocationPrices(cachedPrices.comboLocationPrices || []);
          }
          const ci = cacheGet('labels:comboItems:v6'); if (ci) setComboItems(ci);
          const cat = cacheGet('labels:categories:v6'); if (cat) setCategories(cat);
          const loc = cacheGet('labels:locations:v1'); if (loc) setLocations(loc);
          const co = cacheGet('labels:company:v6'); if (co) setCompany(co);
        } catch {}
      }

      const { data: locationsData } = await db.from('locations').select('id, name').order('name', { ascending: true });
      if (fetchSeq !== fetchSeqRef.current) return;
      const nextLocations = locationsData || [];
      setLocations(nextLocations);
      try { cacheSet('labels:locations:v1', nextLocations, 10 * 60 * 1000); } catch {}

      let productLocationPriceRows = [];
      let comboLocationPriceRows = [];
      const [
        { data: productsData, error: productsErr },
        { data: combosData, error: combosErr },
        { data: productImagesData },
      ] = await Promise.all([
        db.from('products').select('*'),
        db.from('combos').select('*'),
        db.from('product_images').select('product_id, image_url'),
      ]);
      if (productsErr) {
        console.warn('[price-labels] products fetch failed', productsErr);
      }
      if (combosErr) {
        console.warn('[price-labels] combos fetch failed', combosErr);
      }
      if (fetchSeq !== fetchSeqRef.current) return;

      const imagesByProduct = new Map();
      (productImagesData || []).forEach((row) => {
        const pid = String(row?.product_id || '');
        if (!pid) return;
        if (!imagesByProduct.has(pid)) imagesByProduct.set(pid, []);
        imagesByProduct.get(pid).push({ image_url: row.image_url });
      });

      const nextProducts = (productsData || []).map((product) => ({
        ...product,
        product_images: imagesByProduct.get(String(product.id)) || product.product_images || [],
      }));
      const nextCombos = combosData || [];
      try {
        [productLocationPriceRows, comboLocationPriceRows] = await Promise.all([
          fetchProductLocationPrices(db),
          fetchComboLocationPrices(db),
        ]);
      } catch (err) {
        console.warn('[price-labels] location pricing unavailable', err);
      }
      if (fetchSeq !== fetchSeqRef.current) return;
      setCatalogProducts(nextProducts);
      setCatalogCombos(nextCombos);
      setProductLocationPrices(productLocationPriceRows);
      setComboLocationPrices(comboLocationPriceRows);
      try {
        cacheSet('labels:catalogProducts:v7', nextProducts, 10 * 60 * 1000);
        cacheSet('labels:catalogCombos:v6', nextCombos, 10 * 60 * 1000);
        cacheSet(locationPriceCacheKey, {
          productLocationPrices: productLocationPriceRows,
          comboLocationPrices: comboLocationPriceRows,
        }, 10 * 60 * 1000);
      } catch {}

      const { data: categoriesData } = await db.from('categories').select('id, name').order('name', { ascending: true });
      if (fetchSeq !== fetchSeqRef.current) return;
      const nextCategories = categoriesData || [];
      setCategories(nextCategories);
      try { cacheSet('labels:categories:v6', nextCategories, 10 * 60 * 1000); } catch {}

      const { data: ci } = await db.from('combo_items').select('*');
      if (fetchSeq !== fetchSeqRef.current) return;
      const nextComboItems = ci || [];
      setComboItems(nextComboItems);
      try { cacheSet('labels:comboItems:v6', nextComboItems, 10 * 60 * 1000); } catch {}

      const { data: companyData } = await db.from('company_settings').select('company_name, company_logo').maybeSingle();
      if (fetchSeq !== fetchSeqRef.current) return;
      const companyRow = companyData?.company_name
        ? { name: companyData.company_name }
        : { name: 'Best Rest Furniture' };
      setCompany(companyRow);
      try { cacheSet('labels:company:v6', companyRow, 60 * 60 * 1000); } catch {}

      const brandAssets = await preloadBrandAssets({ includeStamp: true });
      if (fetchSeq !== fetchSeqRef.current) return;
      setLogoSrc(brandAssets.logoSrc || STATIC_BRAND_LOGO);
      setStampSrc(brandAssets.stampSrc || STATIC_BRAND_STAMP);
      setAssetsReady(true);
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: locationsData } = await db.from('locations').select('id, name').order('name', { ascending: true });
      if (cancelled) return;
      const nextLocations = locationsData || [];
      setLocations(nextLocations);
      setLabelLocationId((current) => (
        current || (nextLocations[0]?.id ? String(nextLocations[0].id) : '')
      ));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetchLabelData({ useCache: true, bustCache: true });
  }, [fetchLabelData]);

  const normalizeCatalogName = useCallback((value) => (
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  ), []);

  const normalizeSku = useCallback((sku) => (
    String(sku || '').replace(/^#/, '').trim().toLowerCase()
  ), []);

  const productSkuCounts = useMemo(() => {
    const counts = new Map();
    (catalogProducts || []).forEach((product) => {
      const sku = normalizeSku(product?.sku);
      if (sku) counts.set(sku, (counts.get(sku) || 0) + 1);
    });
    return counts;
  }, [catalogProducts, normalizeSku]);

  const comboSkuCounts = useMemo(() => {
    const counts = new Map();
    (catalogCombos || []).forEach((combo) => {
      const sku = normalizeSku(combo?.sku);
      if (sku) counts.set(sku, (counts.get(sku) || 0) + 1);
    });
    return counts;
  }, [catalogCombos, normalizeSku]);

  // Only treat a product/set as the same item when names match, or SKU is unique across both tables.
  const findMatchingSetForProduct = useCallback((product) => {
    const sku = normalizeSku(product?.sku);
    const nameKey = normalizeCatalogName(product?.name);

    if (nameKey) {
      const byName = (catalogCombos || []).find(
        (combo) => normalizeCatalogName(combo.combo_name) === nameKey,
      );
      if (byName) return byName;
    }

    if (
      sku
      && comboSkuCounts.get(sku) === 1
      && productSkuCounts.get(sku) === 1
    ) {
      return (catalogCombos || []).find((combo) => normalizeSku(combo.sku) === sku) || null;
    }

    return null;
  }, [catalogCombos, comboSkuCounts, normalizeCatalogName, normalizeSku, productSkuCounts]);

  useEffect(() => {
    if (!search.trim()) return setSearchResults([]);
    const q = search.toLowerCase();
    const matchesTerm = (value) => String(value || '').toLowerCase().includes(q);
    const resultByKey = new Map();

    (catalogCombos || []).forEach((combo) => {
      if (!matchesTerm(combo.combo_name) && !matchesTerm(combo.sku)) return;
      resultByKey.set(`set:${combo.id}`, { type: 'set', id: combo.id });
    });

    (catalogProducts || []).forEach((product) => {
      if (!matchesTerm(product.name) && !matchesTerm(product.sku)) return;
      const matchingSet = findMatchingSetForProduct(product);
      if (matchingSet) {
        resultByKey.set(`set:${matchingSet.id}`, { type: 'set', id: matchingSet.id });
        return;
      }
      resultByKey.set(`product:${product.id}`, { type: 'product', id: product.id });
    });

    setSearchResults(Array.from(resultByKey.values()));
  }, [search, catalogProducts, catalogCombos, findMatchingSetForProduct]);

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
    const payload = { type: item.type, id: item.id };
    setSelected((prev) => {
      const idx = prev.findIndex((s) => s.type === payload.type && s.id === payload.id);
      if (idx === -1) return [...prev, { ...payload, qty, addedOrder: getNextAddedOrder(), printStandardOnly: false }];
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
    const matches = catalogProducts.filter((product) => String(product.category_id) === catKey);
    if (!matches.length) {
      alert('No products found in this category.');
      return;
    }

    setSelected((prev) => {
      const next = [...prev];
      matches.forEach((product) => {
        const item = { type: 'product', id: product.id };
        const idx = next.findIndex((s) => s.type === item.type && s.id === item.id);
        if (idx === -1) {
          next.push({ ...item, qty, addedOrder: getNextAddedOrder(), printStandardOnly: false });
        } else {
          next[idx] = {
            ...next[idx],
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
    const priced = getPricedCatalogItem(item.type, item.id);
    const label = item.type === 'product'
      ? (priced?.name || 'Product')
      : (priced?.combo_name || 'Set');
    const qty = promptQty(label, 1);
    if (qty === null) return;
    addItem(item, qty);
    setSearch('');
    setSearchResults([]);
  };
  const removeItem = (item) => setSelected((prev) => prev.filter((s) => !(s.type === item.type && s.id === item.id)));
  const togglePrintStandardOnly = (item) => {
    setSelected((prev) => prev.map((s) => (
      s.type === item.type && s.id === item.id
        ? { ...s, printStandardOnly: !s.printStandardOnly }
        : s
    )));
  };
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
  const formatDisplayPrice = (value, currency) => {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '—';
    const c = String(currency || '').toUpperCase();
    const sym = c === 'USD' || c === '$' ? '$' : 'K';
    return `${sym} ${Math.round(num).toLocaleString('en-US')}`;
  };
  const formatPromoDisplay = (standard, promo, currency) => {
    const promoNum = Number(promo);
    const standardNum = Number(standard);
    if (!Number.isFinite(promoNum) || promoNum <= 0) return '—';
    if (Number.isFinite(standardNum) && promoNum >= standardNum) return '—';
    return formatDisplayPrice(promo, currency);
  };
  const hasActivePromo = (standard, promo) => {
    const promoNum = Number(promo);
    const standardNum = Number(standard);
    return Number.isFinite(promoNum) && promoNum > 0
      && (!Number.isFinite(standardNum) || promoNum < standardNum);
  };
  const getSearchItemPrices = (item) => resolveItemLocationPrices(item);
  const selectedLocationName = locations.find((loc) => String(loc.id) === String(labelLocationId))?.name || '';
  const getDiscountPercent = (oldP, promoP) => {
    if (!oldP || !promoP) return null;
    const percent = Math.round((1 - promoP / oldP) * 100);
    return percent > 0 ? percent : null;
  };

  // Build a friendly default filename for the browser's "Save as PDF" dialog
  const buildPriceLabelsFilename = () => buildPriceLabelFilename(selectedLocationName);

  // Trigger print with a temporary document.title so the PDF default name matches our pattern.
  const printWithAutoFilename = (showExportHint = false) => {
    const oldTitle = document.title;
    const autoTitle = buildPriceLabelsFilename();
    const labelSummary = selectedInAddOrder.map((item) => {
      const priced = getPricedCatalogItem(item.type, item.id);
      const name = item.type === 'product' ? priced?.name : priced?.combo_name;
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
  const expanded = selectedInAddOrder.flatMap((s) => Array(normalizeQty(s.qty)).fill(s));
  const pairs = [];
  for (let i = 0; i < expanded.length; i += 2) pairs.push([expanded[i], expanded[i + 1] || null]);

  const waitForLayoutOnly = () => waitForLayout();

  // Build PDF from the offscreen render, upload it, then post to the WhatsApp group.
  const sendToWhatsApp = async () => {
    if (selected.length === 0 || isSending) return;
    if (!assetsReady) {
      alert('Logos are still loading. Please try again in a moment.');
      return;
    }
    setIsSending(true);
    try {
      await waitForLayoutOnly();
      const container = sendRenderRef.current;
      const labelNodes = container ? Array.from(container.querySelectorAll('.a4-pair')) : [];
      if (!labelNodes.length) {
        alert('Nothing to send yet — labels are still rendering. Try again.');
        return;
      }

      const pageWidthMm = 210;
      const pageHeightMm = 297;
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      doc.setProperties({ title: 'Price Printing' });

      let first = true;
      for (const node of labelNodes) {
        // eslint-disable-next-line no-await-in-loop
        await waitForLayoutOnly();
        // eslint-disable-next-line no-await-in-loop
        const canvas = await renderLabelNodeToCanvas(node);
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (!first) doc.addPage();
        first = false;
        doc.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');
      }

      const pdfBlob = doc.output('blob');
      if (!pdfBlob || pdfBlob.size < 4096) {
        throw new Error('Generated PDF is empty. Please try again.');
      }
      const filename = `${buildPriceLabelsFilename()}.pdf`;

      // Upload through the labels API (private bucket, returns signed URL)
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const pdfBase64 = btoa(binary);

      const apiBase = (process.env.REACT_APP_API_BASE || '').trim().replace(/\/?$/, '');
      const host = (() => {
        try { return window?.location?.hostname || ''; } catch { return ''; }
      })();
      const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(host);
      const apiUrl = (!isLocalHost && apiBase) ? `${apiBase}/api/labels` : '/api/labels';

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: filename, folder: 'desktop', pdfBase64 }),
      });
      const json = await resp.json().catch(() => ({}));
      const url = json?.signedUrl || json?.publicUrl || '';
      if (!resp.ok || !url) {
        throw new Error(json?.error || `Label upload failed (${resp.status})`);
      }

      const labelSummary = selectedInAddOrder.map((item) => {
        const priced = getPricedCatalogItem(item.type, item.id);
        const name = item.type === 'product' ? priced?.name : priced?.combo_name;
        return `${name || item.type} x${normalizeQty(item.qty)}`;
      }).join('; ');

      const sendResult = await sendLabelsWhatsApp({
        pdfUrl: url,
        pdfBase64,
        pdfFilename: filename,
        message: `Price labels — ${expanded.length} label${expanded.length === 1 ? '' : 's'}`,
      });
      if (!sendResult.ok) {
        throw new Error(sendResult.error || 'WhatsApp send failed');
      }

      logUserActivity({
        actionType: 'price_label_print',
        actionLabel: 'Price Labels Sent (WhatsApp)',
        details: `${selected.length} item${selected.length === 1 ? '' : 's'} • ${labelSummary}`,
        reference: filename,
        entityType: 'price_label_batch',
        entityId: String(selected.length),
      });
      alert('Sent to the Price Labels WhatsApp group.');
    } catch (err) {
      console.error('WhatsApp labels send failed', err);
      alert(`WhatsApp send failed: ${err?.message || err}`);
    } finally {
      setIsSending(false);
    }
  };

  // Always render two halves per sheet; if the second item is null we render an empty placeholder.
  // This guarantees the dashed cut line appears even when only one label is selected.

  // Render a single label - matches CSS layout
  const LabelCard = ({ item }) => {
  if (!item) return <div className="label-card" />; // placeholder to keep half-page blank only on last page
  const isProduct = item.type === 'product';
  const data = getPricedCatalogItem(item.type, item.id) || {};
  const priced = resolveItemLocationPrices(item);
  // Only show components when the selected item is a set
  const components = item.type === 'set' ? getComboComponents(item.id) : [];
    const oldPrice = priced.standard;
    const promoPrice = priced.promo;
    const printStandardOnly = Boolean(item.printStandardOnly);
    const hasPromo = !printStandardOnly && hasActivePromo(oldPrice, promoPrice);
    const discount = hasPromo ? getDiscountPercent(oldPrice, promoPrice) : null;
    const imageQrValue = buildLabelImageQrValue(item, data);

    return (
      <div className="label-card">
        <div className="label-watermark"><img src={logoSrc} alt="wm" onError={brandLogoOnError} /></div>
        <div className="label-header">
          <img src={logoSrc} className="header-logo" alt="logo" onError={brandLogoOnError} />
          <div className="header-company">{company.name || 'Best Rest Furniture'}</div>
          <img src={logoSrc} className="header-logo" alt="logo" onError={brandLogoOnError} />
        </div>

        {/* Product name line, left-aligned below header */}
        <div className="label-name">
          <span className="label-name-label">Product Name:</span>
          <span className="label-name-value">{isProduct ? data.name : data.combo_name}</span>
        </div>

        {components && components.length > 0 && (
          <ul className="label-components">
            {components.map((c) => {
              const prod = catalogProducts.find((p) => p.id === c.product_id) || {};
              return (
                <li key={c.product_id}>{prod.name || c.product_id} x{c.quantity}</li>
              );
            })}
          </ul>
        )}

        <div className="label-stamp">
          <img src={stampSrc} alt="stamp" />
        </div>

        <div className="label-bl">
          <div className="label-qr" aria-label="Product code QR">
            <QRCodeCanvas value={(isProduct ? data.sku : data.sku) || ''} size={98} level="M" includeMargin />
          </div>
          <div className="label-sku">
            <span className="sku-label">Code:</span> {isProduct ? data.sku : data.sku}
          </div>
        </div>

        <div className="label-br">
          {hasPromo ? (
            <div className="price-old price-old-labeled">
              <span className="price-old-label">Old Price:</span>{' '}
              <span className="price-old-amount diagonal">{formatCurrency(oldPrice)}</span>
            </div>
          ) : null}

          {imageQrValue ? (
            <div className="label-photo-qr-block">
              <div className="label-qr label-qr--photo" aria-label="Scan to view product photo">
                <QRCodeCanvas value={imageQrValue} size={98} level="M" includeMargin />
              </div>
              <div className="label-photo-qr-caption">Product photo</div>
            </div>
          ) : null}

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
      <div className="label-toolbar">
        <input
          className="label-toolbar-search"
          placeholder="Search products or sets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="label-refresh-btn"
          onClick={() => fetchLabelData({ showLoading: true, bustCache: true })}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        <select
          className="label-category-bulk-control label-toolbar-category"
          value={labelLocationId}
          onChange={(e) => setLabelLocationId(e.target.value)}
          aria-label="Label pricing location"
        >
          <option value="">Select location</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
        <select
          className="label-category-bulk-control label-toolbar-category"
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
        <input
          className="label-category-bulk-control label-toolbar-qty"
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
        <button type="button" className="label-category-bulk-btn" onClick={addCategoryProducts}>
          Add category
        </button>
      </div>
      {categoryBulkMessage ? (
        <div className="label-category-bulk-message" role="status">{categoryBulkMessage}</div>
      ) : null}

      {search && searchResults.length > 0 && (
        <div className="label-search-results">
          {labelLocationId && selectedLocationName ? (
            <div className="label-search-results-note">
              Prices shown for {selectedLocationName}
            </div>
          ) : null}
          <ul className="search-list">
            {searchResults.map((r) => {
              const pricedItem = getPricedCatalogItem(r.type, r.id) || {};
              const prices = getSearchItemPrices(r);
              const displayName = r.type === 'product' ? pricedItem.name : pricedItem.combo_name;
              const sku = pricedItem?.sku || '';
              return (
              <li className="search-item" key={r.type + '-' + r.id}>
                <div className="search-item-main">
                  <div className="search-item-name">
                    {displayName}
                    {sku ? <span className="search-item-sku">{sku}</span> : null}
                  </div>
                  <div className="search-item-prices">
                    <span className="search-item-price">
                      <span className="search-item-price-label">Standard</span>
                      <span>{formatDisplayPrice(prices.standard, prices.currency)}</span>
                    </span>
                    <span className="search-item-price search-item-price--promo">
                      <span className="search-item-price-label">Promo</span>
                      <span>{formatPromoDisplay(prices.standard, prices.promo, prices.currency)}</span>
                    </span>
                  </div>
                </div>
                <div className={`search-item-type search-item-type--${r.type}`}>
                  {r.type === 'set' ? 'Set' : 'Product'}
                </div>
                <button type="button" className="search-item-add" onClick={() => handleAdd(r)}>Add</button>
              </li>
              );
            })}
          </ul>
        </div>
      )}
      {search.trim() && searchResults.length === 0 ? (
        <div className="label-search-results-note" role="status">
          No products or sets matched &quot;{search.trim()}&quot;. Try Refresh if this item was added recently.
        </div>
      ) : null}

      <div className="label-selected-table">
        <h3>Labels to Print</h3>
        {selected.length === 0 ? <div style={{ color: '#aaa' }}>No items selected.</div> : (
          <table className="labels-table-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Standard</th>
                <th>Promo</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {selectedInAddOrder.map((s) => {
                const pricedItem = getPricedCatalogItem(s.type, s.id) || {};
                const prices = getSearchItemPrices(s);
                return (
                <tr key={s.type + '-' + s.id}>
                  <td>
                    {s.type === 'product' ? pricedItem.name : pricedItem.combo_name}
                    {pricedItem?.sku ? <div className="labels-table-sku">{pricedItem.sku}</div> : null}
                  </td>
                  <td>{formatDisplayPrice(prices.standard, prices.currency)}</td>
                  <td className="labels-table-promo">{formatPromoDisplay(prices.standard, prices.promo, prices.currency)}</td>
                  <td>{s.type === 'set' ? 'Set' : 'Product'}</td>
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
                  <td>
                    <div className="labels-table-actions">
                      <label
                        className="labels-table-standard-only"
                        title="Print or send at standard price only (no promo on label)"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(s.printStandardOnly)}
                          onChange={() => togglePrintStandardOnly(s)}
                          aria-label={`Print ${s.type === 'product' ? pricedItem.name : pricedItem.combo_name} at standard price only`}
                        />
                        <span>Std price</span>
                      </label>
                      <button type="button" onClick={() => removeItem(s)}>Remove</button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="label-actions">
        <button disabled={selected.length === 0} onClick={() => printWithAutoFilename(true)}>Save as PDF</button>
        <button
          type="button"
          className="label-whatsapp-btn"
          disabled={selected.length === 0 || isSending || !assetsReady}
          onClick={sendToWhatsApp}
          aria-busy={isSending}
          title="Send to WhatsApp group"
          aria-label="Send to WhatsApp group"
        >
          <FaWhatsapp />
        </button>
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

      {/* Offscreen render for WhatsApp PDF capture — always mounted so layout/images are ready */}
      <section className="labels-a4 plm-hidden-render" ref={sendRenderRef} aria-hidden>
        {pairs.map((pair, idx) => (
          <div className="a4-pair" key={`send-${idx}`}>
            <div className="a4-label"><LabelCard item={pair[0]} /></div>
            <div className="a4-label"><LabelCard item={pair[1] || null} /></div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default PriceLabels;
