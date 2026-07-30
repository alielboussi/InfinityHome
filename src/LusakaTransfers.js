import React, { useCallback, useEffect, useRef, useState } from 'react';
import supabase from './supabase';
import BackToDashboard from './BackToDashboard';
import { getCurrentUser } from './accessControl';
import { applyInventoryBulk } from './utils/inventoryApi';
import { syncProductLocations } from './services/productLocations';
import { upsertComboLocations } from './services/comboLocations';
import { getMaxSetQty } from './utils/setInventoryUtils';
import {
  LUSAKA_TRANSFER_FROM_ID,
  LUSAKA_TRANSFER_TO_ID,
  aggregateTransferLineItems,
  buildLusakaTransferDeliveryNumber,
} from './utils/lusakaTransfer';
import { buildWarehouseDeliveryPdf, openPdfBlob } from './utils/warehouseDeliveryPdf';
import { sendLusakaTransferPdfWhatsApp } from './services/whatsapp';

const BUCKET = 'WarehouseTransfers';

function buildSearchOrFilter(term) {
  const escaped = String(term || '').trim().replace(/[%_]/g, '\\$&');
  const like = `%${escaped}%`;
  return `name.ilike.${like},sku.ilike.${like}`;
}

async function fetchKitweProductIds() {
  const [{ data: linked, error: plErr }, { data: invRows, error: invErr }] = await Promise.all([
    supabase.from('product_locations').select('product_id').eq('location_id', LUSAKA_TRANSFER_FROM_ID),
    supabase.from('inventory').select('product_id').eq('location', LUSAKA_TRANSFER_FROM_ID),
  ]);
  if (plErr) throw plErr;
  if (invErr) throw invErr;
  const ids = new Set();
  (linked || []).forEach((row) => { if (row.product_id) ids.add(String(row.product_id)); });
  (invRows || []).forEach((row) => { if (row.product_id) ids.add(String(row.product_id)); });
  return ids;
}

async function searchKitweProducts(term, allowedIds) {
  const trimmed = String(term || '').trim();
  if (!trimmed || !allowedIds.size) return [];

  const orFilter = buildSearchOrFilter(trimmed);
  const allowedList = Array.from(allowedIds);

  if (allowedList.length <= 200) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku')
      .in('id', allowedList)
      .or(orFilter)
      .order('name')
      .limit(30);
    if (error) throw error;
    return data || [];
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku')
    .or(orFilter)
    .order('name')
    .limit(80);
  if (error) throw error;
  return (data || []).filter((row) => allowedIds.has(String(row.id))).slice(0, 30);
}

