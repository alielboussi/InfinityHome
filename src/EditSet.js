/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import db from './dataClient';
import { FaTrash } from "react-icons/fa";
import useComboColumnSupport from "./hooks/useComboColumnSupport";
import { insertComboItems } from "./services/comboItems";
import { logUserActivity } from './utils/userActivityLog';
import { replaceComboLocations } from "./services/comboLocations";
import {
  buildComboLocationPriceMap,
  resolveComboLocationPricing,
} from './utils/locationPricing';
import {
  fetchComboLocationPriceRow,
  seedComboLocationPricesForLocations,
} from './services/locationPricing';

export default function EditSet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const comboFilterValue = id ? String(id) : "";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [combo, setCombo] = useState(null);
  const [setProduct, setSetProduct] = useState(null);
  const [comboItems, setComboItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [kitItems, setKitItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pricingLocationId, setPricingLocationId] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [kitName, setKitName] = useState("");
  const [sku, setSku] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const [promotionalPrice, setPromotionalPrice] = useState("");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [currency, setCurrency] = useState("");
  const [search, setSearch] = useState("");
  const comboColumnSupport = useComboColumnSupport();
  const supportsCategoryField = comboColumnSupport.category;
  const supportsUnitField = comboColumnSupport.unit;

  const applyPricingLocationToSet = async (comboData, locationId) => {
    if (!comboData?.id || !locationId) return;
    try {
      const row = await fetchComboLocationPriceRow(db, comboData.id, locationId);
      const priceMap = buildComboLocationPriceMap(row ? [row] : []);
      const resolved = resolveComboLocationPricing(comboData, locationId, priceMap);
      setStandardPrice(resolved.combo_price ?? resolved.standard_price ?? '');
      setPromotionalPrice(resolved.promotional_price ?? '');
      setPromoStart(resolved.promo_start_date || '');
      setPromoEnd(resolved.promo_end_date || '');
    } catch (err) {
      console.warn('Failed to load set location prices', err);
    }
  };

  useEffect(() => {
    if (!pricingLocationId || !combo?.id) return;
    applyPricingLocationToSet(combo, pricingLocationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingLocationId, combo?.id]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setLoadError("");
      if (!comboFilterValue) {
        setLoadError("Missing set id in route");
        setLoading(false);
        return;
      }
      // Fetch combo and populate fields directly from combos table
      const { data: comboData, error: comboErr } = await db
        .from("combos")
        .select("*")
        .eq("id", comboFilterValue)
        .maybeSingle();
      if (comboErr) {
        console.error("Failed to load set", comboErr);
        setLoadError(comboErr.message || "Unable to load set");
        setCombo(null);
        setLoading(false);
        return;
      }
      if (!comboData) {
        setLoadError("Set not found");
        setCombo(null);
        setLoading(false);
        return;
      }
      setCombo(comboData);
      setKitName(comboData?.combo_name || "");
      setSku(comboData?.sku || "");
      setStandardPrice(comboData?.standard_price || comboData?.combo_price || "");
      setPromotionalPrice(comboData?.promotional_price || "");
      setPromoStart(comboData?.promo_start_date || "");
      setPromoEnd(comboData?.promo_end_date || "");
      setImageUrl(comboData?.picture_url || "");
      setCurrency(comboData?.currency || "");
      setSelectedCategory(comboData?.category_id ? String(comboData.category_id) : "");
      setSelectedUnit(comboData?.unit_of_measure_id ? String(comboData.unit_of_measure_id) : "");
      // Fetch combo_items
      const { data: itemsData, error: itemsErr } = await db.from("combo_items").select("*").eq("combo_id", comboFilterValue);
      if (itemsErr) {
        console.error("Failed to load set components", itemsErr);
      }
      setComboItems(itemsData || []);
      setKitItems((itemsData || []).map(item => ({ product_id: item.product_id, quantity: item.quantity })));
      // Fetch products, locations, units, categories
      const { data: prods, error: prodErr } = await db.from("products").select("id, name, sku");
      if (prodErr) console.error("Failed to load products", prodErr);
      setProducts(prods || []);
      const { data: locs, error: locErr } = await db.from("locations").select("id, name");
      if (locErr) console.error("Failed to load locations", locErr);
      setLocations(locs || []);
      // fetch selected locations for this combo
      const { data: comboLocs, error: comboLocErr } = await db
        .from("combo_locations")
        .select("location_id")
        .eq("combo_id", comboFilterValue);
      if (comboLocErr) console.error("Failed to load set locations", comboLocErr);
      const locationIds = (comboLocs || []).map((cl) => String(cl.location_id));
      setSelectedLocations(locationIds);
      const initialPricingLocation = locationIds[0] || (locs?.[0]?.id ? String(locs[0].id) : '');
      setPricingLocationId(initialPricingLocation);
      if (initialPricingLocation) {
        await applyPricingLocationToSet(comboData, initialPricingLocation);
      }
      const { data: unitsData, error: unitErr } = await db.from("unit_of_measure").select("id, name");
      if (unitErr) console.error("Failed to load units", unitErr);
      setUnits(unitsData || []);
      const { data: cats, error: catErr } = await db.from("categories").select("id, name");
      if (catErr) console.error("Failed to load categories", catErr);
      setCategories(cats || []);
      setLoading(false);
    }
    fetchData();
  }, [comboFilterValue]);

  // Add product to kit
  const addProductToKit = (product) => {
    setKitItems([...kitItems, { product_id: product.id, name: product.name, quantity: 1 }]);
  };

  // Filter products for search (exclude already added)
  const filteredProducts = products.filter(p => {
    if (kitItems.some(item => String(item.product_id) === String(p.id))) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(s)) ||
      (p.sku && String(p.sku).toLowerCase().includes(s))
    );
  });

  // Update quantity in kit
  const updateQty = (product_id, qty) => {
    if (qty < 1) qty = 1;
    setKitItems(kitItems.map(item =>
      item.product_id === product_id ? { ...item, quantity: qty } : item
    ));
  };

  // Remove product from kit
  const removeProductFromKit = (product_id) => {
    setKitItems(kitItems.filter(item => item.product_id !== product_id));
  };

  // Save changes
  const handleSave = async (e) => {
    e.preventDefault();
  if (!kitName || !standardPrice || kitItems.length === 0) {
      alert("Please fill all required fields and add at least one product.");
      return;
    }
  if (!pricingLocationId) {
      alert("Select a pricing location.");
      return;
    }
  // Update combo only (sets are stored in combos; product row may not exist)
    const updatePayload = {
      combo_name: kitName,
      sku,
      standard_price: standardPrice,
      combo_price: standardPrice,
      promotional_price: promotionalPrice === "" ? null : promotionalPrice,
      promo_start_date: promoStart || null,
      promo_end_date: promoEnd || null,
      picture_url: imageUrl || null,
      currency: currency || combo?.currency || null,
    };
    if (supportsCategoryField) {
      updatePayload.category_id = selectedCategory || null;
    }
    if (supportsUnitField) {
      updatePayload.unit_of_measure_id = selectedUnit || null;
    }
    const { error: comboError } = await db
      .from("combos")
      .update(updatePayload)
      .eq("id", comboFilterValue);
    if (comboError) return alert("Error updating combo: " + comboError.message);
    try {
      await seedComboLocationPricesForLocations(db, {
        comboId: comboFilterValue,
        locationIds: [pricingLocationId],
        comboPrice: standardPrice,
        promotionalPrice: promotionalPrice === "" ? null : promotionalPrice,
        promoStartDate: promoStart || null,
        promoEndDate: promoEnd || null,
      });
    } catch (priceError) {
      console.warn('Failed to save set location prices', priceError);
    }
    // Update combo_locations
    const locRows = (selectedLocations || []).map(lid => {
      const parsed = Number(lid);
      return {
        combo_id: Number.isFinite(Number(comboFilterValue)) ? Number(comboFilterValue) : comboFilterValue,
        location_id: Number.isNaN(parsed) ? lid : parsed,
      };
    });
    try {
      await replaceComboLocations(comboFilterValue, locRows);
    } catch (locError) {
      alert("Failed to save locations for this set: " + (locError.message || "Unknown error"));
      return;
    }
    // Update combo_items: delete old, then insert current list with id fallback support
    await db.from("combo_items").delete().eq("combo_id", comboFilterValue);
    try {
      await insertComboItems(
        kitItems.map(item => ({
          combo_id: comboFilterValue,
          product_id: item.product_id,
          quantity: item.quantity,
        }))
      );
    } catch (itemError) {
      console.error("Error updating combo components", itemError);
      alert("Error updating combo components: " + (itemError.message || "Unknown error"));
      return;
    }
    alert("Set updated!");
    logUserActivity({
      actionType: 'set_edit',
      actionLabel: 'Set Updated',
      details: `${kitName} • SKU ${sku} • Price ${standardPrice || 0}${promotionalPrice ? ` • Promo ${promotionalPrice}` : ''}`,
      reference: sku,
      entityType: 'combo',
      entityId: String(comboFilterValue),
    });
    navigate("/products-list");
  };

  if (loading) return <div style={{color:'#00b4d8', textAlign:'center', marginTop:'2rem'}}>Loading...</div>;
  if (loadError) {
    return (
      <div className="products-container" style={{maxWidth:'100vw', minHeight:'100vh', color:'#ff6b6b', display:'flex', alignItems:'center', justifyContent:'center'}}>
        {loadError}
      </div>
    );
  }

  const columnWarnings = [];
  if (!supportsUnitField) {
    columnWarnings.push(comboColumnSupport.unitReason || 'combos.unit_of_measure_id is missing – unit selection is disabled.');
  }
  if (!supportsCategoryField) {
    columnWarnings.push(comboColumnSupport.categoryReason || 'combos.category_id is missing – category selection is disabled.');
  }

  return (
    <div className="products-container sets-page" style={{maxWidth: '100vw', minHeight: '100vh', height: 'auto', overflow: 'visible', padding: '0', margin: 0}}>
      <h1 className="products-title" style={{marginTop: '1rem'}}>Edit Kit / Set</h1>
      <form className="product-form" onSubmit={handleSave}>
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
        {/* Row 1: currency, unit, category, SKU, kit name */}
        <div className="sets-row-5 sets-grid" style={{width: '100%', maxWidth: 1200, margin: '0 auto'}}>
          <select required name="currency" value={currency} onChange={e => setCurrency(e.target.value)}>
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
          <input name="sku" placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} />
          <input required name="kitName" placeholder="Kit/Set Name" value={kitName} onChange={e => setKitName(e.target.value)} />
        </div>
        {/* Row 2: prices and promo window */}
        <div className="sets-row-5 sets-grid" style={{width: '100%', maxWidth: 1200, margin: '0 auto', marginTop: '6px'}}>
          <select
            value={pricingLocationId}
            onChange={(e) => setPricingLocationId(e.target.value)}
            aria-label="Pricing location"
          >
            <option value="">Select pricing location</option>
            {(selectedLocations.length
              ? locations.filter((loc) => selectedLocations.some((id) => String(id) === String(loc.id)))
              : locations
            ).map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <input required type="number" step="0.01" name="standardPrice" placeholder="Standard Price" value={standardPrice} onChange={e => setStandardPrice(e.target.value)} disabled={!pricingLocationId} />
          <input type="number" step="0.01" name="promotionalPrice" placeholder="Promotional Price" value={promotionalPrice} onChange={e => setPromotionalPrice(e.target.value)} disabled={!pricingLocationId} />
          <input type="date" name="promoStart" placeholder="Promo Start" value={promoStart} onChange={e => setPromoStart(e.target.value)} disabled={!pricingLocationId} />
          <input type="date" name="promoEnd" placeholder="Promo End" value={promoEnd} onChange={e => setPromoEnd(e.target.value)} disabled={!pricingLocationId} />
          <input placeholder="Image URL" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="sets-control" />
        </div>
        {pricingLocationId ? (
          <div style={{ color: '#9fb3c8', fontSize: '0.92rem', margin: '0 auto 8px', maxWidth: 1200 }}>
            Prices apply to {locations.find((loc) => String(loc.id) === String(pricingLocationId))?.name || 'the selected location'}.
          </div>
        ) : (
          <div style={{ color: '#ffb4b4', fontSize: '0.92rem', margin: '0 auto 8px', maxWidth: 1200 }}>
            Select a pricing location to edit standard and promotional prices.
          </div>
        )}
        {/* Locations row with right-aligned Save button */}
        <div className="sets-locations-row" style={{ marginTop: '8px', width: '100%' }}>
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
                          const next = new Set((prev || []).map(value => String(value)));
                          if (e.target.checked) {
                            next.add(idStr);
                          } else {
                            next.delete(idStr);
                          }
                          return Array.from(next);
                        });
                      }}
                    />
                    <span>{loc.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <button type="submit" className="sets-save-btn" style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1.2rem', fontWeight: 'bold', fontSize: '0.98rem', boxShadow: '0 2px 8px #00b4d855', cursor: 'pointer', width: 'auto', alignSelf: 'flex-start'}}>Save Changes</button>
        </div>
        <div className="sets-section-title" style={{color: '#00b4d8'}}>Kit Components</div>
        <div className="form-grid-search-row sets-search-row" style={{marginTop: '18px', marginBottom: '8px', width: '100%'}}>
          <div className="search-box">
            <input
              className="products-search-bar"
              placeholder="Search product to add..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{marginBottom: 0, width: '100%'}}
            />
            {search.trim().length >= 3 && filteredProducts.length > 0 && (
              <ul style={{position: 'absolute', top: '40px', left: 0, width: '100%', background: '#23272f', border: '1px solid #00b4d8', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto', zIndex: 10, listStyle: 'none', margin: 0, padding: 0}}>
                {filteredProducts.map(product => {
                  const already = kitItems.some(item => String(item.product_id) === String(product.id));
                  return (
                    <li
                      key={product.id}
                      style={{padding: '8px 12px', cursor: already ? 'not-allowed' : 'pointer', color: already ? '#888' : '#e0e6ed', background: already ? '#181818' : 'inherit'}}
                      onClick={() => {
                        if (!already) {
                          addProductToKit(product);
                          setSearch("");
                        }
                      }}
                    >
                      {product.name} <span style={{color:'#00b4d8', fontSize:'0.9em'}}>({product.sku})</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <div className="products-list" style={{width: '100%', marginTop: '0.5rem', overflowY: 'auto', maxHeight: '350px'}}>
          <table style={{width: '100%', minWidth: 600, background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{background: '#23272f'}}>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', textAlign: 'left'}}>Product Name</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Quantity</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 60}}>Remove</th>
              </tr>
            </thead>
            <tbody>
              {kitItems.map(item => {
                const prod = products.find(p => p.id === item.product_id);
                return (
                  <tr key={item.product_id} style={{background: '#181818'}}>
                    <td style={{textAlign: 'left'}}>{prod ? prod.name : item.product_id}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateQty(item.product_id, Number(e.target.value))}
                        style={{ width: 70, borderColor: '#00b4d8', borderRadius: '4px', background: '#23272f', color: '#e0e6ed', padding: '4px 8px' }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="sets-delete-btn"
                        onClick={() => removeProductFromKit(item.product_id)}
                        style={{background: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '5px', padding: '6px 10px', fontSize: '1rem', cursor: 'pointer'}}>
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {kitItems.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "#888" }}>No products added yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
  {/* Save button moved to the locations row above */}
      </form>
    </div>
  );
}
