/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "./supabase";
import BackToDashboard from './BackToDashboard';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import { syncProductLocations } from './services/productLocations';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { logUserActivity } from './utils/userActivityLog';
import {
  buildProductLocationPriceMap,
  resolveProductLocationPricing,
} from './utils/locationPricing';
import {
  fetchProductLocationPriceRow,
  seedProductLocationPricesForLocations,
} from './services/locationPricing';

const initialForm = {
  name: "",
  sku: "",
  sku_type: "auto",
  cost_price: "",
  price: "",
  promotional_price: "",
  promo_start_date: "",
  promo_end_date: "",
  currency: "",
  category_id: "",
  unit_of_measure_id: "",
  locations: [],
  image: null,
};

function Products() {
  const canManageCatalogPage = useMemo(() => canManageCatalog(getCurrentUser()), []);
  const formatPrice = (value, currency) => {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const formatted = num % 1 === 0
      ? num.toLocaleString()
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currency || 'K'} ${formatted}`;
  };
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [pricingLocationId, setPricingLocationId] = useState('');
  const [globalPriceBaseline, setGlobalPriceBaseline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const returnTo = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('return');
      if (fromQuery) return fromQuery;
      return sessionStorage.getItem('outletTransfer:returnTo') || '';
    } catch {
      return '';
    }
  }, []);
  // Realtime: refresh products, categories, units, inventory and product relations
  const rtTickCatalog = useRealtimeRefresh(['products','product_images','product_locations','product_location_prices','categories','unit_of_measure','inventory']);
  // Currency options limited to supported storefront codes
  const currencyOptions = useMemo(() => ([
    { code: 'K', name: 'K' },
    { code: 'USD', name: '$' },
  ]), []);

  const applyPricingLocationToForm = async (product, locationId) => {
    if (!product?.id || !locationId) return;
    try {
      const row = await fetchProductLocationPriceRow(supabase, product.id, locationId);
      const priceMap = buildProductLocationPriceMap(row ? [row] : []);
      const resolved = resolveProductLocationPricing(product, locationId, priceMap);
      setForm((prev) => ({
        ...prev,
        price: resolved.price ?? '',
        promotional_price: resolved.promotional_price ?? '',
        promo_start_date: resolved.promo_start_date || '',
        promo_end_date: resolved.promo_end_date || '',
      }));
    } catch (err) {
      console.warn('Failed to load location prices', err);
    }
  };

  useEffect(() => {
    if (!pricingLocationId || !editingId) return;
    const product = products.find((row) => String(row.id) === String(editingId));
    if (!product) return;
    applyPricingLocationToForm(product, pricingLocationId);
  }, [pricingLocationId, editingId, products]);

  useEffect(() => {
    if (!form.locations?.length) return;
    if (pricingLocationId && form.locations.some((id) => String(id) === String(pricingLocationId))) return;
    setPricingLocationId(String(form.locations[0]));
  }, [form.locations, pricingLocationId]);

  useEffect(() => {
    const loadAllAndEdit = async () => {
      await fetchAll();
      await fetchUnits();
      await fetchInventory();

      // Check for ?edit=ID in URL and load product for editing
      const params = new URLSearchParams(window.location.search);
      const editId = params.get('edit');
      if (editId) {
        // Wait for products to load, then set editingId and form
        let product = products.find(p => String(p.id) === String(editId));
        if (!product) {
          // Fetch single product if not loaded
          const { data, error } = await supabase
            .from('products')
            .select(`id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at, product_locations(id, location_id), product_images(image_url)`)
            .eq('id', editId)
            .single();
          if (error) console.warn('Edit product fetch error:', error);
          product = data;
        }
        if (product) {
          const resolvedLocations = await resolveProductLocations(product);
          setForm({
            name: product.name || "",
            sku: product.sku || "",
            sku_type: product.sku_type ? "auto" : "manual",
            cost_price: product.cost_price || "",
            price: product.price || "",
            promotional_price: product.promotional_price || "",
            promo_start_date: product.promo_start_date || "",
            promo_end_date: product.promo_end_date || "",
            currency: product.currency || "",
            category_id: product.category_id ? String(product.category_id) : "",
            unit_of_measure_id: product.unit_of_measure_id !== undefined && product.unit_of_measure_id !== null ? String(product.unit_of_measure_id) : "",
            locations: resolvedLocations,
            image: null,
          });
          setEditingId(product.id);
          const nextPricingLocationId = resolvedLocations[0] ? String(resolvedLocations[0]) : (locations[0]?.id ? String(locations[0].id) : '');
          setPricingLocationId(nextPricingLocationId);
          setGlobalPriceBaseline({
            price: Number(product.price || 0),
            promotional_price: Number(product.promotional_price || 0),
            cost_price: Number(product.cost_price || 0),
          });
          if (nextPricingLocationId) {
            await applyPricingLocationToForm(product, nextPricingLocationId);
          }
        }
      }
    };
    loadAllAndEdit();
  }, [rtTickCatalog]);

  const fetchInventory = async () => {
    const { data, error } = await supabase.from('inventory').select('product_id, quantity');
    if (!error) {
      console.log('Fetched inventory:', data);
      setInventory(data || []);
    }
  };

  const fetchUnits = async () => {
    const { data, error } = await supabase.from('unit_of_measure').select('*').order('created_at', { ascending: false });
    if (!error) setUnits(data || []);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Fetch products with product_locations and product_images
      const [
        { data: products, error: productsError },
        { data: categories, error: categoriesError },
        { data: locations, error: locationsError }
      ] = await Promise.all([
        supabase
          .from("products")
          .select(`id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at, product_locations(id, location_id), product_images(image_url)`)
          .order("created_at", { ascending: false }),
        supabase.from("categories").select("id, name"),
        supabase.from("locations").select("id, name"),
      ]);
      if (productsError) console.warn('Products fetch error:', productsError);
      if (categoriesError) console.warn('Categories fetch error:', categoriesError);
      if (locationsError) console.warn('Locations fetch error:', locationsError);
      setProducts(products || []);
      const sortedCategories = (categories || []).slice().sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      );
      setCategories(sortedCategories);
      setLocations(locations || []);
    } catch (err) {
      setError("Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    if (name === "locations") {
      // Multi-select
      const options = Array.from(e.target.selectedOptions, (opt) => opt.value);
      setForm((f) => ({ ...f, locations: options }));
    } else if (type === "file") {
      setForm((f) => ({ ...f, image: files[0] }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  };

  const handleEdit = async (product) => {
    if (!canManageCatalogPage) return;
    const resolvedLocations = await resolveProductLocations(product);
    setForm({
      name: product.name || "",
      sku: product.sku || "",
      sku_type: product.sku_type ? "auto" : "manual", // map boolean to string
      cost_price: product.cost_price || "",
      price: product.price || "",
      promotional_price: product.promotional_price || "",
      promo_start_date: product.promo_start_date || "",
      promo_end_date: product.promo_end_date || "",
      currency: product.currency || "",
      category_id: product.category_id || "",
      unit_of_measure_id: product.unit_of_measure_id || "",
      locations: resolvedLocations,
      image: null,
    });
    setEditingId(product.id);
    const nextPricingLocationId = resolvedLocations[0] ? String(resolvedLocations[0]) : (locations[0]?.id ? String(locations[0].id) : '');
    setPricingLocationId(nextPricingLocationId);
    setGlobalPriceBaseline({
      price: Number(product.price || 0),
      promotional_price: Number(product.promotional_price || 0),
      cost_price: Number(product.cost_price || 0),
    });
    if (nextPricingLocationId) {
      await applyPricingLocationToForm(product, nextPricingLocationId);
    }
  };

  const handleCancelEdit = () => {
    if (!canManageCatalogPage) return;
    setForm(initialForm);
    setGlobalPriceBaseline(null);
    setPricingLocationId('');
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!canManageCatalogPage) return;
    if (!window.confirm("Delete this product?")) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      fetchAll();
    } catch (err) {
      setError("Failed to delete product.");
    } finally {
      setSaving(false);
    }
  };

  const isDuplicateSkuError = (err) => {
    const code = String(err?.code || '').toLowerCase();
    const status = String(err?.status || '').toLowerCase();
    const msg = String(err?.message || '').toLowerCase();
    const details = String(err?.details || '').toLowerCase();
    return code === '23505'
      || code === 'pgrst409'
      || status === '409'
      || msg.includes('products_sku_key')
      || msg.includes('duplicate key')
      || details.includes('products_sku_key');
  };

  const getNextAutoSku = async () => {
    const { data: allSkus, error } = await supabase.from('products').select('sku');
    if (error || !Array.isArray(allSkus)) {
      throw error || new Error('Failed to load existing SKUs.');
    }
    const used = new Set();
    (allSkus || []).forEach(row => {
      const raw = (row?.sku || '').toString().trim();
      const m = raw.match(/^#?(\d+)$/);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num)) used.add(num);
      }
    });
    let i = 1;
    while (used.has(i)) i++;
    const padded = String(i).padStart(5, '0');
    return `#${padded}`;
  };

  const getApiBase = () => {
    const base = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
    if (!base) return '';
    return base.replace(/\/+$/, '');
  };

  const shouldUseApi = () => {
    const apiBase = getApiBase();
    if (apiBase) return true;
    return process.env.NODE_ENV === 'production';
  };

  const fetchProductLocationsForProduct = async (productId) => {
    const apiBase = getApiBase();
    const url = apiBase ? `${apiBase}/api/product-locations` : '/api/product-locations';
    const response = await fetch(`${url}?product_id=${encodeURIComponent(productId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || 'Failed to load product locations.');
    }
    return Array.isArray(data?.rows) ? data.rows : [];
  };

  const fetchProductLocationsDirect = async (productId) => {
    const { data, error } = await supabase
      .from('product_locations')
      .select('location_id')
      .eq('product_id', productId);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  };

  const resolveProductLocations = async (product) => {
    const direct = product?.product_locations
      ? product.product_locations.map((pl) => pl.location_id).filter(Boolean)
      : [];
    if (direct.length > 0) return direct;
    try {
      const rows = await fetchProductLocationsForProduct(product.id);
      console.warn('Product locations via api:', product.id, rows.length);
      return rows.map((row) => row.location_id).filter(Boolean);
    } catch {
      try {
        const rows = await fetchProductLocationsDirect(product.id);
        console.warn('Product locations direct:', product.id, rows.length);
        return rows.map((row) => row.location_id).filter(Boolean);
      } catch {
        return direct;
      }
    }
  };

  const postProductLocationsReplace = async (productId, locationIds) => {
    const apiBase = getApiBase();
    const url = apiBase ? `${apiBase}/api/product-locations` : '/api/product-locations';
    const rows = (locationIds || []).map(locId => ({ product_id: productId, location_id: locId }));
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, replaceProductId: productId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || 'Failed to save product locations.');
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManageCatalogPage) return;
    if (!form.name.trim() && !form.sku.trim()) {
      setError('Please enter at least one field (name or SKU).');
      return;
    }
    const wasEditing = Boolean(editingId);
    setSaving(true);
    setError("");
    try {
      let productId = editingId;
      // Generate smallest-missing-integer SKU in format #00001 if needed
      let skuToUse = form.sku;
      const resolvedSkuIsAuto = form.sku_type === "auto" || !form.sku.trim();
      if ((form.sku_type === "auto" && !form.sku.trim()) || !form.sku.trim()) {
        skuToUse = await getNextAutoSku();
      }

      // Prepare product data
      const baseProductData = {
        name: form.name,
        sku_type: resolvedSkuIsAuto,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : 0,
        price: form.price ? parseFloat(form.price) : 0,
        promotional_price: form.promotional_price ? parseFloat(form.promotional_price) : null,
        promo_start_date: form.promo_start_date || null,
        promo_end_date: form.promo_end_date || null,
        currency: form.currency,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        unit_of_measure_id: form.unit_of_measure_id ? parseInt(form.unit_of_measure_id) : null
      };

      // Insert product and get the ID
      let insertedProductId = productId;
      if (!editingId) {
        let inserted = null;
        let attempt = 0;
        let skuCandidate = skuToUse;
        let lastError = null;
        while (attempt < 5 && !inserted) {
          const { data: insertedRow, error: insertError } = await supabase
            .from('products')
            .insert([{ ...baseProductData, sku: skuCandidate }])
            .select('id')
            .single();
          if (!insertError) {
            inserted = insertedRow;
            break;
          }
          lastError = insertError;
          if (isDuplicateSkuError(insertError)) {
            if (baseProductData.sku_type) {
              skuCandidate = await getNextAutoSku();
              attempt += 1;
              continue;
            }
            throw new Error('SKU already exists. Please choose another.');
          }
          throw insertError;
        }
        // No fallback SKU: always use gap-filling sequence logic.
        if (!inserted) {
          if (lastError && isDuplicateSkuError(lastError)) {
            if (baseProductData.sku_type) {
              throw new Error('Unable to assign a unique SKU automatically. Please try again.');
            }
            throw new Error('SKU already exists. Please choose another.');
          }
          if (lastError) throw lastError;
          throw new Error('Unable to assign a unique SKU automatically. Please try again.');
        }
        insertedProductId = inserted.id;
      } else {
        // If editing, update the product
        const { error: updateError } = await supabase.from('products').update({ ...baseProductData, sku: skuToUse }).eq('id', editingId);
        if (updateError) {
          if (isDuplicateSkuError(updateError)) {
            throw new Error('SKU already exists. Please choose another.');
          }
          throw updateError;
        }
      }

      // Handle product_locations for selected locations
      if (form.locations) {
        if (shouldUseApi()) {
          await postProductLocationsReplace(insertedProductId, form.locations);
        } else {
          const prodLocRows = form.locations.map(locId => ({ product_id: insertedProductId, location_id: locId }));
          await syncProductLocations({ rows: prodLocRows, replaceProductId: editingId ? insertedProductId : null }, supabase);
        }
      }

      const locationIdsForPricing = (() => {
        if (editingId && pricingLocationId) return [pricingLocationId];
        if (form.locations?.length) return form.locations;
        if (pricingLocationId) return [pricingLocationId];
        return [];
      })();
      if (locationIdsForPricing.length) {
        try {
          await seedProductLocationPricesForLocations(supabase, {
            productId: insertedProductId,
            locationIds: locationIdsForPricing,
            price: baseProductData.price,
            promotionalPrice: baseProductData.promotional_price,
            promoStartDate: baseProductData.promo_start_date,
            promoEndDate: baseProductData.promo_end_date,
          });
        } catch (locationPriceErr) {
          console.warn('Failed to save location prices', locationPriceErr);
        }
      }

      // Handle image upload if a file is selected
      if (form.image) {
        const file = form.image;
        const fileExt = file.name.split('.').pop();
        // Sanitize product name for filename
        const safeName = (form.name || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${safeName}_${insertedProductId}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        // Upload to bucket 'productimages'
        const { error: uploadError } = await supabase.storage.from('productimages').upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        // Get public URL
        const { data: publicUrlData } = supabase.storage.from('productimages').getPublicUrl(filePath);
        const publicUrl = publicUrlData?.publicUrl;
        if (!publicUrl) throw new Error('Failed to get public URL for image.');

        // Insert into product_images table
        const { error: imageInsertError } = await supabase.from('product_images').insert([
          { product_id: insertedProductId, image_url: publicUrl }
        ]);
        if (imageInsertError) throw imageInsertError;

        // Update image_url in products table
        const { error: prodImgUpdateError } = await supabase.from('products').update({ image_url: publicUrl }).eq('id', insertedProductId);
        if (prodImgUpdateError) throw prodImgUpdateError;
      }

      if (!wasEditing) {
        fetchAll();
      }
      const priceChanged = wasEditing && globalPriceBaseline && (
        Number(form.price || 0) !== globalPriceBaseline.price
        || Number(form.promotional_price || 0) !== globalPriceBaseline.promotional_price
        || Number(form.cost_price || 0) !== globalPriceBaseline.cost_price
      );
      const pricingLocationName = locations.find((row) => String(row.id) === String(pricingLocationId))?.name || 'location';
      logUserActivity({
        actionType: wasEditing ? (priceChanged ? 'product_price_change' : 'product_edit') : 'product_create',
        actionLabel: wasEditing ? (priceChanged ? 'Product Price Changed' : 'Product Updated') : 'Product Created',
        details: `${form.name || 'Product'} • SKU ${skuToUse} • ${pricingLocationName} price ${form.price || 0}${form.promotional_price ? ` • Promo ${form.promotional_price}` : ''}`,
        reference: skuToUse,
        entityType: 'product',
        entityId: String(insertedProductId),
      });
      handleCancelEdit();
      // Remove ?edit=PRODUCT_ID from URL before redirect/reload
      if (typeof window !== 'undefined' && window.location.search.includes('edit=')) {
        const url = new URL(window.location.href);
        url.searchParams.delete('edit');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
      if (returnTo) {
        try {
          sessionStorage.removeItem('outletTransfer:returnTo');
          sessionStorage.removeItem('outletTransfer:allowProducts');
        } catch {}
        navigate(returnTo);
        return;
      }
      if (wasEditing) {
        navigate('/products-list');
      } else {
        window.location.reload();
      }
    } catch (err) {
      if (isDuplicateSkuError(err)) {
        setError('SKU already exists. Please choose another.');
      } else {
        setError("Failed to save product. " + (err.message || err));
      }
      console.error('Product save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // All actions always accessible
  const canAdd = canManageCatalogPage;
  const canEdit = canManageCatalogPage;
  const canDelete = canManageCatalogPage;

  return (
    <div className="products-container" style={{ maxWidth: '100vw', minHeight: '100vh', overflowX: 'hidden', padding: 0, margin: 0 }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>Products</h1>
      </div>
      {canManageCatalogPage ? (
      <form className="product-form" onSubmit={handleSubmit}>
        <div className="form-grid name-row">
          <input name="name" className="name-field" type="text" placeholder="Product Name" value={form.name} onChange={handleChange} required />
        </div>
        <div className="form-grid">
          {/* First row: Category, Unit, Auto SKU, SKU */}
          <select name="category_id" value={form.category_id} onChange={handleChange} required>
            <option value="">Select Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <select name="unit_of_measure_id" value={form.unit_of_measure_id || ''} onChange={handleChange} required>
            <option value="">Select Unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}{unit.abbreviation ? ` (${unit.abbreviation})` : ''}</option>
            ))}
          </select>
          <select name="sku_type" value={form.sku_type} onChange={handleChange}>
            <option value="auto">Auto SKU</option>
            <option value="manual">Manual SKU</option>
          </select>
          <input name="sku" type="text" placeholder="SKU (leave blank for auto)" value={form.sku} onChange={handleChange} />
        </div>
        <div className="form-grid">
          {/* Second row: Currency, Cost Price, Standard Price, Promotional Price */}
          <select name="currency" value={form.currency} onChange={handleChange} required>
            <option value="">Select Currency</option>
            {currencyOptions.map(opt => (
              <option key={opt.code} value={opt.code}>{opt.name}</option>
            ))}
          </select>
          <select
            value={pricingLocationId}
            onChange={(e) => setPricingLocationId(e.target.value)}
            aria-label="Pricing location"
          >
            <option value="">Select pricing location</option>
            {(form.locations?.length
              ? locations.filter((loc) => form.locations.some((id) => String(id) === String(loc.id)))
              : locations
            ).map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <input name="cost_price" type="number" step="0.01" placeholder={`Cost Price (${form.currency || 'Currency'})`} value={form.cost_price} onChange={handleChange} />
          <input name="price" type="number" step="0.01" placeholder={`Standard Price (${form.currency || 'Currency'})`} value={form.price} onChange={handleChange} disabled={!pricingLocationId} />
          <input name="promotional_price" type="number" step="0.01" placeholder={`Promotional Price (${form.currency || 'Currency'})`} value={form.promotional_price} onChange={handleChange} disabled={!pricingLocationId} />
        </div>
        {pricingLocationId ? (
          <div style={{ color: '#9fb3c8', fontSize: '0.92rem', margin: '0 0 8px' }}>
            Standard and promotional prices apply to {locations.find((loc) => String(loc.id) === String(pricingLocationId))?.name || 'the selected location'}.
            {editingId ? '' : ' On create, the same prices are also saved for every checked location below.'}
          </div>
        ) : (
          <div style={{ color: '#ffb4b4', fontSize: '0.92rem', margin: '0 0 8px' }}>
            Select a pricing location to set standard and promotional prices.
          </div>
        )}
        {/* Locations */}
        <div className="product-form-locations-section">
          <div className="locations-checkbox-group">
            {locations.map((loc) => (
              <label key={loc.id}>
                <input
                  type="checkbox"
                  className="locations-checkbox-input"
                  name="locations"
                  value={loc.id}
                  checked={form.locations.includes(loc.id)}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(f => ({
                      ...f,
                      locations: checked
                        ? [...f.locations, loc.id]
                        : f.locations.filter(id => id !== loc.id)
                    }));
                  }}
                />
                <span>{loc.name}</span>
              </label>
            ))}
          </div>
        </div>
        <input
          ref={fileInputRef}
          name="image"
          type="file"
          accept="image/*"
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        <div className="product-form-actions-row">
          <button
            type="button"
            className="product-form-btn product-form-btn--file"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose File
          </button>
          {canAdd && (
            <button type="submit" className="product-form-btn product-form-btn--primary" disabled={saving}>
              {editingId ? 'Update Product' : 'Add Product'}
            </button>
          )}
          {editingId && (
            <button type="button" className="product-form-btn product-form-btn--secondary" onClick={handleCancelEdit}>
              Cancel
            </button>
          )}
          {editingId && canDelete && (
            <button type="button" className="product-form-btn product-form-btn--danger" onClick={() => handleDelete(editingId)}>
              Delete
            </button>
          )}
        </div>
      </form>
      ) : (
        <div style={{ maxWidth: 1200, margin: '0 auto 1.5rem', padding: '12px 14px', border: '1px solid #00b4d8', borderRadius: 10, background: '#101722', color: '#cdefff' }}>
          Product create, edit, and delete controls are disabled for this user. New products should be added from Kitwe or Lusaka stocktake during opening stock.
        </div>
      )}
      {error && <div className="products-error">{error}</div>}
      <div style={{marginTop: '2.5rem'}}>
        <h2 style={{margin:'0 0 10px', color:'#e0e6ed'}}>Search All Products</h2>
        <input
          value={globalSearch}
          onChange={(e)=>setGlobalSearch(e.target.value)}
          placeholder="Search by name or SKU across all locations"
          style={{width:'100%', maxWidth: 560, padding:'10px 12px', borderRadius:8, border:'1px solid #00b4d8', background:'#1a1f27', color:'#e0e6ed'}}
        />
        {globalSearch.trim() && (
          <div style={{marginTop:12, overflowX:'auto'}}>
            <table style={{minWidth: 800, width:'100%', borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'#23272f'}}>
                  <th style={{padding:'10px 8px', borderBottom:'1px solid #00b4d8', textAlign:'left'}}>Name</th>
                  <th style={{padding:'10px 8px', borderBottom:'1px solid #00b4d8'}}>SKU</th>
                  <th style={{padding:'10px 8px', borderBottom:'1px solid #00b4d8'}}>Standard Price</th>
                  <th style={{padding:'10px 8px', borderBottom:'1px solid #00b4d8'}}>Promo Price</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .filter(p => {
                    const q = globalSearch.trim().toLowerCase();
                    return (
                      (p.name||'').toLowerCase().includes(q) ||
                      (p.sku||'').toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 100)
                  .map(p => {
                    const currency = p.currency || 'K';
                    return (
                      <tr key={p.id} style={{background:'#1a1f27'}}>
                        <td style={{padding:'8px 8px', borderBottom:'1px solid #123', textAlign:'left'}}>{p.name}</td>
                        <td style={{padding:'8px 8px', borderBottom:'1px solid #123', textAlign:'center'}}>{p.sku||'-'}</td>
                        <td style={{padding:'8px 8px', borderBottom:'1px solid #123', textAlign:'center'}}>{formatPrice(p.price, currency)}</td>
                        <td style={{padding:'8px 8px', borderBottom:'1px solid #123', textAlign:'center'}}>{formatPrice(p.promotional_price, currency)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <div style={{color:'#9fb3c8', fontSize:12, marginTop:6}}>Showing up to 100 matches.</div>
          </div>
        )}
      </div>
      <div style={{marginTop: '2rem', color: '#e0e6ed', fontSize: '1.1rem'}}>
        <b>To view all products, search, and filter by location, go to the <span style={{color:'#00b4d8'}}>Products List</span> page.</b>
      </div>
    </div>
  );
}

export default Products;