async function uploadTransferPdf(sessionId, pdfBlob, fileName) {
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  let pdfUrl = null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch('/api/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload-pdf', sessionId, fileName, pdfBase64 }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (resp.ok) {
      const json = await resp.json();
      pdfUrl = json.publicUrl || null;
    }
  } catch {}

  if (!pdfUrl) {
    try {
      const path = `${sessionId}/${fileName}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' });
      if (!upErr) {
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        pdfUrl = pub?.publicUrl || null;
      }
    } catch {}
  }
  return pdfUrl;
}

async function enableEligibleCombosAtDestination(productIds) {
  if (!productIds.length) return;
  const { data: comboItems } = await supabase
    .from('combo_items')
    .select('combo_id, product_id, quantity')
    .in('product_id', productIds);
  const comboIds = [...new Set((comboItems || []).map((row) => row.combo_id).filter(Boolean))];
  if (!comboIds.length) return;

  const { data: srcComboLocs } = await supabase
    .from('combo_locations')
    .select('combo_id')
    .eq('location_id', LUSAKA_TRANSFER_FROM_ID)
    .in('combo_id', comboIds);
  const sourceComboIds = new Set((srcComboLocs || []).map((row) => String(row.combo_id)));

  const itemsByCombo = new Map();
  (comboItems || []).forEach((row) => {
    if (!sourceComboIds.has(String(row.combo_id))) return;
    if (!itemsByCombo.has(row.combo_id)) itemsByCombo.set(row.combo_id, []);
    itemsByCombo.get(row.combo_id).push(row);
  });

  const allComponentIds = [...new Set(
    Array.from(itemsByCombo.values()).flat().map((row) => row.product_id),
  )];
  if (!allComponentIds.length) return;

  const { data: invRows } = await supabase
    .from('inventory')
    .select('product_id, quantity')
    .eq('location', LUSAKA_TRANSFER_TO_ID)
    .in('product_id', allComponentIds);
  const stock = {};
  (invRows || []).forEach((row) => {
    stock[row.product_id] = Number(row.quantity) || 0;
  });

  const rows = [];
  itemsByCombo.forEach((items, comboId) => {
    if (getMaxSetQty(items, stock) > 0) {
      rows.push({ combo_id: comboId, location_id: LUSAKA_TRANSFER_TO_ID });
    }
  });
  if (rows.length) await upsertComboLocations(rows);
}

export default function LusakaTransfers() {
  const searchRef = useRef(null);
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [company, setCompany] = useState(null);
  const [allowedProductIds, setAllowedProductIds] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [transferRef, setTransferRef] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState([]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: locs }, { data: companyRow }, allowed] = await Promise.all([
        supabase.from('locations').select('id, name').in('id', [LUSAKA_TRANSFER_FROM_ID, LUSAKA_TRANSFER_TO_ID]),
        supabase.from('company_settings').select('*').limit(1).maybeSingle(),
        fetchKitweProductIds(),
      ]);

      const fromLoc = (locs || []).find((row) => String(row.id) === LUSAKA_TRANSFER_FROM_ID);
      const toLoc = (locs || []).find((row) => String(row.id) === LUSAKA_TRANSFER_TO_ID);
      setFromName(fromLoc?.name || 'Kitwe');
      setToName(toLoc?.name || 'Lusaka');
      setCompany(companyRow || null);
      setAllowedProductIds(allowed);
    } catch (err) {
      setError(err?.message || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('stock_transfer_sessions')
        .select('id, delivery_number, transfer_datetime, created_at, total_qty, status, metadata')
        .eq('from_location', LUSAKA_TRANSFER_FROM_ID)
        .eq('to_location', LUSAKA_TRANSFER_TO_ID)
        .order('created_at', { ascending: false })
        .limit(8);
      setHistory(data || []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadHistory();
  }, [loadCatalog, loadHistory]);

  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    if (!allowedProductIds.size) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }

    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchKitweProducts(term, allowedProductIds)
        .then((rows) => {
          if (active) setSearchResults(rows);
        })
        .catch((err) => {
          if (active) {
            setSearchResults([]);
            setError(err?.message || 'Product search failed.');
          }
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, allowedProductIds]);

  const filteredProducts = searchResults;

  function addProduct(product) {
    setSelected((prev) => {
      const existing = prev.find((row) => row.product_id === product.id);
      if (existing) {
        return prev.map((row) => (
          row.product_id === product.id ? { ...row, qty: row.qty + 1 } : row
        ));
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        qty: 1,
      }];
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function updateQty(productId, qty) {
    const num = Number(qty);
    if (!Number.isFinite(num) || num < 0) return;
    setSelected((prev) => prev.map((row) => (
      row.product_id === productId ? { ...row, qty: num } : row
    )));
  }

  function removeLine(productId) {
    setSelected((prev) => prev.filter((row) => row.product_id !== productId));
  }

  const grandTotal = selected.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);

  async function handleTransfer() {
    const lineItems = aggregateTransferLineItems(
      selected.map((row) => ({ ...row, qty: Number(row.qty) || 0 })),
    );
    if (!lineItems.length) {
      setError('Add at least one product with a quantity greater than zero.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const user = getCurrentUser();
      const capturedAt = new Date();
      const deliveryNumber = buildLusakaTransferDeliveryNumber(transferRef, capturedAt);
      const productIds = lineItems.map((row) => row.product_id);

      const { data: session, error: sessionErr } = await supabase
        .from('stock_transfer_sessions')
        .insert({
          from_location: LUSAKA_TRANSFER_FROM_ID,
          to_location: LUSAKA_TRANSFER_TO_ID,
          user_uid: user?.id || null,
          transfer_date: capturedAt.toISOString().slice(0, 10),
          created_at: capturedAt.toISOString(),
          transfer_datetime: capturedAt.toISOString(),
          delivery_number: deliveryNumber,
          status: 'approved',
          total_qty: lineItems.reduce((sum, row) => sum + row.qty, 0),
          metadata: {
            transfer_number: deliveryNumber,
            created_by_email: user?.email || null,
            flow: 'lusaka-transfer',
          },
        })
        .select()
        .single();
      if (sessionErr) throw sessionErr;

      const sessionId = session.id;
      const { error: entriesErr } = await supabase.from('stock_transfer_entries').insert(
        lineItems.map((row) => ({
          session_id: sessionId,
          product_id: row.product_id,
          quantity: row.qty,
        })),
      );
      if (entriesErr) throw entriesErr;

      const { data: existingInv, error: invFetchErr } = await supabase
        .from('inventory')
        .select('id, product_id, location, quantity')
        .in('product_id', productIds)
        .in('location', [LUSAKA_TRANSFER_FROM_ID, LUSAKA_TRANSFER_TO_ID]);
      if (invFetchErr) throw invFetchErr;

      const invByKey = new Map();
      (existingInv || []).forEach((row) => invByKey.set(`${row.product_id}|${row.location}`, row));

      const inventoryUpdates = [];
      const inventoryInserts = [];
      const destBeforeMap = new Map();
      const destAfterMap = new Map();

      lineItems.forEach((row) => {
        const srcKey = `${row.product_id}|${LUSAKA_TRANSFER_FROM_ID}`;
        const dstKey = `${row.product_id}|${LUSAKA_TRANSFER_TO_ID}`;
        const srcExisting = invByKey.get(srcKey);
        const dstExisting = invByKey.get(dstKey);
        const dstBefore = dstExisting ? Number(dstExisting.quantity) || 0 : 0;
        destBeforeMap.set(String(row.product_id), dstBefore);
        destAfterMap.set(String(row.product_id), dstBefore + row.qty);

        if (srcExisting) {
          inventoryUpdates.push({
            id: srcExisting.id,
            quantity: (Number(srcExisting.quantity) || 0) - row.qty,
          });
        } else {
          inventoryInserts.push({
            product_id: row.product_id,
            location: LUSAKA_TRANSFER_FROM_ID,
            quantity: -row.qty,
          });
        }

        if (dstExisting) {
          inventoryUpdates.push({
            id: dstExisting.id,
            quantity: dstBefore + row.qty,
          });
        } else {
          inventoryInserts.push({
            product_id: row.product_id,
            location: LUSAKA_TRANSFER_TO_ID,
            quantity: row.qty,
          });
        }
      });

      if (inventoryUpdates.length || inventoryInserts.length) {
        await applyInventoryBulk({ updates: inventoryUpdates, inserts: inventoryInserts }, supabase);
      }

      await syncProductLocations({
        rows: lineItems.map((row) => ({
          product_id: row.product_id,
          location_id: LUSAKA_TRANSFER_TO_ID,
        })),
      }, supabase);

      await enableEligibleCombosAtDestination(productIds);

      const pdfEntries = lineItems.map((row) => ({
        kind: 'product',
        product_id: row.product_id,
        name: row.name,
        sku: row.sku,
        qty: row.qty,
        expected_dest_stock: destAfterMap.get(String(row.product_id)),
      }));

      const pdfBlob = await buildWarehouseDeliveryPdf({
        session: {
          id: sessionId,
          delivery_number: deliveryNumber,
          status: 'completed',
          created_by_email: user?.email || '-',
          submitted_at: capturedAt.toISOString(),
          transfer_datetime: capturedAt.toISOString(),
        },
        entries: pdfEntries,
        fromName,
        toName,
        destStockMap: destBeforeMap,
        company,
      });

      const fileName = `${deliveryNumber}.pdf`;
      const pdfUrl = await uploadTransferPdf(sessionId, pdfBlob, fileName);
      if (pdfUrl) {
        await supabase.from('stock_transfer_sessions').update({
          pdf_url: pdfUrl,
          metadata: {
            transfer_number: deliveryNumber,
            created_by_email: user?.email || null,
            flow: 'lusaka-transfer',
            pdf_url: pdfUrl,
          },
        }).eq('id', sessionId);
      }

      const caption = [
        `Transfer ${deliveryNumber}`,
        `${fromName} -> ${toName}`,
        `${lineItems.length} product line(s), total qty ${grandTotal}`,
      ].join('\n');

      if (pdfUrl) {
        const wa = await sendLusakaTransferPdfWhatsApp({
          pdfUrl,
          pdfFilename: fileName,
          message: caption,
        });
        if (!wa.ok) {
          setSuccess(`Transfer saved. PDF ready, but WhatsApp send failed: ${wa.error || 'unknown error'}`);
        } else {
          setSuccess('Transfer completed. PDF sent to WhatsApp group.');
        }
      } else {
        setSuccess('Transfer completed. PDF downloaded locally; WhatsApp was skipped because upload failed.');
      }

      openPdfBlob(pdfBlob, fileName);
      setSelected([]);
      setTransferRef('');
      await loadCatalog();
      await loadHistory();
    } catch (err) {
      setError(err?.message || 'Transfer failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lusaka-transfers-container" style={{ maxWidth: 1100, margin: '24px auto', padding: '0 16px 32px' }}>
      <div className="page-header-row">
        <BackToDashboard />
        <h2 style={{ margin: 0 }}>Lusaka Transfers</h2>
      </div>
      <p className="meta-label" style={{ margin: '0 0 16px', lineHeight: 1.5 }}>
        Transfer components only from {fromName || 'Kitwe'} to {toName || 'Lusaka'}.
        Sets are not sent as whole units; they become available at Lusaka when enough components arrive.
      </p>

      <div className="report-filters">
        <div className="report-filter-block">
          <label>From (locked)</label>
          <div><strong>{fromName || LUSAKA_TRANSFER_FROM_ID}</strong></div>
        </div>
        <div className="report-filter-block">
          <label>To (locked)</label>
          <div><strong>{toName || LUSAKA_TRANSFER_TO_ID}</strong></div>
        </div>
        <div className="report-filter-block">
          <label htmlFor="transfer-ref">Transfer reference (optional)</label>
          <input
            id="transfer-ref"
            type="text"
            value={transferRef}
            onChange={(e) => setTransferRef(e.target.value)}
            placeholder="Auto-generated if blank"
          />
        </div>
      </div>

      <div className="report-section">
        <div className="report-section-title">
          Search products at {fromName || 'source location'}
          {!loading && (
            <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--ent-muted, #5b6675)' }}>
              ({allowedProductIds.size} available)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            id="product-search"
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filteredProducts[0]) addProduct(filteredProducts[0]);
            }}
            placeholder="Name or SKU"
            autoComplete="off"
            style={{ flex: '1 1 280px' }}
            disabled={loading || !allowedProductIds.size}
          />
          <button type="button" onClick={loadCatalog} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {!loading && !allowedProductIds.size && (
          <div className="report-blank" style={{ width: '100%', marginTop: 10 }}>
            No products are linked to {fromName || 'this location'} yet. Tick Kitwe on product creation or add inventory at Kitwe.
          </div>
        )}
        {search.trim() && (
          <div className="lusaka-search-results">
            {searching && (
              <div className="report-blank" style={{ width: '100%', margin: 0 }}>Searching…</div>
            )}
            {!searching && filteredProducts.length === 0 && (
              <div className="report-blank" style={{ width: '100%', margin: 0 }}>No products found for this location.</div>
            )}
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                role="button"
                tabIndex={0}
                className="lusaka-search-hit"
                onClick={() => addProduct(product)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    addProduct(product);
                  }
                }}
              >
                <strong>{product.name}</strong>
                <span style={{ marginLeft: 8, color: 'var(--ent-muted, #5b6675)' }}>{product.sku || '-'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="report-section">
        <div className="report-section-title">Transfer lines</div>
        {selected.length === 0 ? (
          <div className="report-blank" style={{ width: '100%' }}>No products added yet.</div>
        ) : (
          <table className="report-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th style={{ textAlign: 'right' }}>Transfer qty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {selected.map((row) => (
                <tr key={row.product_id}>
                  <td>{row.name}</td>
                  <td>{row.sku || '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      min="0"
                      value={row.qty}
                      onChange={(e) => updateQty(row.product_id, e.target.value)}
                      style={{ width: 90, textAlign: 'right' }}
                    />
                  </td>
                  <td>
                    <button type="button" className="remove-line-btn" onClick={() => removeLine(row.product_id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && <div className="report-error" style={{ width: '100%' }}>{error}</div>}
      {success && (
        <div style={{
          width: '100%',
          marginBottom: 16,
          padding: '10px 12px',
          borderRadius: 8,
          background: '#ecfdf5',
          border: '1px solid #6ee7b7',
          color: '#047857',
        }}
        >
          {success}
        </div>
      )}

      <div className="report-actions">
        <button type="button" className="lusaka-transfer-submit" onClick={handleTransfer} disabled={busy || !selected.length}>
          {busy ? 'Transferring…' : 'Transfer'}
        </button>
        {selected.length > 0 && (
          <button type="button" onClick={() => setSelected([])} disabled={busy}>
            Clear lines
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="report-section">
          <div className="report-section-title">Recent transfers</div>
          <table className="report-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{row.delivery_number || row.id}</td>
                  <td>{new Date(row.transfer_datetime || row.created_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{row.total_qty ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
