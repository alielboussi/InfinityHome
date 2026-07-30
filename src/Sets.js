/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import React, { useState, useEffect } from "react";
import supabase from "./supabase";
import BackToDashboard from './BackToDashboard';
import { FaTrash } from "react-icons/fa";
import useComboColumnSupport from "./hooks/useComboColumnSupport";
import { insertComboItems } from "./services/comboItems";
import { replaceComboLocations } from "./services/comboLocations";
import { cacheGet, cacheSet } from './utils/staleCache';
import { canManageCatalog, getCurrentUser } from './accessControl';
import { logUserActivity } from './utils/userActivityLog';
import { seedComboLocationPricesForLocations } from './services/locationPricing';
// Removed user permissions imports

const SETS_BOOTSTRAP_CACHE_KEY = 'sets:bootstrap:v1';
const SETS_BOOTSTRAP_CACHE_TTL_MS = 10 * 60 * 1000;
const SETS_INVENTORY_CACHE_KEY = 'sets:inventory:v1';
const SETS_INVENTORY_CACHE_TTL_MS = 2 * 60 * 1000;

export default function Sets() {
  const canManageCatalogPage = canManageCatalog(getCurrentUser());
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [kitName, setKitName] = useState("");
  const [sku, setSku] = useState("");
  const [skuMode, setSkuMode] = useState("auto"); // 'auto' | 'manual'
  const [standardPrice, setStandardPrice] = useState("");
  const [promotionalPrice, setPromotionalPrice] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [kitItems, setKitItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]); // array of location ids
  const [inventory, setInventory] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [currency, setCurrency] = useState("K");
  const [skuExists, setSkuExists] = useState(false);
  const [skuChecking, setSkuChecking] = useState(false);
  const [comboSkus, setComboSkus] = useState([]);
  const comboColumnSupport = useComboColumnSupport();
  const supportsCategoryField = comboColumnSupport.category;
  const supportsUnitField = comboColumnSupport.unit;

  useEffect(() => {
    try {
      const cached = cacheGet(SETS_BOOTSTRAP_CACHE_KEY);
      if (cached && typeof cached === 'object') {
        setProducts(cached.products || []);
        setLocations(cached.locations || []);
        setUnits(cached.units || []);
        setCategories(cached.categories || []);
        setComboSkus(cached.comboSkus || []);
      }
    } catch {}

    Promise.allSettled([
      supabase.from("products").select("id, name, sku, unit_of_measure_id"),
      supabase.from("locations").select("id, name"),
      supabase.from("unit_of_measure").select("id, name"),
      supabase.from("categories").select("id, name"),
      supabase.from('combos').select('sku'),
    ]).then(([productsRes, locationsRes, unitsRes, categoriesRes, combosRes]) => {
      const productsResult = productsRes.status === 'fulfilled' ? productsRes.value : { data: [], error: productsRes.reason };
      const locationsResult = locationsRes.status === 'fulfilled' ? locationsRes.value : { data: [], error: locationsRes.reason };
      const unitsResult = unitsRes.status === 'fulfilled' ? unitsRes.value : { data: [], error: unitsRes.reason };
      const categoriesResult = categoriesRes.status === 'fulfilled' ? categoriesRes.value : { data: [], error: categoriesRes.reason };
      const combosResult = combosRes.status === 'fulfilled' ? combosRes.value : { data: [], error: combosRes.reason };

      if (productsResult.error) {
        console.error("Error fetching products:", productsResult.error);
      } else {
        console.log("Fetched products:", productsResult.data);
      }
      const nextProducts = productsResult.data || [];
      const nextLocations = locationsResult.data || [];
      const nextUnits = unitsResult.data || [];
      const nextCategories = categoriesResult.data || [];
      const nextComboSkus = (combosResult.data || []).map(row => row.sku).filter(Boolean);
      setProducts(nextProducts);
      setLocations(nextLocations);
      setUnits(nextUnits);
      setCategories(nextCategories);
      setComboSkus(nextComboSkus);
      try {
        cacheSet(SETS_BOOTSTRAP_CACHE_KEY, {
          products: nextProducts,
          locations: nextLocations,
          units: nextUnits,
          categories: nextCategories,
          comboSkus: nextComboSkus,
        }, SETS_BOOTSTRAP_CACHE_TTL_MS);
      } catch {}
    });
  }, []);

  // Fetch inventory for selected location
  useEffect(() => {
    if (selectedLocations && selectedLocations.length > 0) {
      const cacheKey = `${SETS_INVENTORY_CACHE_KEY}:${[...selectedLocations].sort().join(',')}`;
      try {
        const cachedInventory = cacheGet(cacheKey);
        if (Array.isArray(cachedInventory)) setInventory(cachedInventory);
      } catch {}
      supabase
        .from("inventory")
        .select("product_id, quantity, location")
        .in("location", selectedLocations)
        .then(({ data }) => {
          const nextInventory = data || [];
          setInventory(nextInventory);
          try { cacheSet(cacheKey, nextInventory, SETS_INVENTORY_CACHE_TTL_MS); } catch {}
        });
    } else {
      setInventory([]);
    }
  }, [selectedLocations]);

  // Removed permissions fetching logic

  // Removed permission helpers
  const canAdd = canManageCatalogPage;
  const canEdit = canManageCatalogPage;
  const canDelete = canManageCatalogPage;

  // SKU helpers
  const padSku = (n) => `#${String(n).padStart(5, '0')}`;
  const numberFromSku = (s) => {
    if (!s) return null;
    const str = String(s).trim();
    const m = str.match(/^#?(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  };
  const computeNextSku = async () => {
    // Gather used numeric SKUs from combos and products to keep sequence unique across both
    let comboSkuRows = Array.isArray(comboSkus) && comboSkus.length ? comboSkus.map((value) => ({ sku: value })) : null;
    let productSkuRows = Array.isArray(products) && products.length ? products.map((product) => ({ sku: product.sku })) : null;
    if (!comboSkuRows || !productSkuRows) {
      const [combosRes, productsRes] = await Promise.all([
        supabase.from('combos').select('sku'),
        supabase.from('products').select('sku')
      ]);
      comboSkuRows = combosRes.data || comboSkuRows || [];
      productSkuRows = productsRes.data || productSkuRows || [];
      if (Array.isArray(combosRes.data)) {
        setComboSkus((combosRes.data || []).map(row => row.sku).filter(Boolean));
      }
    }
    const used = new Set();
    (comboSkuRows || []).forEach(row => { const n = numberFromSku(row.sku); if (n !== null) used.add(n); });
    (productSkuRows || []).forEach(row => { const n = numberFromSku(row.sku); if (n !== null) used.add(n); });
    let i = 1;
    while (used.has(i)) i += 1;
    const next = padSku(i);
    setSku(next);
    return next;
  };

  useEffect(() => {
    if (skuMode === 'auto') {
      computeNextSku();
    }
  }, [skuMode, comboSkus.length, products.length]);

  // Live duplicate SKU check in manual mode
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (skuMode !== 'manual' || !sku || !sku.trim()) {
        if (active) setSkuExists(false);
        return;
      }
      setSkuChecking(true);
      const [cRes, pRes] = await Promise.all([
        supabase.from('combos').select('id').eq('sku', sku).limit(1),
        supabase.from('products').select('id').eq('sku', sku).limit(1),
      ]);
      if (!active) return;
      setSkuChecking(false);
      const cDup = Array.isArray(cRes.data) && cRes.data.length > 0;
      const pDup = Array.isArray(pRes.data) && pRes.data.length > 0;
      setSkuExists(cDup || pDup);
    };
    run();
    return () => { active = false; };
  }, [sku, skuMode]);

  // Filter products for search (by name or SKU, or show all if search is empty)
  const filteredProducts = products.filter(p => {
    if (kitItems.some(item => item.product_id === p.id)) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(s)) ||
      (p.sku && p.sku.toLowerCase().includes(s))
    );
  });

  // Build a product stock map for the selected location
  const productStock = {};
  inventory.forEach(i => {
    productStock[i.product_id] = (productStock[i.product_id] || 0) + i.quantity;
  });

  // Helper: get product unit label (abbr or name)
  const getProductUnit = (productId) => {
    const p = products.find(pr => pr.id === productId);
    if (!p) return '-';
    const u = units.find(u => u.id === p.unit_of_measure_id);
    return (u && (u.abbreviation || u.name)) || '-';
  };

  // Add product to kit (allow adding even if stock is zero, leave quantity blank until user enters)
  const addProductToKit = (product) => {
    setKitItems([...kitItems, { product_id: product.id, name: product.name, quantity: "" }]);
  };

  // Update quantity in kit, but do not allow more than available in location or less than 0
  const updateQty = (product_id, rawValue) => {
    setKitItems(kitItems.map(item => {
      if (item.product_id !== product_id) return item;
      if (rawValue === "") {
        return { ...item, quantity: "" };
      }
      let qty = Number(rawValue);
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      return { ...item, quantity: qty };
    }));
  };

  // Remove product from kit
  const removeProductFromKit = (product_id) => {
    if (!canDelete) return;
    setKitItems(kitItems.filter(item => item.product_id !== product_id));
  };

  // Save kit/set: creates entries in products, combos, combo_locations, and combo_items
  // After creation, the set will be available for inventory aggregation during Start/End Period
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canAdd) return;
    if (
      !kitName ||
      !standardPrice ||
      kitItems.length === 0 ||
      !currency ||
      !selectedLocations ||
      selectedLocations.length === 0 ||
      (supportsUnitField && !selectedUnit) ||
      (supportsCategoryField && !selectedCategory)
    ) {
      alert("Please fill all required fields, select at least one location, currency, and add at least one product.");
      return;
    }
    const invalidQuantity = kitItems.some(item => {
      const qtyNumber = Number(item.quantity);
      return !Number.isFinite(qtyNumber) || qtyNumber < 1;
    });
    if (invalidQuantity) {
      alert("Please enter a quantity of at least 1 for every kit component.");
      return;
    }
    // Ensure SKU when auto mode
    let finalSku = sku;
    if (skuMode === 'auto' || !finalSku) {
      finalSku = await computeNextSku();
    }
    // Guard: duplicate SKU check right before creating (using array result, not maybeSingle)
    const { data: skuRows } = await supabase
      .from('combos')
      .select('id')
      .eq('sku', finalSku)
      .limit(1);
    if (Array.isArray(skuRows) && skuRows.length > 0) {
      if (skuMode === 'auto') {
        // Race: recompute and retry once or twice
        let attempts = 0;
        let ok = false;
        while (attempts < 3 && !ok) {
          attempts += 1;
          finalSku = await computeNextSku();
          const { data: again } = await supabase.from('combos').select('id').eq('sku', finalSku).limit(1);
          ok = !(Array.isArray(again) && again.length > 0);
        }
        if (!ok) {
          alert('Unable to assign a unique SKU automatically. Please switch to Manual and set a unique SKU.');
          return;
        }
      } else {
        alert('SKU already exists, please choose another.');
        return;
      }
    }
    // 1. Check for existing combo by name or SKU
    const { data: existingList } = await supabase
      .from("combos")
      .select("id")
      .or(`combo_name.eq.${kitName},sku.eq.${finalSku}`)
      .limit(1);
    if (Array.isArray(existingList) && existingList.length > 0) {
      alert("A set/combo with this name or SKU already exists.");
      return;
    }

    // 2. Create only the combo (no product row)
    const basePayload = {
      combo_name: kitName,
      sku: finalSku,
      standard_price: standardPrice,
      combo_price: standardPrice,
      promotional_price: promotionalPrice === "" ? null : promotionalPrice,
      currency: currency,
    };
    if (supportsCategoryField) {
      basePayload.category_id = selectedCategory || null;
    }
    if (supportsUnitField) {
      basePayload.unit_of_measure_id = selectedUnit || null;
    }

    const attemptInsert = async (payload) => {
      return supabase.from("combos").insert([payload]).select().single();
    };

    const fetchNextComboId = async () => {
      const { data: latest, error: latestError } = await supabase
        .from('combos')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
      if (latestError) {
        console.warn('Unable to compute next combo id', latestError);
        return 1;
      }
      const raw = Array.isArray(latest) && latest.length ? latest[0].id : 0;
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) return 1;
      return numeric + 1;
    };

    let comboId;
    let comboErrorMessage = "";
    let { data: combo, error: comboError } = await attemptInsert(basePayload);
    if (comboError) {
      comboErrorMessage = comboError.message || "";
      const needsId = /null value in column\s+"id"/i.test(comboErrorMessage);
      if (needsId) {
        const fallbackId = await fetchNextComboId();
        ({ data: combo, error: comboError } = await attemptInsert({ ...basePayload, id: fallbackId }));
        if (!comboError) {
          comboId = combo?.id || fallbackId;
        }
      }
    } else {
      comboId = combo?.id;
    }

    if (!comboId || comboError) {
      const message = comboError?.message || comboErrorMessage || "Unknown error";
      alert("Error creating combo: " + message);
      return;
    }

    // 3. Upload image if provided and save public URL on combo
    if (comboId && imageFile) {
      const fileExt = (imageFile.name || '').split('.').pop();
      const safeName = (kitName || 'combo').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeName}_${comboId}_${Date.now()}.${fileExt || 'png'}`;
      const { error: uploadError } = await supabase.storage.from('productimages').upload(fileName, imageFile, { upsert: true });
      if (uploadError) {
        alert('Failed to upload image: ' + (uploadError.message || 'Unknown error'));
        return;
      }
      const { data: publicUrlData } = supabase.storage.from('productimages').getPublicUrl(fileName);
      const publicUrl = publicUrlData?.publicUrl;
      if (publicUrl) {
        await supabase.from('combos').update({ picture_url: publicUrl }).eq('id', comboId);
      }
    }

    // 4. Link combo to selected locations in combo_locations
    const locRows = (selectedLocations || []).map(lid => {
      const parsed = Number(lid);
      return {
        combo_id: Number.isFinite(Number(comboId)) ? Number(comboId) : comboId,
        location_id: Number.isNaN(parsed) ? lid : parsed,
      };
    });
    if (locRows.length > 0) {
      try {
        await replaceComboLocations(comboId, locRows);
      } catch (locError) {
        alert("Failed to save locations for this set: " + (locError.message || "Unknown error"));
        return;
      }
    }

    try {
      await seedComboLocationPricesForLocations(supabase, {
        comboId,
        locationIds: selectedLocations,
        comboPrice: standardPrice,
        promotionalPrice: promotionalPrice === "" ? null : promotionalPrice,
      });
    } catch (priceError) {
      console.warn('Failed to save set location prices', priceError);
    }

    // 5. Insert combo_items for each component product (single batch insert with fallback id support)
    try {
      await insertComboItems(
        kitItems.map(item => ({
          combo_id: comboId,
          product_id: item.product_id,
          quantity: Number(item.quantity),
        }))
      );
    } catch (itemError) {
      console.error("Error saving combo components", itemError);
      alert("Error saving combo components: " + (itemError.message || "Unknown error"));
      return;
    }

  // Note: Inventory for the set will be accounted for during Start/End Period and stocktake flows
    alert("Kit/Set created!");
    logUserActivity({
      actionType: 'set_create',
      actionLabel: 'Set Created',
      details: `${kitName} • SKU ${finalSku} • Price ${standardPrice || 0}${promotionalPrice ? ` • Promo ${promotionalPrice}` : ''} • ${kitItems.length} component${kitItems.length === 1 ? '' : 's'}`,
      reference: finalSku,
      entityType: 'combo',
      entityId: String(comboId),
    });
    setComboSkus(prev => (prev.includes(finalSku) ? prev : [...prev, finalSku]));
    setKitName(""); setStandardPrice(""); setPromotionalPrice(""); setKitItems([]); setImageFile(null);
    setCurrency("K");
  setSelectedLocations([]);
    if (skuMode === 'auto') {
      await computeNextSku();
    } else {
      setSku("");
    }
  };

  // Removed permission access check

  const shouldEnableScroll = (search.trim() !== "") || (kitItems.length > 0);
  const columnWarnings = [];
  if (!supportsUnitField) {
    columnWarnings.push(comboColumnSupport.unitReason || 'Supabase reports combos.unit_of_measure_id is missing – unit selection is disabled.');
  }
  if (!supportsCategoryField) {
    columnWarnings.push(comboColumnSupport.categoryReason || 'Supabase reports combos.category_id is missing – category selection is disabled.');
  }

  return (
    <div
      className="products-container sets-page"
      style={{
        maxWidth: '100vw',
        height: '100vh',
        overflowY: shouldEnableScroll ? 'auto' : 'hidden',
        overflowX: 'hidden',
        padding: 0,
        margin: 0
      }}
    >
      <div className="page-header-row">
        <BackToDashboard />
        <h1 className="products-title" style={{ margin: 0 }}>Create Kit / Set</h1>
      </div>
      {!canManageCatalogPage && (
        <div style={{
          background: '#101722',
          border: '1px solid #00b4d8',
          color: '#cdefff',
          padding: '12px 14px',
          borderRadius: 10,
          margin: '0 auto 12px',
          maxWidth: 1200,
          lineHeight: 1.4,
        }}>
          Set create and edit controls are disabled for this user.
        </div>
      )}
      {canManageCatalogPage && (
      <form className="product-form" onSubmit={handleSubmit}>
        {columnWarnings.length > 0 && (
          <div style={{
            background: '#2b1b1b',
            border: '1px solid #ff6b6b',
            color: '#ffb4b4',
            padding: '10px 14px',
            borderRadius: 8,
            margin: '0 auto 12px',
            maxWidth: 1200,
            lineHeight: 1.4,
          }}>
            {columnWarnings.map((msg, idx) => (
              <div key={idx}>{msg}</div>
            ))}
          </div>
        )}
        <div className="sets-form-row">
          <input
            required
            name="kitName"
            placeholder="Kit/Set Name"
            value={kitName}
            onChange={e => setKitName(e.target.value)}
            className="sets-field"
          />
          <select required name="currency" value={currency} onChange={e => setCurrency(e.target.value)} className="sets-field sets-pos-select">
            <option value="K">K</option>
            <option value="$">$</option>
            <option value="">Select Currency</option>
          </select>
          <select
            required={supportsUnitField}
            disabled={!supportsUnitField}
            name="unit"
            value={supportsUnitField ? selectedUnit : ""}
            onChange={e => setSelectedUnit(e.target.value)}
            className="sets-field sets-pos-select"
          >
            {supportsUnitField ? (
              <>
                <option value="">Select Unit</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </>
            ) : (
              <option value="">{comboColumnSupport.unitReason || 'Unit column unavailable'}</option>
            )}
          </select>
          <select
            required={supportsCategoryField}
            disabled={!supportsCategoryField}
            name="category"
            value={supportsCategoryField ? selectedCategory : ""}
            onChange={e => setSelectedCategory(e.target.value)}
            className="sets-field sets-pos-select"
          >
            {supportsCategoryField ? (
              <>
                <option value="">Select Category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </>
            ) : (
              <option value="">{comboColumnSupport.categoryReason || 'Category column unavailable'}</option>
            )}
          </select>
          <select value={skuMode} onChange={e => setSkuMode(e.target.value)} className="sets-field sets-pos-select" aria-label="SKU mode">
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div className="sets-form-row sets-form-row--pricing">
          <div className="sets-sku-wrap">
            <input
              name="sku"
              placeholder="SKU"
              value={sku}
              onChange={e => setSku(e.target.value)}
              readOnly={skuMode === 'auto'}
              className={`sets-field sets-field--inner${skuMode === 'manual' && skuExists ? ' sets-field--invalid' : ''}`}
              aria-invalid={skuMode === 'manual' && skuExists}
            />
            {skuMode === 'manual' && sku && skuExists && (
              <span className="sets-sku-error">SKU already exists</span>
            )}
          </div>
          <input required type="number" step="0.01" name="standardPrice" placeholder="Standard Price" value={standardPrice} onChange={e => setStandardPrice(e.target.value)} className="sets-field" />
          <input type="number" step="0.01" name="promotionalPrice" placeholder="Promotional Price" value={promotionalPrice} onChange={e => setPromotionalPrice(e.target.value)} className="sets-field" />
          <div className="sets-file-input">
            <input
              type="file"
              accept="image/*"
              onChange={e => setImageFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
            />
          </div>
        </div>
        <div style={{ color: '#9fb3c8', fontSize: '0.92rem', margin: '0 0 8px' }}>
          Standard and promotional prices are saved separately for each selected location.
        </div>
        <div className="sets-form-spacer" aria-hidden="true" />
        <div className="sets-locations-section">
          <div className="sets-locations-row">
            <div className="sets-locations">
              <div className="sets-locations-title">Locations</div>
              <div className="sets-locations-list">
                {locations.map(loc => {
                const idStr = String(loc.id);
                const checked = (selectedLocations || []).some(x => String(x) === idStr);
                return (
                  <label key={loc.id} className="sets-location-label">
                    <input
                      type="checkbox"
                      className="sets-location-checkbox"
                      checked={checked}
                      onChange={e => {
                        setSelectedLocations(prev => {
                          const prevSet = new Set((prev || []).map(value => String(value)));
                          if (e.target.checked) {
                            prevSet.add(idStr);
                          } else {
                            prevSet.delete(idStr);
                          }
                          return Array.from(prevSet);
                        });
                      }}
                    />
                    <span>{loc.name}</span>
                  </label>
                );
              })}
              </div>
            </div>
            <button
              type="submit"
              className="sets-save-btn"
              disabled={skuMode==='manual' && skuExists}
              title={skuMode==='manual' && skuExists ? 'SKU already exists' : undefined}
              style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1.2rem', fontWeight: 'bold', fontSize: '0.98rem', boxShadow: '0 2px 8px #00b4d855', cursor: skuMode==='manual' && skuExists ? 'not-allowed' : 'pointer', opacity: skuMode==='manual' && skuExists ? 0.7 : 1, width: 'auto', alignSelf: 'flex-start'}}
            >
              Create Kit/Set
            </button>
          </div>
        </div>

        <div className="sets-kit-components-section">
          <div className="sets-section-title">Kit Components</div>
          <div className="form-grid-search-row sets-search-row">
          <div className="search-box">
            <input
              className="products-search-bar sets-components-search"
              placeholder="Search product to add..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {/* Dropdown for matching products */}
      {search.trim().length >= 3 && filteredProducts.length > 0 && (
              <ul style={{position: 'absolute', top: '40px', left: 0, width: '100%', background: '#23272f', border: '1px solid #00b4d8', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto', zIndex: 10, listStyle: 'none', margin: 0, padding: 0}}>
                {filteredProducts.map(product => (
                  <li
                    key={product.id}
                    style={{padding: '8px 12px', cursor: kitItems.some(item => item.product_id === product.id) ? 'not-allowed' : 'pointer', color: kitItems.some(item => item.product_id === product.id) ? '#888' : '#e0e6ed', background: kitItems.some(item => item.product_id === product.id) ? '#181818' : 'inherit'}}
                    onClick={() => {
                      if (!kitItems.some(item => item.product_id === product.id)) {
                        setKitItems(prev => [...prev, { product_id: product.id, name: product.name, quantity: "" }]);
                        setSearch(""); // Clear search after adding
                      }
                    }}
                  >
        {product.name} <span style={{color:'#00b4d8', fontSize:'0.9em'}}>({product.sku})</span>
        <span style={{color:'#9aa', fontSize:'0.9em'}}> • {getProductUnit(product.id)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        </div>

        {/* Removed available products table. Products are now added via dropdown above. */}

        {/* Show kit items table only when searching products or adding to kit */}
        {(search.trim() !== "" || kitItems.length > 0) && (
          <div className="products-list" style={{width: '100%', marginTop: '0.5rem', overflowY: 'auto', maxHeight: '350px'}}>
            <table style={{width: '100%', minWidth: 700, background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse'}}>
              <thead>
                <tr style={{background: '#23272f'}}>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', textAlign: 'left'}}>Product Name</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Unit</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Quantity</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 60}}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {kitItems.map(item => (
                  <tr key={item.product_id} style={{background: '#181818'}}>
                    <td style={{textAlign: 'left'}}>{item.name}</td>
                    <td>{getProductUnit(item.product_id)}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity === "" ? "" : item.quantity}
                        onChange={e => updateQty(item.product_id, e.target.value)}
                        style={{ width: 70, borderColor: '#00b4d8', borderRadius: '4px', background: '#23272f', color: '#e0e6ed', padding: '4px 8px' }}
                      />
                      <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 6 }}>
                        (Stock: {productStock[item.product_id] || 0})
                      </span>
                    </td>
                    <td>
                      {canDelete && (
                        <button
                          type="button"
                          className="sets-delete-btn"
                          onClick={() => removeProductFromKit(item.product_id)}
                          style={{background: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '5px', padding: '6px 10px', fontSize: '1rem', cursor: 'pointer'}}>
                          <FaTrash />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {kitItems.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#888" }}>No products added yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {products.length === 0 && (
              <div style={{ color: '#ff4d4d', marginTop: '1rem', textAlign: 'center' }}>
                No products found in the database. Please check your Supabase connection and products table.
              </div>
            )}
          </div>
        )}
      </form>
      )}
    </div>
  );
}