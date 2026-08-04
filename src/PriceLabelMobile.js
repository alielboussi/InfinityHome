/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import db from './dataClient';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import { sendLabelsWhatsApp } from './services/whatsapp';
import {
  applyComboLocationPricing,
  applyProductLocationPricing,
  buildComboLocationPriceMap,
  buildProductLocationPriceMap,
} from './utils/locationPricing';
import {
  fetchComboLocationPricesForLocation,
  fetchProductLocationPricesForLocation,
} from './services/locationPricing';
import { brandLogoOnError, preloadBrandAssets, STATIC_BRAND_LOGO, STATIC_BRAND_STAMP } from './utils/brandAssets';
import { buildPriceLabelFilename, renderLabelNodeToCanvas, waitForLayout } from './utils/labelPdfCapture';

// Mobile-first Price Labels: search, select, preview, save PDF and share
export default function PriceLabelMobile() {
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [company, setCompany] = useState({ name: 'Best Rest Furniture' });
  const [locations, setLocations] = useState([]);
  const [labelLocationId, setLabelLocationId] = useState('');
  const [logoSrc, setLogoSrc] = useState(STATIC_BRAND_LOGO);
  const [stampSrc, setStampSrc] = useState(STATIC_BRAND_STAMP);
  const [assetsReady, setAssetsReady] = useState(false);

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState([]); // { type, id, data, qty }
  const [isGenerating, setIsGenerating] = useState(false);
  // no bottom sheet; search stays at top

  const loadCatalogForLocation = async (locationId) => {
    const { data: productsData } = await db.from('products').select('*');
    const { data: combosData } = await db.from('combos').select('*');
    let productLocationPriceRows = [];
    let comboLocationPriceRows = [];
    if (locationId) {
      try {
        [productLocationPriceRows, comboLocationPriceRows] = await Promise.all([
          fetchProductLocationPricesForLocation(db, locationId),
          fetchComboLocationPricesForLocation(db, locationId),
        ]);
      } catch (err) {
        console.warn('[price-label-mobile] location pricing unavailable', err);
      }
    }
    const productMap = buildProductLocationPriceMap(productLocationPriceRows);
    const comboMap = buildComboLocationPriceMap(comboLocationPriceRows);
    setProducts((productsData || []).map((row) => applyProductLocationPricing(row, locationId, productMap)));
    setCombos((combosData || []).map((row) => applyComboLocationPricing(row, locationId, comboMap)));
  };

  useEffect(() => {
    (async () => {
      const { data: locationsData } = await db.from('locations').select('id, name').order('name', { ascending: true });
      const nextLocations = locationsData || [];
      setLocations(nextLocations);
      const initialLocationId = nextLocations[0]?.id ? String(nextLocations[0].id) : '';
      if (initialLocationId) setLabelLocationId(initialLocationId);
      const { data: ci } = await db.from('combo_items').select('*');
      setComboItems(ci || []);
      const { data: companyData } = await db.from('company_settings').select('company_name').maybeSingle();
      if (companyData?.company_name) setCompany({ name: companyData.company_name });
      if (initialLocationId) await loadCatalogForLocation(initialLocationId);
    })();
  }, []);

  useEffect(() => {
    if (!labelLocationId) return;
    loadCatalogForLocation(labelLocationId);
  }, [labelLocationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const brandAssets = await preloadBrandAssets({ includeStamp: true });
        if (cancelled) return;
        setLogoSrc(brandAssets.logoSrc || STATIC_BRAND_LOGO);
        setStampSrc(brandAssets.stampSrc || STATIC_BRAND_STAMP);
      } finally {
        if (!cancelled) setAssetsReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Enhanced search: by name, set name, SKU, and price (standard/promotional)
  useEffect(() => {
    const term = search.trim();
    if (!term) { setSearchResults([]); return; }
    const q = term.toLowerCase();
    const digits = term.replace(/[^0-9.]/g, '');

    const matchPrice = (val) => {
      if (digits.length === 0) return false;
      const n = Number(val);
      if (isNaN(n)) return false;
      const asRaw = String(Math.round(n * 100) / 100).replace(/\D/g, '');
      const qRaw = digits.replace(/\D/g, '');
      // loose match: substring of number without formatting
      return asRaw.includes(qRaw);
    };

    const productMatches = (x) => {
      const byName = (x.name || '').toLowerCase().includes(q);
      const bySku = (x.sku || '').toString().toLowerCase().includes(q);
      const byStd = matchPrice(x.price);
      const byPromo = matchPrice(x.promotional_price);
      return byName || bySku || byStd || byPromo;
    };

    const comboMatches = (c) => {
      const byName = (c.combo_name || '').toLowerCase().includes(q);
      const bySku = (c.sku || '').toString().toLowerCase().includes(q);
      const byStd = matchPrice(c.standard_price || c.combo_price);
      const byPromo = matchPrice(c.promotional_price);
      return byName || bySku || byStd || byPromo;
    };

    const matchedProducts = products.filter(productMatches);
    const matchedCombos = combos.filter(comboMatches);

    // suppress duplicates where a product matches a set by same name or SKU
    const comboNames = new Set(matchedCombos.map(c => (c.combo_name || '').toLowerCase()));
    const comboSkus = new Set(matchedCombos.map(c => (c.sku || '').toString().toLowerCase()));
    const pFiltered = matchedProducts.filter(prod => {
      const n = (prod.name || '').toLowerCase();
      const sku = (prod.sku || '').toString().toLowerCase();
      return !(comboNames.has(n) || (sku && comboSkus.has(sku)));
    });

    setSearchResults([
      ...pFiltered.map((x) => ({ type: 'product', id: x.id, data: x })),
      ...matchedCombos.map((c) => ({ type: 'set', id: c.id, data: c })),
    ]);
  }, [search, products, combos]);

  const addItem = (item) => {
    if (!selected.find((s) => s.type === item.type && s.id === item.id)) {
      setSelected((prev) => [...prev, { ...item, qty: '' }]);
    }
  };
  const handleAdd = (item) => {
    addItem(item);
    setSearch('');
    setSearchResults([]);
  };
  const removeItem = (item) => setSelected((prev) => prev.filter((s) => !(s.type === item.type && s.id === item.id)));
  const setQty = (item, qty) => {
    const normalized = qty === '' ? '' : Math.max(1, Number(qty) || 1);
    setSelected((prev) => prev.map((s) => (
      s.type === item.type && s.id === item.id ? { ...s, qty: normalized } : s
    )));
  };

  const getComboComponents = (comboId) => comboItems.filter((c) => c.combo_id === comboId);
  const getProductComboComponents = (product) => {
    if (!product) return [];
    const bySku = (product.sku && combos.find((c) => (c.sku || '').toString() === (product.sku || '').toString())) || null;
    const byName = (!bySku && product.name && combos.find((c) => (c.combo_name || '').toLowerCase() === (product.name || '').toLowerCase())) || null;
    const matched = bySku || byName;
    return matched ? getComboComponents(matched.id) : [];
  };

  const formatCurrency = (v) => (v === null || v === undefined || v === '' ? '' : `K ${Number(v).toLocaleString()}`);

  // Expand selection by qty
  const expanded = useMemo(() => selected.flatMap((s) => Array(s.qty || 1).fill(s)), [selected]);

  // Refs to label nodes for PDF
  const hiddenRenderRef = useRef(null);

  const selectedLocationName = useMemo(() => {
    const loc = (locations || []).find((row) => String(row.id) === String(labelLocationId));
    return loc?.name || '';
  }, [locations, labelLocationId]);

  const waitForLayoutOnly = () => waitForLayout();

  const generatePdf = async () => {
    if (!assetsReady) {
      alert('Logos are still loading. Please try again in a moment.');
      return;
    }
    if (isGenerating) return;
    setIsGenerating(true);
    const container = hiddenRenderRef.current;
    if (!container) { setIsGenerating(false); return; }
    await waitForLayoutOnly();
    const labelNodes = Array.from(container.querySelectorAll('.a4-pair'));
    if (labelNodes.length === 0) { setIsGenerating(false); return; }

    const pageWidthMm = 210;
    const pageHeightMm = 297;

    let doc;
    try {
      doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      doc.setProperties({ title: 'Price Printing' });

      let first = true;
      for (const node of labelNodes) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 30));
        // eslint-disable-next-line no-await-in-loop
        await waitForLayoutOnly();
        // eslint-disable-next-line no-await-in-loop
        const canvas = await renderLabelNodeToCanvas(node);
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (!first) doc.addPage();
        first = false;
        doc.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');
      }

      // Build a Blob of the PDF
      const pdfBlob = doc.output('blob');
      const filename = `${buildPriceLabelFilename(selectedLocationName)}.pdf`;
      const path = `mobile/${filename}`;

      // Upload via serverless endpoint (service role) for private bucket support
      let url = '';
      let pdfBase64 = '';
      try {
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const toBase64 = (buf) => {
          let binary = '';
          const bytes = new Uint8Array(buf);
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          return btoa(binary);
        };
        pdfBase64 = toBase64(arrayBuffer);
        const apiBase = (process.env.REACT_APP_API_BASE || '').trim().replace(/\/?$/, '');
        const host = (() => {
          try { return window?.location?.hostname || ''; } catch { return ''; }
        })();
        const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(host);
        const apiUrl = (!isLocalHost && apiBase) ? `${apiBase}/api/labels` : '/api/labels';
        const bypass = (process.env.REACT_APP_VERCEL_BYPASS || '').trim();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
          },
          body: JSON.stringify({ fileName: filename, folder: 'mobile', pdfBase64 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok) {
          const json = await resp.json();
          url = json?.signedUrl || json?.publicUrl || '';
        } else {
          let detail = '';
          try { detail = await resp.text(); } catch {}
          console.warn('Label upload service error', resp.status, detail);
          if (resp.status >= 400) {
            throw new Error(detail || `Label upload service error (${resp.status})`);
          }
        }
      } catch (serviceErr) {
        console.warn('Label upload service failed', serviceErr);
      }

      if (!url) {
        // Fallback to direct client upload when service endpoint unavailable (e.g., local dev)
        const { error: upErr } = await db.storage
          .from('labels')
          .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf', cacheControl: '3600' });
        if (upErr) throw upErr;

        const { data: signed, error: signErr } = await db.storage
          .from('labels')
          .createSignedUrl(path, 60 * 60, { download: filename });
        if (signErr) {
          url = db.storage.from('labels').getPublicUrl(path)?.data?.publicUrl || '';
          if (!url) throw signErr;
        } else {
          url = signed.signedUrl;
        }
      }

      // Post the PDF to the WhatsApp group (Wasender via /api/whatsapp-labels)
      const sendResult = await sendLabelsWhatsApp({
        pdfUrl: url,
        pdfBase64,
        pdfFilename: filename,
        message: `Price labels — ${expanded.length} label${expanded.length === 1 ? '' : 's'}`,
      });

      if (sendResult.ok) {
        alert('Sent to the Price Labels WhatsApp group.');
        setIsGenerating(false);
        return;
      }

      console.warn('WhatsApp group send failed, falling back to download', sendResult.error);
      alert(`WhatsApp send failed (${sendResult.error || 'unknown error'}). Downloading the PDF instead.`);

      const launchDownload = () => {
        const ua = (navigator && navigator.userAgent ? navigator.userAgent : '').toLowerCase();
        const isAndroidWebView = ua.includes('android');

        if (isAndroidWebView) {
          try {
            window.location.href = url;
            return;
          } catch (_) {
            // fall through to desktop-style handling
          }
        }

        const popup = window.open(url, '_blank');
        if (popup) return;

        try {
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.target = '_blank';
          anchor.rel = 'noopener';
          anchor.download = filename;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        } catch (_) {
          if (doc) doc.save(filename);
        }
      };

      launchDownload();
    } catch (err) {
      console.error('PDF upload/download error:', err);
      // Last-resort fallback to local download
      try { if (doc) doc.save('Price_Printing.pdf'); } catch (_) {}
    } finally {
      setIsGenerating(false);
    }
  };

  // Exact desktop label card (uses PriceLabels.css classes)
  const LabelCardA4 = ({ item }) => {
    // Render a blank card when there's no item so the second half stays visible (cut line included)
    if (!item) return <div className="label-card" />;
    const isProduct = item.type === 'product';
    const data = item.data;
    const components = item.type === 'set' ? getComboComponents(item.id) : getProductComboComponents(data);
    const oldPrice = isProduct ? data.price : data.standard_price || data.combo_price;
    const promoPrice = data.promotional_price;
    const hasPromo = promoPrice || promoPrice === 0;

    return (
      <div className="label-card">
        <div className="label-watermark"><img src={logoSrc} alt="wm" crossOrigin="anonymous" onError={brandLogoOnError} /></div>
        <div className="label-header">
          <img src={logoSrc} className="header-logo" alt="logo" crossOrigin="anonymous" onError={brandLogoOnError} />
          <div className="header-company">{company.name || 'Best Rest Furniture'}</div>
          <img src={logoSrc} className="header-logo" alt="logo" crossOrigin="anonymous" onError={brandLogoOnError} />
        </div>

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

        <div className="label-stamp"><img src={stampSrc} alt="stamp" crossOrigin="anonymous" /></div>

        <div className="label-bl">
          <div className="label-qr"><QRCodeSVG value={(isProduct ? data.sku : data.sku) || ''} /></div>
          <div className="label-sku"><span className="sku-label">Code:</span> {isProduct ? data.sku : data.sku}</div>
        </div>

        <div className="label-br">
          {hasPromo ? (
            <div className="price-old price-old-labeled">
              <span className="price-old-label">Old Price:</span>{' '}
              <span className="price-old-amount diagonal">{formatCurrency(oldPrice)}</span>
            </div>
          ) : null}

          {hasPromo ? (
            <div className="price-now promo"><span className="price-now-label">PROMO PRICE:</span> {formatCurrency(promoPrice)}!</div>
          ) : (
            <div className="price-now"><span className="price-now-label">Price:</span> {formatCurrency(oldPrice)}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="plm-page">
      {/* Search and results at top */}
      <header className="plm-topbar">
        <select
          className="plm-search"
          value={labelLocationId}
          onChange={(e) => setLabelLocationId(e.target.value)}
          aria-label="Label pricing location"
        >
          <option value="">Select location</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
        <input className="plm-search" placeholder="Search products or sets..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && (
          <div className="plm-results">
            {searchResults.length === 0 && <div className="plm-empty">No results</div>}
            {searchResults.map((r) => (
              <button className="plm-result" key={r.type + '-' + r.id} onClick={() => handleAdd(r)}>
                <div className="plm-result-name">{r.type === 'product' ? r.data.name : r.data.combo_name}</div>
                <div className="plm-result-type">{r.type}</div>
                <div className="plm-result-add">Add</div>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Selected items table */}
      <section className="plm-selected">
        <h3>Labels</h3>
        {selected.length === 0 ? (
          <div className="plm-empty">No items selected.</div>
        ) : (
          <div className="plm-table-wrap">
            <table className="plm-table">
              <thead>
                <tr><th>Name</th><th>Type</th><th>Qty</th><th>Action</th></tr>
              </thead>
              <tbody>
                {selected.map((s) => (
                  <tr key={s.type + '-' + s.id}>
                    <td className="plm-td-name">{s.type === 'product' ? s.data.name : s.data.combo_name}</td>
                    <td className="plm-td-type">{s.type}</td>
                    <td className="plm-td-qty"><input type="number" min={1} placeholder="Qty" value={s.qty === '' ? '' : s.qty} onChange={(e) => setQty(s, e.target.value)} className="plm-qty" /></td>
                    <td className="plm-td-action"><button className="plm-remove" onClick={() => removeItem(s)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Hidden offscreen render for PDF capture */}
      <section className="labels-a4 plm-hidden-render" ref={hiddenRenderRef} aria-hidden>
        {(() => {
          const pairs = [];
          for (let i = 0; i < expanded.length; i += 2) pairs.push(expanded.slice(i, i + 2));
          return pairs.map((pair, idx) => (
            <div className="a4-pair" key={idx}>
              <div className="a4-label"><LabelCardA4 item={pair[0]} /></div>
              <div className="a4-label"><LabelCardA4 item={pair[1] || null} /></div>
            </div>
          ));
        })()}
      </section>

      <footer className="plm-actions">
        <button disabled={expanded.length === 0 || isGenerating || !assetsReady} className="plm-btn primary" onClick={generatePdf} aria-busy={isGenerating}>
          {isGenerating ? 'Saving…' : assetsReady ? 'Send On WhatsApp' : 'Loading logos…'}
        </button>
      </footer>
    </div>
  );
}
