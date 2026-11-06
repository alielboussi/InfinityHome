import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaPlus, FaPrint, FaTrashAlt } from 'react-icons/fa';
import db from '../dataClient';
import {
  fetchWarehouseCatalog,
  invalidateWarehouseCatalogCache,
} from '../services/warehouseCatalog';
import {
  createManualStorageSend,
  listStorageSends,
  reprintStorageSendLabels,
} from '../services/warehouseDeliveryMobileApi';
import { isWarehouseSetAssembly } from '../utils/warehouseCatalogHierarchy';
import { expandWarehouseSetItemsRows } from '../utils/warehouseSetItems';
import { formatWarehouseAdminDateTime } from '../utils/warehouseAdminFormat';

function defaultTodayYmd() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lusaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {}
  return new Date().toISOString().slice(0, 10);
}

function formatSaleDateDisplay(value) {
  if (!value) return '—';
  const s = String(value).trim();
  const dmy = s.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/);
  if (dmy) {
    return `${String(dmy[1]).padStart(2, '0')}/${String(dmy[2]).padStart(2, '0')}/${dmy[3]}`;
  }
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lusaka',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return s;
  }
}

/** Sales storage registry — embedded in Floor 1 /warehouse-products/sales-storage view. */
export default function WarehouseSalesStoragePanel({ onStockChanged } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [setItems, setSetItems] = useState([]);

  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [saleDate, setSaleDate] = useState(() => defaultTodayYmd());

  const [productSearch, setProductSearch] = useState('');
  const [selectedLines, setSelectedLines] = useState([]);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [reprintBusyId, setReprintBusyId] = useState('');
  const [modalError, setModalError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listStorageSends({ admin_registry: true });
      setRows(res?.storage_sends || []);
    } catch (err) {
      setError(err?.message || 'Failed to load sales storage.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadPickerData = useCallback(async () => {
    setCatalogLoading(true);
    setModalError('');
    try {
      const [{ data: custRows, error: custErr }, catalog] = await Promise.all([
        db.from('customers').select('id, name, phone').order('name', { ascending: true }),
        fetchWarehouseCatalog(),
      ]);
      if (custErr) throw new Error(custErr.message || 'Failed to load customers');
      setCustomers(custRows || []);
      setAssemblies(catalog?.assemblies || []);
      setSetItems(catalog?.setItems || []);
    } catch (err) {
      setModalError(err?.message || 'Failed to load customers or warehouse catalog.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const openAddModal = () => {
    setAddOpen(true);
    setModalError('');
    setNotice('');
    if (!saleDate) setSaleDate(defaultTodayYmd());
    if (!customers.length || !assemblies.length) {
      loadPickerData();
    }
  };

  const closeAddModal = () => {
    if (submitBusy) return;
    setAddOpen(false);
    setModalError('');
  };

  const assemblyById = useMemo(
    () => new Map((assemblies || []).map((a) => [String(a.id), a])),
    [assemblies],
  );

  const getSetComponentPreview = useCallback(
    (setAssemblyId) => {
      const sid = String(setAssemblyId || '').trim();
      const expanded = expandWarehouseSetItemsRows(setItems || []).filter(
        (r) => String(r.set_assembly_id) === sid,
      );
      if (!expanded.length) return [];
      const firstLoc = expanded[0]?.location_id;
      const lines = expanded.filter((r) => String(r.location_id) === String(firstLoc));
      const map = new Map();
      for (const r of lines) {
        const cid = String(r.component_assembly_id || '').trim();
        if (!cid) continue;
        const comp = assemblyById.get(cid);
        if (!comp) continue;
        const qty = Math.max(1, Math.floor(Number(r.quantity) || 1));
        map.set(cid, (map.get(cid) || 0) + qty);
      }
      return [...map.entries()].map(([cid, perSetQty]) => ({
        component: assemblyById.get(cid),
        perSetQty,
      }));
    },
    [setItems, assemblyById],
  );

  const selectedCustomer = useMemo(
    () => (customers || []).find((c) => String(c.id) === String(selectedCustomerId)) || null,
    [customers, selectedCustomerId],
  );

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return (customers || []).slice(0, 60);
    return (customers || [])
      .filter(
        (c) => String(c.name || '').toLowerCase().includes(q)
          || String(c.phone || '').toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [customers, customerSearch]);

  const filteredAssemblies = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const valid = (assemblies || []).filter(
      (a) => a?.id && a?.metadata?.storeroom?.is_storeroom_material !== true,
    );
    if (!q) return valid.slice(0, 30);
    return valid
      .filter(
        (a) => String(a.name || '').toLowerCase().includes(q)
          || String(a.family_sku || '').toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [assemblies, productSearch]);

  const addLineItem = (assembly) => {
    const id = String(assembly?.id || '');
    if (!id) return;
    setSelectedLines((prev) => {
      const existingIdx = prev.findIndex((l) => String(l.assembly_id) === id);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: Math.max(1, Number(next[existingIdx].quantity || 1) + 1),
        };
        return next;
      }
      return [...prev, { assembly_id: id, quantity: 1 }];
    });
    setProductSearch('');
  };

  const updateLineQty = (assemblyId, rawQty) => {
    const clean = rawQty === '' ? '' : Math.max(1, Math.floor(Number(rawQty) || 1));
    setSelectedLines((prev) =>
      prev.map((l) => (String(l.assembly_id) === String(assemblyId) ? { ...l, quantity: clean } : l)),
    );
  };

  const removeLineItem = (assemblyId) => {
    setSelectedLines((prev) => prev.filter((l) => String(l.assembly_id) !== String(assemblyId)));
  };

  const handlePrintAndAdd = async (e) => {
    e.preventDefault();
    if (!selectedCustomer) {
      setModalError('Please select a customer from /customers.');
      return;
    }
    if (!saleDate) {
      setModalError('Please enter the date of sale.');
      return;
    }
    if (!selectedLines.length) {
      setModalError('Please add at least one product or set from /warehouse-products.');
      return;
    }

    setSubmitBusy(true);
    setModalError('');
    try {
      const res = await createManualStorageSend({
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        customer_phone: selectedCustomer.phone || '',
        sale_date: saleDate,
        lines: selectedLines.map((l) => ({
          assembly_id: l.assembly_id,
          quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
        })),
      });
      const sends = res?.storage_sends || (res?.storage_send ? [res.storage_send] : []);
      const numbers = sends.map((s) => s.storage_number).filter(Boolean).join(', ');
      const totalLabels = Number(res?.total_labels_printed)
        || sends.reduce((n, s) => n + (Number(s.quantity) || 0), 0);
      setNotice(
        `${numbers || 'Added'} saved to Sales Storage (deducted from Floor 1) · ${totalLabels} Zebra label${totalLabels === 1 ? '' : 's'} printed.`,
      );
      setSelectedLines([]);
      setAddOpen(false);
      invalidateWarehouseCatalogCache();
      if (typeof onStockChanged === 'function') {
        onStockChanged();
      }
      await load();
    } catch (err) {
      setModalError(err?.message || 'Failed to print Zebra labels and add to Sales Storage.');
    } finally {
      setSubmitBusy(false);
    }
  };

  const handleReprint = async (row) => {
    if (!row?.id || reprintBusyId) return;
    setReprintBusyId(String(row.id));
    setError('');
    setNotice('');
    try {
      const res = await reprintStorageSendLabels({ storage_send_id: row.id });
      const count = Number(res?.total_labels_printed) || Number(row.quantity) || 1;
      setNotice(
        `Reprinted ${count} Zebra label${count === 1 ? '' : 's'} for ${row.storage_number || row.assembly_name}.`,
      );
      await load();
    } catch (err) {
      setError(err?.message || 'Reprint failed.');
    } finally {
      setReprintBusyId('');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.storage_number,
        row.assembly_name,
        row.assembly_sku,
        row.receipt_number,
        row.created_by_name,
        row.created_by_email,
        row.customer_name,
        row.customer_phone,
        row.status,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <p style={{ color: 'var(--dash-muted)', margin: 0, lineHeight: 1.5, maxWidth: 680 }}>
          POS sold lines and manual customer storage entries in factory warehouse storage. Use the{' '}
          <strong>+</strong> button to select a customer, enter the date of sale, pick products/sets, print Zebra
          labels (SKU, Code 128, Product Name, Customer Name, Customer Phone, Image QR), and move them from Floor 1 into
          Sales Storage.
        </p>
        <button
          type="button"
          className="warehouse-catalog-action-btn warehouse-catalog-action-btn--primary"
          onClick={openAddModal}
          title="Print Zebra labels & add to Sales Storage"
          style={{
            width: 'auto',
            minWidth: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            fontWeight: 700,
          }}
        >
          <FaPlus aria-hidden />
          <span>Add &amp; Print Zebra Label</span>
        </button>
      </div>

      {notice ? (
        <div
          role="status"
          style={{
            color: '#047857',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 14,
            fontWeight: 600,
          }}
        >
          {notice}
        </div>
      ) : null}

      {addOpen ? (
        <div
          style={{
            border: '1px solid var(--dash-border, #cbd5e1)',
            borderRadius: 12,
            padding: 18,
            marginBottom: 20,
            background: 'var(--dash-surface, #ffffff)',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
              Print Zebra Label &amp; Add to Sales Storage
            </h3>
            <button
              type="button"
              className="product-form-btn product-form-btn--secondary"
              disabled={submitBusy}
              onClick={closeAddModal}
              style={{ width: 'auto', minWidth: 80, padding: '6px 14px', margin: 0 }}
            >
              Close
            </button>
          </div>

          {modalError ? (
            <div role="alert" style={{ color: '#dc2626', marginBottom: 12, fontWeight: 600 }}>
              {modalError}
            </div>
          ) : null}

          {catalogLoading ? (
            <div style={{ color: 'var(--dash-muted)', padding: '12px 0' }}>
              Loading customers and warehouse products…
            </div>
          ) : (
            <form onSubmit={handlePrintAndAdd}>
              <div style={{ display: 'grid', gap: 16, marginBottom: 18 }}>
                <div>
                  <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>
                    1. Select Customer (from /customers) &amp; Date of Sale
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 10,
                      maxWidth: 840,
                    }}
                  >
                    <input
                      type="search"
                      className="warehouse-catalog-filter-control products-search-bar"
                      placeholder="Filter customer by name or phone…"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      style={{ width: '100%', margin: 0 }}
                    />
                    <select
                      className="warehouse-catalog-filter-control"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      style={{ width: '100%', margin: 0 }}
                      required
                    >
                      <option value="">— Choose customer —</option>
                      {filteredCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` (${c.phone})` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className="warehouse-catalog-filter-control"
                      value={saleDate}
                      onChange={(e) => setSaleDate(e.target.value)}
                      aria-label="Date of Sale"
                      title="Date of Sale"
                      style={{ width: '100%', margin: 0 }}
                      required
                    />
                  </div>
                  {selectedCustomer ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: 'var(--dash-muted)' }}>
                      Customer Name: <strong>{selectedCustomer.name}</strong> · Customer Phone:{' '}
                      <strong>{selectedCustomer.phone || '—'}</strong> · Sale Date:{' '}
                      <strong>{formatSaleDateDisplay(saleDate)}</strong>
                    </div>
                  ) : null}
                </div>

                <div>
                  <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>
                    2. Add Products or Sets (from /warehouse-products)
                  </label>
                  <input
                    type="search"
                    className="warehouse-catalog-filter-control products-search-bar"
                    placeholder="Search product or set by name or SKU…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    style={{ width: '100%', maxWidth: 520, margin: 0 }}
                  />
                  {productSearch.trim() ? (
                    <div
                      style={{
                        marginTop: 8,
                        maxHeight: 280,
                        overflowY: 'auto',
                        border: '1px solid var(--dash-border-soft, #cbd5e1)',
                        borderRadius: 8,
                        background: 'var(--dash-surface, #fff)',
                        maxWidth: 720,
                      }}
                    >
                      {filteredAssemblies.length === 0 ? (
                        <div style={{ padding: 12, color: 'var(--dash-muted)', fontSize: 13 }}>
                          No matching products or sets.
                        </div>
                      ) : (
                        filteredAssemblies.map((asm) => {
                          const isSet = isWarehouseSetAssembly(asm);
                          const comps = isSet ? getSetComponentPreview(asm.id) : [];
                          return (
                            <div
                              key={asm.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) auto',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 14px',
                                borderBottom: '1px solid var(--dash-border-soft, #f1f5f9)',
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 6,
                                    fontWeight: 600,
                                    lineHeight: 1.35,
                                  }}
                                >
                                  <span
                                    className={`warehouse-kind-badge warehouse-kind-badge--${isSet ? 'set' : 'product'}`}
                                    style={{ margin: 0, flexShrink: 0 }}
                                  >
                                    {isSet ? 'Set' : 'Product'}
                                  </span>
                                  <span>{asm.name}</span>
                                  {asm.family_sku ? (
                                    <span style={{ color: 'var(--dash-muted)', fontSize: 12, fontWeight: 500 }}>
                                      ({asm.family_sku})
                                    </span>
                                  ) : null}
                                </div>
                                {isSet && comps.length > 0 ? (
                                  <div style={{ fontSize: 12, color: 'var(--dash-muted)', marginTop: 4 }}>
                                    Components:{' '}
                                    {comps.map((c) => `${c.perSetQty}× ${c.component?.name}`).join(' + ')}
                                  </div>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => addLineItem(asm)}
                                style={{
                                  width: 'auto',
                                  minWidth: 78,
                                  maxWidth: 'none',
                                  height: 34,
                                  padding: '0 14px',
                                  margin: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  borderRadius: 6,
                                  flexShrink: 0,
                                }}
                              >
                                <FaPlus size={11} aria-hidden />
                                <span>Add</span>
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>

                {selectedLines.length > 0 ? (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Selected Items to Print &amp; Store</div>
                    <div style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
                      {selectedLines.map((line) => {
                        const asm = assemblyById.get(String(line.assembly_id));
                        if (!asm) return null;
                        const isSet = isWarehouseSetAssembly(asm);
                        const comps = isSet ? getSetComponentPreview(asm.id) : [];
                        const qtyNum = Math.max(1, Math.floor(Number(line.quantity) || 1));
                        const totalLabelsForLine = isSet
                          ? comps.reduce((sum, c) => sum + c.perSetQty * qtyNum, 0)
                          : qtyNum;
                        return (
                          <div
                            key={line.assembly_id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(0, 1fr) auto',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 14px',
                              border: '1px solid var(--dash-border-soft, #cbd5e1)',
                              borderRadius: 8,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span
                                  className={`warehouse-kind-badge warehouse-kind-badge--${isSet ? 'set' : 'product'}`}
                                  style={{ margin: 0 }}
                                >
                                  {isSet ? 'Set' : 'Product'}
                                </span>
                                <span>{asm.name}</span>
                                {asm.family_sku ? (
                                  <span style={{ color: 'var(--dash-muted)', fontWeight: 500, fontSize: 13 }}>
                                    · {asm.family_sku}
                                  </span>
                                ) : null}
                              </div>
                              {isSet ? (
                                <div style={{ fontSize: 12, color: 'var(--dash-muted)', marginTop: 4 }}>
                                  Deducts {qtyNum} set{qtyNum === 1 ? '' : 's'} from Floor 1 &amp; prints{' '}
                                  {totalLabelsForLine} component Zebra label{totalLabelsForLine === 1 ? '' : 's'}:{' '}
                                  {comps
                                    .map((c) => `${c.perSetQty * qtyNum}× ${c.component?.name}`)
                                    .join(', ')}
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: 'var(--dash-muted)', marginTop: 4 }}>
                                  Deducts {qtyNum} from Floor 1 &amp; prints {totalLabelsForLine} Zebra label
                                  {totalLabelsForLine === 1 ? '' : 's'}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              <label style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Qty:</label>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={line.quantity}
                                onChange={(e) => updateLineQty(line.assembly_id, e.target.value)}
                                style={{
                                  width: 68,
                                  padding: '6px 8px',
                                  margin: 0,
                                  borderRadius: 6,
                                  border: '1px solid var(--dash-border, #cbd5e1)',
                                  textAlign: 'center',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => removeLineItem(line.assembly_id)}
                                title="Remove"
                                style={{
                                  width: 34,
                                  minWidth: 34,
                                  height: 34,
                                  padding: 0,
                                  margin: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 6,
                                  border: '1px solid #fca5a5',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                }}
                              >
                                <FaTrashAlt size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={submitBusy || !selectedCustomerId || !selectedLines.length}
                className="warehouse-catalog-action-btn warehouse-catalog-action-btn--primary"
                style={{
                  width: 'auto',
                  minWidth: 240,
                  maxWidth: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  margin: 0,
                  fontWeight: 700,
                }}
              >
                <FaPrint aria-hidden />
                <span>
                  {submitBusy ? 'Printing & Saving…' : 'Print Zebra Labels & Add to Sales Storage'}
                </span>
              </button>
            </form>
          )}
        </div>
      ) : null}

      <input
        type="search"
        className="warehouse-catalog-filter-control warehouse-catalog-search products-search-bar"
        placeholder="Search WST #, receipt, product, customer…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 420 }}
      />

      {loading && <div>Loading…</div>}
      {error ? <div role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</div> : null}
      {!loading && filtered.length === 0 && !error ? (
        <div style={{ color: 'var(--dash-muted)' }}>No sales storage records found.</div>
      ) : null}

      <div style={{ display: 'grid', gap: 12 }}>
        {filtered.map((row) => {
          const isReprinting = reprintBusyId === String(row.id);
          const rowSaleDate = row.sale_date || row?.metadata?.sale_date || '';
          return (
            <article
              key={row.id}
              style={{
                border: '1px solid var(--dash-border-soft, var(--dash-border))',
                borderRadius: 10,
                padding: 16,
                background: 'var(--dash-surface)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{row.storage_number || row.id}</div>
                  <div style={{ color: 'var(--dash-muted)', marginTop: 4 }}>
                    {formatWarehouseAdminDateTime(row.created_at)}
                    {rowSaleDate ? ` · Sale Date: ${formatSaleDateDisplay(rowSaleDate)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 600 }}>{String(row.status || '').replace(/_/g, ' ')}</span>
                  <button
                    type="button"
                    disabled={Boolean(reprintBusyId)}
                    onClick={() => handleReprint(row)}
                    title="Reprint Zebra label(s)"
                    style={{
                      width: 'auto',
                      minWidth: 0,
                      maxWidth: 'none',
                      height: 34,
                      padding: '0 12px',
                      margin: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 700,
                      borderRadius: 6,
                      cursor: reprintBusyId ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <FaPrint size={12} aria-hidden />
                    <span>{isReprinting ? 'Reprinting…' : 'Reprint'}</span>
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <strong>{row.assembly_name}</strong>
                {row.assembly_sku ? ` · ${row.assembly_sku}` : ''}
                {' · Qty '}
                {row.quantity}
              </div>
              {Array.isArray(row?.metadata?.printed_components)
              && row.metadata.item_kind === 'set'
              && row.metadata.printed_components.length > 0 ? (
                <div style={{ fontSize: 13, color: 'var(--dash-muted)', marginTop: 4 }}>
                  Printed components:{' '}
                  {row.metadata.printed_components
                    .map((c) => `${c.printed_qty}× ${c.name}`)
                    .join(', ')}
                </div>
              ) : null}
              <div style={{ color: 'var(--dash-muted)', marginTop: 6 }}>
                Sent by: {row.created_by_name || row.created_by_email || '—'}
              </div>
              <div style={{ color: 'var(--dash-muted)', marginTop: 4 }}>
                Receipt: {row.receipt_number || '—'}
                {row.customer_name ? ` · Customer: ${row.customer_name}` : ''}
                {row.customer_phone ? ` (${row.customer_phone})` : ''}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
