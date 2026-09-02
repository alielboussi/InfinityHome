/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps, no-empty-pattern */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaChevronDown, FaChevronRight, FaFilePdf, FaWhatsapp } from 'react-icons/fa';
import db from './dataClient';
import { fromPublic } from './dbSchema';
import useRealtimeRefresh from './hooks/useRealtimeRefresh';
import { fetchCanonicalFinancials } from './utils/financials';
import { cacheGet, cacheSet } from './utils/staleCache';
import { selectPrice } from './utils/setInventoryUtils';
import { applyInventoryBulk } from './utils/inventoryApi';
import { saveSaleEdit } from './services/salesEdit';
import { notifyLaybyWhatsApp, notifySaleWhatsApp, previewSaleWhatsAppForRow } from './services/whatsappNotify';
import { downloadPosSalePdf } from './services/whatsappPdfs';
import { isFahme } from './laybyRules';
import { filterLaybyStatementSales, isSystemMigrationSale, isSystemReceiptTag } from './utils/laybyStatementSales';
import { fetchMergedLaybyPayments } from './services/laybyPayments';
import { buildLaybySaleFinancials, computePooledLaybyTotalsByCurrency } from './utils/laybyRollup';
import { normalizeLaybyStatement } from './utils/laybyStatementNormalize';
import BackToDashboard from './BackToDashboard';
import { fetchPosLocationsViaApi } from './services/posCatalogApi';
import { getStartingDueBalance, applyStartingDueToTotalsByCurrency } from './utils/startingDueBalance';
import { logUserActivity } from './utils/userActivityLog';

function formatCurrency(amount, currency = 'K') {
  const n = Number(amount || 0);
  const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${formatted}`;
}
function escapeCsv(value) {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

const ALLSALES_CACHE_KEY = 'allsales:list:v12';

function AllSalesModalPortal({ open, onBackdropClick, children }) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="allsales-modal-overlay" onClick={onBackdropClick}>
      {children}
    </div>,
    document.body
  );
}
const ALLSALES_CACHE_TTL_MS = 10 * 60 * 1000;
const BALANCE_EPSILON = 0.000001;

function laybysForCustomer(laybyRows, customerId) {
  return (laybyRows || []).filter((layby) => String(layby?.customer_id) === String(customerId));
}

function filterStatementSalesForCustomer(sales, laybys) {
  return filterLaybyStatementSales(sales, laybys);
}

function normalizeAllSalesCurrency(cur) {
  const raw = String(cur || '').trim().toUpperCase();
  if (raw === '$' || raw === 'USD') return 'USD';
  return 'K';
}

function findLaybyForSale(sale, laybyById, laybyBySale) {
  const laybyId = sale?.layby_id != null ? String(sale.layby_id) : '';
  const saleId = sale?.id != null ? String(sale.id) : '';
  return (laybyId && laybyById[laybyId]) || (saleId && laybyBySale[saleId]) || null;
}

function findLocationByName(locationsMap, name) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return null;
  return Object.entries(locationsMap || {}).find(([, location]) => (
    String(location?.name || '').trim().toLowerCase() === needle
  )) || null;
}

function formatDisplayReceipt(sale) {
  const raw = String(sale?.receipt_number || '').trim();
  if (isSystemReceiptTag(raw)) return '—';
  if (raw) return raw;
  if (sale?.id != null) return `#${sale.id}`;
  return '—';
}

function resolveLocationByName(locationsMap, name) {
  const match = findLocationByName(locationsMap, name);
  if (!match) return null;
  return { id: match[0], name: match[1]?.name || name };
}

function customerLocationHints(customer) {
  return [customer?.city, customer?.address]
    .map((value) => String(value || '').trim())
    .filter((value) => value && !['0', '-'].includes(value));
}

function resolveSaleLocation(sale, locationsMap, customer) {
  const storedLocationId = sale?.location_id != null ? String(sale.location_id) : '';
  if (storedLocationId) {
    return {
      id: storedLocationId,
      name: locationsMap[storedLocationId]?.name || `Location ${storedLocationId}`,
    };
  }

  if (isSystemMigrationSale(sale)) {
    const kitwe = resolveLocationByName(locationsMap, 'Kitwe');
    if (kitwe) return kitwe;
    return { id: '', name: 'Kitwe' };
  }

  for (const hint of customerLocationHints(customer)) {
    const resolved = resolveLocationByName(locationsMap, hint);
    if (resolved) return resolved;
    return { id: '', name: hint };
  }

  const kitwe = resolveLocationByName(locationsMap, 'Kitwe');
  if (kitwe) return kitwe;

  return { id: '', name: 'Unassigned' };
}

export default function AllSales() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customersMap, setCustomersMap] = useState({});
  const [locationsMap, setLocationsMap] = useState({});
  const [aggregatesByCustomer, setAggregatesByCustomer] = useState({}); // customerId -> { total, paid, outstanding, currency }
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [editing, setEditing] = useState(null); // { sale, layby }
  const [saving, setSaving] = useState(false);
  // Removed: markingId state since Mark Layby action is no longer supported
  const [editItems, setEditItems] = useState([]); // current sale items lines
  const [itemsLoading, setItemsLoading] = useState(false);
  // Modal items pagination to avoid modal scroll
  const [itemsPage, setItemsPage] = useState(1);
  const itemsPageSize = 8;
  const itemsPageCount = Math.max(1, Math.ceil((editItems.length || 0) / itemsPageSize));
  const itemsCurrentPage = Math.min(itemsPage, itemsPageCount);
  const itemsStartIndex = (itemsCurrentPage - 1) * itemsPageSize;
  const itemsEndIndex = itemsStartIndex + itemsPageSize;
  const visibleItems = editItems.slice(itemsStartIndex, itemsEndIndex);
  // Show all rows; no pagination

  // Catalog picker state for adding items from products/sets
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [catalogProducts, setCatalogProducts] = useState([]); // [{id,name,sku,price,promotional_price,currency}]
  const [catalogSets, setCatalogSets] = useState([]); // mapped combos with {id,name,sku,price,promotional_price,currency}
  const [comboItemsByCombo, setComboItemsByCombo] = useState({}); // combo_id -> [{product_id, quantity}]

  // Load minimal catalog when opening picker the first time
  useEffect(() => {
    if (!showPicker) return;
    (async () => {
      try {
        // Fetch products (all) and combos with their items
        const [prodRes, comboRes, comboItemsRes] = await Promise.all([
          fromPublic('products').select('id, name, sku, price, promotional_price, currency'),
          fromPublic('combos').select('id, combo_name, sku, standard_price, promotional_price, combo_price, currency'),
          fromPublic('combo_items').select('combo_id, product_id, quantity'),
        ]);
        const prods = prodRes.data || [];
        setCatalogProducts(prods);
        const combos = comboRes.data || [];
        const sets = combos.map(c => ({
          id: c.id,
          name: c.combo_name,
          sku: c.sku,
          price: (c.combo_price ?? c.standard_price ?? 0),
          promotional_price: (c.promotional_price ?? 0),
          currency: c.currency || 'K',
          __isSet: true,
        }));
        setCatalogSets(sets);
        const comboItems = comboItemsRes.data || [];
        const map = {};
        comboItems.forEach(ci => {
          const k = String(ci.combo_id);
          (map[k] = map[k] || []).push({ product_id: ci.product_id, quantity: Number(ci.quantity || 0) });
        });
        setComboItemsByCombo(map);
      } catch {}
    })();
  }, [showPicker]);

  const addProductLine = (product) => {
    const line = {
      _key: `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      product_id: product.id,
      display_name: null,
      quantity: 1,
      unit_price: Number(selectPrice(product.promotional_price, product.price) || 0),
      currency: editing?.currency || product.currency || 'K',
      color: '',
    };
    setEditItems(items => {
      const next = [...items, line];
      const pc = Math.max(1, Math.ceil(next.length / itemsPageSize));
      setItemsPage(pc);
      return next;
    });
  };

  const addSetLines = (setRow) => {
    const groupId = `set-${setRow.id}-${Date.now()}`;
    const unit = Number(selectPrice(setRow.promotional_price, setRow.price) || 0);
    const currency = editing?.currency || setRow.currency || 'K';
    const parent = {
      _key: `${groupId}-parent`,
      product_id: null,
      display_name: setRow.name || 'Set',
      quantity: 1,
      unit_price: unit,
      currency,
      color: '',
    };
    // Components with zero price
    const components = (comboItemsByCombo[String(setRow.id)] || []).map((ci, idx) => ({
      _key: `${groupId}-c${idx}`,
      product_id: ci.product_id,
      display_name: null,
      quantity: Number(ci.quantity || 0),
      unit_price: 0,
      currency,
      color: '',
    }));
    setEditItems(items => {
      const next = [...items, parent, ...components];
      const pc = Math.max(1, Math.ceil(next.length / itemsPageSize));
      setItemsPage(pc);
      return next;
    });
  };

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ open: false, saleId: null, meta: null, pin: '', loading: false, error: '' });
  const [whatsappSaleId, setWhatsappSaleId] = useState(null);
  const [pdfSaleId, setPdfSaleId] = useState(null);
  const [expandedCustomers, setExpandedCustomers] = useState(() => new Set());
  const [itemsBySaleId, setItemsBySaleId] = useState({});
  const [itemsLoadingCustomerId, setItemsLoadingCustomerId] = useState(null);
  const [whatsappPreview, setWhatsappPreview] = useState({
    open: false,
    loading: false,
    title: '',
    message: '',
    attachmentNote: '',
    error: '',
  });

  useEffect(() => {
    const modalOpen = Boolean(editing) || showPicker || deleteModal.open || whatsappPreview.open;
    if (!modalOpen || typeof document === 'undefined') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [editing, showPicker, deleteModal.open, whatsappPreview.open]);
  const getCurrentUser = () => {
    try { const raw = localStorage.getItem('user'); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  // Manager PIN requirement removed; leave env var unused
  const REQUIRED_PIN = '';

  // Shared loader to populate sales list with customer join and full customers list
  const loadAll = async () => {
    // Serve cached snapshot immediately
    try {
      const snap = cacheGet(ALLSALES_CACHE_KEY);
      if (snap && Array.isArray(snap)) {
        setSales(snap);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch { setLoading(true); }
    setLoadError('');
    try {
      const salesRes = await fromPublic('sales')
        .select('id, sale_id, sale_date, created_at, customer_id, location_id, layby_id, status, currency, total_amount, discount, receipt_number, vat_apply, vat_inclusive, vat_rate')
        .order('sale_date', { ascending: false });
      if (salesRes.error) throw salesRes.error;

      const [custRes, locRes] = await Promise.all([
        fromPublic('customers').select('id, name, phone, currency, city, address, starting_due_balance'),
        fromPublic('locations').select('id, name'),
      ]);
      // Declare salesRows up-front to avoid TDZ errors when referenced below
      const salesRows = salesRes.data || [];
      // salesRows already declared above
      let custRows = custRes.error ? [] : (custRes.data || []);
      let locRows = locRes.error ? [] : (locRes.data || []);
      if (custRes.error || custRows.length === 0) {
        try {
          const resp = await fetch('/api/customers');
          const json = await resp.json();
          if (json?.ok && Array.isArray(json.rows)) custRows = json.rows;
        } catch {}
      }
      if (locRes.error || locRows.length === 0) {
        try {
          locRows = await fetchPosLocationsViaApi();
        } catch {}
      }
      setCustomers(custRows);
      const cMap = (custRows || []).reduce((acc, c) => { if (c?.id) acc[String(c.id)] = c; return acc; }, {});
      setCustomersMap(cMap);
      const lMap = (locRows || []).reduce((acc, l) => { if (l?.id) acc[String(l.id)] = l; return acc; }, {});
      setLocationsMap(lMap);
      const saleIds = (salesRows || []).map(s => s.id);

      // Fetch laybys using both current linkage paths: sales.layby_id and laybys.sale_id.
      let laybyBySale = {};
      let laybyById = {};
      let vfMap = {};
      let paymentAggBySale = new Map();
      let laybyPaymentRows = [];
      let laybyRowsArray = [];
      if (saleIds.length > 0) {
        const laybyIdsFromSales = Array.from(new Set((salesRows || []).map(s => s.layby_id).filter(Boolean)));
        const [laybyBySaleRes, laybyByIdRes] = await Promise.all([
          db
            .from('laybys')
            .select('id, sale_id, customer_id, total_amount, paid_amount, status, notes, created_at, updated_at')
            .in('sale_id', saleIds),
          laybyIdsFromSales.length
            ? db
                .from('laybys')
                .select('id, sale_id, customer_id, total_amount, paid_amount, status, notes, created_at, updated_at')
                .in('id', laybyIdsFromSales)
            : Promise.resolve({ data: [], error: null }),
        ]);
        const laybyRows = Array.from(
          new Map(
            [
              ...(laybyBySaleRes.data || []),
              ...(laybyByIdRes.data || []),
            ].map((row) => [String(row.id), row])
          ).values()
        );
        laybyRowsArray = laybyRows;
        laybyRows.forEach((layby) => {
          laybyById[String(layby.id)] = layby;
          if (layby.sale_id != null) laybyBySale[String(layby.sale_id)] = layby;
        });

        const finMap = await fetchCanonicalFinancials(db, saleIds);
        finMap.forEach((value, key) => { vfMap[String(key)] = value; });

        const laybySaleIds = (salesRows || [])
          .filter((sale) => String(sale?.status || '').toLowerCase() === 'layby' || sale?.layby_id != null)
          .map((sale) => sale.id)
          .filter((id) => id != null);
        if (laybySaleIds.length) {
          const { data: payRows } = await fetchMergedLaybyPayments({ saleIds: laybySaleIds });
          laybyPaymentRows = payRows || [];
          laybyPaymentRows.forEach((payment) => {
            const key = String(payment?.sale_id || '');
            if (!key) return;
            const existing = paymentAggBySale.get(key) || { paid: 0, paymentDiscount: 0 };
            existing.paid += Number(payment?.amount || 0);
            existing.paymentDiscount += Number(payment?.discount_amount || 0);
            paymentAggBySale.set(key, existing);
          });
        }
      }

      // Merge sales with canonical financials and current layby linkage.
      let enriched = (salesRows || []).map(s => {
        const layby = findLaybyForSale(s, laybyById, laybyBySale);
        const vf = vfMap[String(s.id)] || null;
        const paymentAgg = paymentAggBySale.get(String(s.id)) || { paid: 0, paymentDiscount: 0 };
        const total = vf ? Number(vf.total_due || 0) : Number(s.total_amount || 0);
        const finPaid = vf ? Number(vf.paid_amount || 0) : 0;
        const laybyPaid = layby ? Number(layby.paid_amount || 0) : 0;
        const paymentPaid = Number(paymentAgg.paid || 0);
        const paymentDiscount = Number(paymentAgg.paymentDiscount || 0);
        const discount = vf ? Number(vf.discount_amount || 0) : Number(s.discount || 0);
        const paid = Math.max(finPaid, laybyPaid, paymentPaid);
        const dueFallback = Math.max(0, total - paid - Math.max(0, discount) - Math.max(0, paymentDiscount));
        const finOutstanding = Number(vf?.outstanding_amount);
        const finLooksStale = Number.isFinite(finOutstanding)
          && paymentPaid > 0
          && finOutstanding > dueFallback + 0.009;
        const outstanding = (Number.isFinite(finOutstanding) && !finLooksStale)
          ? Math.max(0, finOutstanding)
          : dueFallback;
        const isLayby = String(s.status || '').toLowerCase() === 'layby' || !!layby || !!s.layby_id;
        // Compute display status aligned with business rules:
        // - completed = due balance is 0 AND layby closed
        // - layby = no payments yet added
        // - active = payments added but due not yet closed (or due zero but not closed)
        let computedStatus = s.status || 'completed';
        if (isLayby) {
          const hasPayments = paid > BALANCE_EPSILON;
          const isDueZero = outstanding <= BALANCE_EPSILON;
          const isClosed = (layby && String(layby.status).toLowerCase() === 'completed') || String(s.status).toLowerCase() === 'completed';
          if (!hasPayments) {
            computedStatus = 'layby';
          } else if (!isDueZero) {
            computedStatus = 'active';
          } else if (isDueZero && isClosed) {
            computedStatus = 'completed';
          } else {
            // Due is zero but not closed yet
            computedStatus = 'active';
          }
        }
        const customer = cMap[String(s.customer_id)] || { id: s.customer_id, name: s.customer_id ? `Customer ${s.customer_id}` : 'Unknown', phone: '' };
        const receipt = formatDisplayReceipt(s);
        const resolvedLocation = resolveSaleLocation(s, lMap, customer);
        return {
          ...s,
          location_id: s.location_id || resolvedLocation.id || null,
          total_amount: total,
          receipt,
          isLayby,
          layby,
          paid,
          outstanding,
          computedStatus,
          customerName: customer.name,
          customer,
          locationName: resolvedLocation.name,
        };
      });

      // Align layby customers with /layby-management: filter PDF rollup duplicates
      // and allocate deposits to sales using the same statement rollup logic.
      try {
        const saleFinMap = new Map();
        const aggs = {};
        const byCustomer = new Map();
        (enriched || []).forEach((row) => {
          const key = String(row.customer_id || '');
          if (!key) return;
          if (!byCustomer.has(key)) byCustomer.set(key, []);
          byCustomer.get(key).push(row);
        });

        for (const [customerId, rows] of byCustomer.entries()) {
          const laybys = laybysForCustomer(laybyRowsArray, customerId);
          const hasLaybyActivity = rows.some((row) => row.isLayby);
          const currency = normalizeAllSalesCurrency(
            rows[0]?.customer?.currency || rows[0]?.currency || cMap[customerId]?.currency || 'K'
          );

          if (!hasLaybyActivity) {
            const base = rows.reduce((acc, row) => {
              acc.total += Number(row.total_amount || 0);
              acc.paid += Number(row.paid || 0);
              acc.outstanding += Number(row.outstanding || 0);
              return acc;
            }, { total: 0, paid: 0, outstanding: 0 });
            const totalsByCurrency = applyStartingDueToTotalsByCurrency(
              { [currency]: { total: base.total, paid: base.paid, discount: 0, due: base.outstanding } },
              cMap[customerId] || {},
            );
            const bucket = totalsByCurrency[currency] || { total: base.total, paid: base.paid, due: base.outstanding };
            aggs[customerId] = {
              total: Number(bucket.total || 0),
              paid: Number(bucket.paid || 0),
              outstanding: Number(bucket.due || 0),
              currency,
            };
            continue;
          }

          const statementRows = filterStatementSalesForCustomer(rows, laybys);
          const statementSales = statementRows.map((row) => {
            const vf = vfMap[String(row.id)] || {};
            const vatInclusive = row.vat_inclusive === true
              || String(row.vat_inclusive || '').toLowerCase() === 'true';
            return {
              sale_id: row.id,
              id: row.id,
              sale_date: row.sale_date,
              created_at: row.created_at,
              currency: row.currency,
              total_due: Number(vf.total_due ?? row.total_amount ?? 0),
              total_amount: Number(vf.total_due ?? row.total_amount ?? 0),
              discount_amount: Number(vf.discount_amount ?? row.discount ?? 0),
              subtotal_before_discount: Number(vf.subtotal_before_discount ?? row.total_amount ?? 0),
              vat_apply: vatInclusive ? false : Boolean(row.vat_apply ?? vf.vat_apply),
              vat_inclusive: vatInclusive,
              vat_rate: Number(row.vat_rate ?? vf.vat_rate ?? 0),
            };
          });
          const { data: customerPaymentRows } = await fetchMergedLaybyPayments({
            customerId,
            saleIds: statementRows.map((row) => row.id),
          });
          const statementPayments = (customerPaymentRows || [])
            .map((payment) => ({ ...payment, payment_type: String(payment.payment_type || '').toLowerCase() }));
          const normalized = normalizeLaybyStatement({
            sales: statementSales,
            items: [],
            payments: statementPayments,
          });
          buildLaybySaleFinancials(normalized).forEach((fin) => {
            saleFinMap.set(String(fin.saleId), fin);
          });
          const totalsByCurrency = applyStartingDueToTotalsByCurrency(
            computePooledLaybyTotalsByCurrency(normalized),
            cMap[customerId] || {},
          );
          const bucket = totalsByCurrency[currency]
            || totalsByCurrency.USD
            || totalsByCurrency[Object.keys(totalsByCurrency)[0]]
            || { total: 0, paid: 0, due: 0 };
          aggs[customerId] = {
            total: Number(bucket.total || 0),
            paid: Number(bucket.paid || 0),
            outstanding: Number(bucket.due || 0),
            currency,
          };
        }

        enriched = enriched.map((row) => {
          const fin = saleFinMap.get(String(row.id));
          const customerId = String(row.customer_id || '');
          const laybys = laybysForCustomer(laybyRowsArray, customerId);
          const inStatement = filterStatementSalesForCustomer([row], laybys).length > 0;
          const customerRows = byCustomer.get(customerId) || [];
          const hasLaybyActivity = customerRows.some((entry) => entry.isLayby);

          if (!fin) {
            if (hasLaybyActivity && row.isLayby && !inStatement) {
              return { ...row, excludeFromList: true };
            }
            return row;
          }

          const outstanding = Number(fin.due || 0);
          const paid = Number(fin.paid || 0);
          let computedStatus = row.computedStatus || row.status || 'completed';
          if (row.isLayby) {
            if (outstanding <= BALANCE_EPSILON) {
              computedStatus = 'completed';
            } else if (paid > BALANCE_EPSILON) {
              computedStatus = 'active';
            } else {
              computedStatus = 'layby';
            }
          }

          return {
            ...row,
            total_amount: Number(fin.total || 0),
            paid,
            outstanding,
            computedStatus,
            excludeFromList: false,
          };
        });
        setAggregatesByCustomer(aggs);
      } catch {
        setAggregatesByCustomer({});
      }
      setSales(enriched);
      try { cacheSet(ALLSALES_CACHE_KEY, enriched, ALLSALES_CACHE_TTL_MS); } catch {}
    } catch (err) {
      console.error('Failed to load all sales', err);
      setLoadError(err?.message || 'Failed to load sales.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Recompute layby rollup for a given layby id after mutations
  const recomputeLaybyRollup = async (laybyId) => {
    if (!laybyId) return;
    try {
      const { data: laybyRow } = await fromPublic('laybys')
        .select('id, sale_id')
        .eq('id', laybyId)
        .maybeSingle();

      const { data: linkedByLaybyId } = await fromPublic('sales')
        .select('id, total_amount')
        .eq('layby_id', laybyId);

      const salesById = new Map();
      (linkedByLaybyId || []).forEach((sale) => {
        if (sale?.id != null) salesById.set(String(sale.id), sale);
      });
      if (laybyRow?.sale_id != null && !salesById.has(String(laybyRow.sale_id))) {
        const { data: baseSale } = await fromPublic('sales')
          .select('id, total_amount')
          .eq('id', laybyRow.sale_id)
          .maybeSingle();
        if (baseSale?.id != null) salesById.set(String(baseSale.id), baseSale);
      }

      const linkedSales = Array.from(salesById.values());
      const saleIds = linkedSales.map((sale) => sale.id);
      if (!saleIds.length) {
        // No more sales linked: remove layby entirely
        await fromPublic('laybys').delete().eq('id', laybyId);
        return;
      }

      const baseSalesById = linkedSales.reduce((acc, sale) => {
        acc[String(sale.id)] = sale;
        return acc;
      }, {});
      const finMap = await fetchCanonicalFinancials(db, saleIds);
      const totals = saleIds.reduce((acc, saleId) => {
        const fin = finMap.get(String(saleId));
        const base = baseSalesById[String(saleId)];
        const total = Number(fin?.total_due ?? base?.total_amount ?? 0);
        const paid = Number(fin?.paid_amount || 0);
        const outstanding = Number(fin?.outstanding_amount ?? Math.max(0, total - paid));
        acc.total += total;
        acc.paid += paid;
        acc.outstanding += outstanding;
        return acc;
      }, { total: 0, paid: 0, outstanding: 0 });
      const status = totals.outstanding <= BALANCE_EPSILON ? 'completed' : 'active';

      await fromPublic('laybys')
        .update({ total_amount: totals.total, paid_amount: totals.paid, status, updated_at: new Date().toISOString() })
        .eq('id', laybyId);
    } catch (err) {
      console.warn('recomputeLaybyRollup failed', err);
    }
  };

  const downloadSalePdf = async (row) => {
    if (!row?.id) return;
    const saleId = row.id;
    setPdfSaleId(saleId);
    try {
      const result = await downloadPosSalePdf({ saleId });
      if (!result?.ok) {
        window.alert(result?.error || 'PDF download failed.');
      }
    } catch (err) {
      window.alert(err?.message || 'PDF download failed.');
    } finally {
      setPdfSaleId(null);
    }
  };

  const openWhatsAppPreview = async (row) => {
    if (!row?.id) return;
    const receipt = row.receipt || row.receipt_number || row.id;
    setWhatsappPreview({
      open: true,
      loading: true,
      title: `WhatsApp preview — ${receipt}`,
      message: '',
      attachmentNote: '',
      error: '',
    });
    try {
      const result = await previewSaleWhatsAppForRow(row);
      if (!result?.ok) {
        setWhatsappPreview((prev) => ({
          ...prev,
          loading: false,
          error: result?.error || 'Could not build WhatsApp preview.',
        }));
        return;
      }
      setWhatsappPreview((prev) => ({
        ...prev,
        loading: false,
        message: result.message || '',
        attachmentNote: result.attachmentNote || '',
      }));
    } catch (err) {
      setWhatsappPreview((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Could not build WhatsApp preview.',
      }));
    }
  };

  const resendSaleWhatsApp = async (row) => {
    if (!row?.id) return;
    const saleId = row.id;
    const customerId = row.customer_id;
    const laybyId = row.layby_id || row.layby?.id || null;
    setWhatsappSaleId(saleId);
    try {
      let result;
      if (isFahme(customerId)) {
        result = await notifyLaybyWhatsApp({
          laybyId,
          customerId,
          eventType: 'statement',
          saleId,
          locationId: row.location_id,
        });
      } else if (
        String(row.computedStatus || row.status || '').toLowerCase() === 'layby'
        || (laybyId && Number(row.outstanding || 0) > BALANCE_EPSILON)
      ) {
        const eventType = Number(row.paid || 0) <= BALANCE_EPSILON ? 'new_layby' : 'layby_addition';
        result = await notifyLaybyWhatsApp({
          laybyId,
          customerId,
          eventType,
          saleId,
          locationId: row.location_id,
        });
      } else {
        result = await notifySaleWhatsApp({ saleId });
      }
      if (!result?.ok) {
        window.alert(result?.error || 'WhatsApp send failed.');
      } else {
        window.alert('WhatsApp message sent.');
      }
    } catch (err) {
      window.alert(err?.message || 'WhatsApp send failed.');
    } finally {
      setWhatsappSaleId(null);
    }
  };

  // Open delete confirmation modal and fetch impact meta
  const openDeleteConfirm = async (row) => {
    if (!row?.id) return;
    const saleId = row.id;
    setDeleteModal({ open: true, saleId, meta: null, pin: '', loading: true, error: '' });
    try {
      const [{ data: sale }, { data: items }, { data: pays }, { data: layby }] = await Promise.all([
        fromPublic('sales').select('id, location_id, layby_id, customer_id, currency, total_amount, receipt_number').eq('id', saleId).maybeSingle(),
        fromPublic('sales_items').select('product_id, quantity, display_name').eq('sale_id', saleId),
        fromPublic('sales_payments').select('amount, payment_type').eq('sale_id', saleId),
        row?.layby?.id || row?.layby_id
          ? fromPublic('laybys').select('id, sale_id, status').eq('id', row?.layby?.id || row?.layby_id).maybeSingle()
          : fromPublic('laybys').select('id, sale_id, status').eq('sale_id', saleId).maybeSingle(),
      ]);
      const paymentsNonCredit = (pays || []).filter(p => String(p.payment_type || '').toLowerCase() !== 'credit');
      const paymentsSum = paymentsNonCredit.reduce((s, p) => s + Number(p.amount || 0), 0);
      const byProduct = new Map();
      (items || []).forEach(it => {
        const key = String(it.product_id || it.display_name || 'custom');
        byProduct.set(key, Number(byProduct.get(key) || 0) + Number(it.quantity || 0));
      });
      const willRestore = Array.from(byProduct.entries()).map(([k, qty]) => ({ key: k, qty }));
      const meta = {
        sale,
        itemsCount: (items || []).length,
        totalQty: (items || []).reduce((s, it) => s + Number(it.quantity || 0), 0),
        paymentsCount: paymentsNonCredit.length,
        paymentsSum,
        layby: layby || null,
        willRestore,
      };
      setDeleteModal(dm => ({ ...dm, meta, loading: false }));
    } catch (err) {
      console.error('Failed to load delete meta', err);
      setDeleteModal({ open: true, saleId, meta: null, pin: '', loading: false, error: 'Failed to load details. You can still delete, but details are unavailable.' });
    }
  };

  // Confirm deletion; restore inventory with audit rows (PIN removed)
  const confirmDeleteSale = async () => {
    const dm = deleteModal;
    if (!dm.open || !dm.saleId) return;
    const user = getCurrentUser();
    setDeleteModal(curr => ({ ...curr, loading: true, error: '' }));
    try {
      // Fetch sale meta if not already
  const sale = dm.meta?.sale || (await fromPublic('sales').select('id, location_id, layby_id, customer_id').eq('id', dm.saleId).maybeSingle()).data;
      const restoreLocation = sale?.location_id || null;
      // capture layby linkage before any updates so we can detach it safely
      const laybyId = sale?.layby_id || dm.meta?.layby?.id || null;
  const items = dm.meta ? null : (await fromPublic('sales_items').select('product_id, quantity').eq('sale_id', dm.saleId)).data;
      const itemsList = dm.meta?.willRestore || (items || []).map(it => ({ key: String(it.product_id || 'custom'), qty: Number(it.quantity || 0) }));

      // Restore inventory for this sale at its location and insert audit rows
      for (const it of (dm.meta?.willRestore ? (dm.meta.sale && (await fromPublic('sales_items').select('product_id, quantity').eq('sale_id', dm.saleId)).data) : (items || [])) || []) {
        if (!it.product_id || !restoreLocation) continue;
        const { data: invRows } = await fromPublic('inventory')
          .select('id, quantity')
          .eq('product_id', it.product_id)
          .eq('location', restoreLocation);
        const rows = invRows || [];
        const nowIso = new Date().toISOString();
        const deltaQty = Number(it.quantity || 0);
        if (rows.length === 0) {
          await applyInventoryBulk({
            inserts: [{ product_id: it.product_id, location: restoreLocation, quantity: deltaQty, updated_at: nowIso }],
          }, db);
        } else {
          const targetRow = rows.length === 1
            ? rows[0]
            : rows.sort((a, b) => Number(a.id) - Number(b.id))[0];
          const newQty = (Number(targetRow.quantity) || 0) + deltaQty;
          await applyInventoryBulk({
            updates: [{ id: targetRow.id, quantity: newQty, updated_at: nowIso }],
          }, db);
        }
        // Inventory audit row
        try {
          await fromPublic('inventory_adjustments').insert({
            product_id: it.product_id,
            location_id: restoreLocation,
            quantity: deltaQty,
            adjustment_type: 'sale_delete_restore',
            adjusted_at: new Date().toISOString(),
            metadata: {
              reason: 'Sale deleted restore',
              sale_id: dm.saleId,
              user_id: user?.id || null,
              user_name: user?.name || user?.email || null,
            },
          });
        } catch (auditErr) {
          console.warn('Inventory audit insert failed', auditErr);
        }
      }

      // If this sale is linked to a layby record, clear the FK before deleting to avoid constraint failures
      try {
        const detach = fromPublic('laybys')
          .update({ sale_id: null })
          .eq('sale_id', dm.saleId);
        const scoped = laybyId ? detach.eq('id', laybyId) : detach;
        await scoped;
      } catch (linkErr) {
        console.warn('Failed to detach layby from sale before delete', linkErr);
      }

      // Remove child records first for safety
  await fromPublic('sales_payments').delete().eq('sale_id', dm.saleId);
  await fromPublic('sales_items').delete().eq('sale_id', dm.saleId);
      // Remove sale
  await fromPublic('sales').delete().eq('id', dm.saleId);
      // If linked to a layby, recompute or remove the layby
      if (laybyId) await recomputeLaybyRollup(laybyId);

      // Refresh list
      await loadAll();
      setDeleteModal({ open: false, saleId: null, meta: null, pin: '', loading: false, error: '' });
      alert('Sale deleted. Inventory restored and balances updated.');
    } catch (err) {
      console.error(err);
      setDeleteModal(curr => ({ ...curr, loading: false, error: 'Failed to delete sale: ' + (err.message || err) }));
    }
  };

  // Realtime: minimize channels — refresh on sales and sales_payments only
  const rtTick = useRealtimeRefresh(['sales', 'sales_payments', 'laybys'], 300);
  useEffect(() => { if (!loading) { loadAll(); } }, [rtTick]);

  const locationOptions = useMemo(() => {
    const map = locationsMap || {};
    const options = Object.keys(map).map(id => ({ id, name: map[id]?.name || id }));
    if (options.length) return options.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const fallback = {};
    (sales || []).forEach(r => {
      if (!r?.location_id) return;
      fallback[String(r.location_id)] = r.locationName || String(r.location_id);
    });
    return Object.keys(fallback).map(id => ({ id, name: fallback[id] }));
  }, [locationsMap, sales]);

  const filtered = useMemo(() => {
    const s = (search || '').toLowerCase().trim();
    return sales.filter(row => {
      if (row.excludeFromList) return false;
      if (selectedLocation !== 'all') {
        if (String(row.location_id || '') !== String(selectedLocation)) return false;
      }
      const rec = String(row.receipt || '').toLowerCase();
      const name = String(row.customerName || '').toLowerCase();
      const loc = String(row.locationName || '').toLowerCase();
      const total = String(row.total_amount || '').toLowerCase();
      const paid = String(row.paid || '').toLowerCase();
      const due = String(row.outstanding || '').toLowerCase();
      if (!s) return true;
      return rec.includes(s) || name.includes(s) || loc.includes(s) || total.includes(s) || paid.includes(s) || due.includes(s);
    });
  }, [sales, search, selectedLocation]);

  const sortedRows = useMemo(() => {
    const rows = [...filtered];
    if (sortBy === 'location') {
      rows.sort((a, b) => {
        const al = String(a.locationName || '').toLowerCase();
        const bl = String(b.locationName || '').toLowerCase();
        if (al !== bl) return al.localeCompare(bl);
        const ta = new Date(a.sale_date || a.created_at || 0).getTime();
        const tb = new Date(b.sale_date || b.created_at || 0).getTime();
        return tb - ta;
      });
      return rows;
    }
    rows.sort((a, b) => {
      const ta = new Date(a.sale_date || a.created_at || 0).getTime();
      const tb = new Date(b.sale_date || b.created_at || 0).getTime();
      return tb - ta;
    });
    return rows;
  }, [filtered, sortBy]);

  const customerGroups = useMemo(() => {
    const groups = [];
    const indexByCustomer = new Map();
    sortedRows.forEach((row) => {
      const customerKey = String(row.customer_id || row.customerName || 'unknown');
      if (!indexByCustomer.has(customerKey)) {
        const entry = { customerKey, customerId: row.customer_id, customerName: row.customerName, rows: [] };
        indexByCustomer.set(customerKey, entry);
        groups.push(entry);
      }
      indexByCustomer.get(customerKey).rows.push(row);
    });
    groups.forEach((group) => {
      const hasLaybyActivity = (group.rows || []).some((row) => row.isLayby);
      if (!hasLaybyActivity) return;
      group.rows.sort((a, b) => {
        const ta = new Date(a.sale_date || a.created_at || 0).getTime();
        const tb = new Date(b.sale_date || b.created_at || 0).getTime();
        return ta - tb;
      });
    });
    return groups;
  }, [sortedRows]);

  const ensureSaleItemsLoaded = async (saleIds) => {
    const missing = (saleIds || []).map((id) => String(id)).filter((id) => id && !itemsBySaleId[id]);
    if (!missing.length) return;
    const { data, error } = await fromPublic('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .in('sale_id', missing);
    if (error) throw error;
    const productIds = [...new Set((data || []).map((row) => row?.product_id).filter(Boolean))];
    let productNames = {};
    if (productIds.length) {
      const { data: products } = await fromPublic('products').select('id, name').in('id', productIds);
      productNames = Object.fromEntries((products || []).map((product) => [String(product.id), product.name]));
    }
    setItemsBySaleId((prev) => {
      const next = { ...prev };
      (data || []).forEach((item) => {
        const saleId = String(item?.sale_id || '');
        if (!saleId) return;
        if (!next[saleId]) next[saleId] = [];
        next[saleId].push({
          ...item,
          label: String(item?.display_name || productNames[String(item?.product_id)] || 'Product').trim(),
        });
      });
      missing.forEach((saleId) => {
        if (!next[saleId]) next[saleId] = [];
      });
      return next;
    });
  };

  const toggleCustomerExpanded = async (group) => {
    const customerKey = String(group?.customerKey || '');
    if (!customerKey) return;
    const willExpand = !expandedCustomers.has(customerKey);
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(customerKey)) next.delete(customerKey);
      else next.add(customerKey);
      return next;
    });
    if (!willExpand) return;
    try {
      setItemsLoadingCustomerId(customerKey);
      await ensureSaleItemsLoaded((group?.rows || []).map((row) => row.id));
    } catch (err) {
      console.error('Failed to load sale items', err);
    } finally {
      setItemsLoadingCustomerId(null);
    }
  };

  const handleExportCsv = () => {
    if (!sortedRows.length) return;
    const header = [
      'sale_id',
      'sale_date',
      'receipt_number',
      'customer_name',
      'location_name',
      'status',
      'currency',
      'total_amount',
      'paid_amount',
      'outstanding_amount'
    ];
    const lines = sortedRows.map(row => [
      row.id,
      row.sale_date || row.created_at || '',
      row.receipt || '',
      row.customerName || row.customer_id || '',
      row.locationName || row.location_id || '',
      row.computedStatus || row.status || '',
      row.currency || '',
      Number(row.total_amount || 0),
      Number(row.paid || 0),
      Number(row.outstanding || 0),
    ].map(escapeCsv).join(','));
    const csv = [header.map(escapeCsv).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `All_Sales_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // no pagination state or effects

  const openEdit = async (row) => {
    const layby = row.layby || null;
      setEditing({
      saleId: row.id,
      receipt: row.receipt || formatDisplayReceipt(row),
      sale_date: row.sale_date ? row.sale_date.substring(0, 10) : '',
      customer_id: row.customer_id,
      status: row.status || 'completed',
      currency: row.currency || (customersMap[row.customer_id]?.currency || 'K'),
      total_amount: Number(row.total_amount || 0),
      discount: Number(row.discount || 0),
      layby_id: layby?.id || row.layby_id || null,
      layby_status: layby?.status || (row.status === 'layby' ? 'active' : 'completed'),
      layby_notes: layby?.notes || '',
      layby_total_amount: Number((layby?.total_amount != null ? layby.total_amount : row.total_amount) || 0),
    });
    // Load sale items for this sale
    setItemsLoading(true);
    const { data: items } = await db
      .from('sales_items')
      .select('id, product_id, display_name, quantity, unit_price, currency, color')
      .eq('sale_id', row.id)
      .order('id', { ascending: true });
    setEditItems((items || []).map(it => ({ ...it, _key: it.id })));
    setItemsLoading(false);
    setItemsPage(1);
  };

  const closeEdit = () => setEditing(null);

  // Removed: markAsLayby action and related logic

  // Removed: Set Correct Status helpers (per-sale and per-customer)

  // Live-recalculate totals in the edit dialog whenever items or discount change
  useEffect(() => {
    if (!editing) return;
    // Compute subtotal from current editItems
    const newSubtotal = (editItems || []).reduce((sum, it) => sum + (Number(it.unit_price || 0) * Number(it.quantity || 0)), 0);
    const computedTotal = Math.max(0, newSubtotal - Number(editing.discount || 0));
    if (Number(editing.total_amount || 0) !== computedTotal || (editing.status === 'layby' && Number(editing.layby_total_amount || 0) !== computedTotal)) {
      setEditing(prev => prev ? {
        ...prev,
        total_amount: computedTotal,
        layby_total_amount: prev.status === 'layby' ? computedTotal : prev.layby_total_amount,
      } : prev);
    }
  }, [editItems, editing?.discount, editing?.status]);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const itemsPayload = (editItems || []).map(line => ({
        product_id: line.product_id || null,
        display_name: line.display_name || null,
        quantity: Number(line.quantity || 0),
        unit_price: Number(line.unit_price || 0),
        currency: line.currency || editing.currency,
        color: line.color || null,
      }));

      const { error: saveErr } = await saveSaleEdit({
        saleId: editing.saleId,
        sale: {
          sale_date: editing.sale_date || null,
          customer_id: editing.customer_id,
          status: editing.status,
          currency: editing.currency,
          discount: Number(editing.discount || 0),
          layby_id: editing.layby_id || null,
          layby_status: editing.layby_status || null,
          layby_notes: editing.layby_notes || null,
          layby_total_amount: Number(editing.layby_total_amount || editing.total_amount || 0),
        },
        items: itemsPayload,
      });
      if (saveErr) throw saveErr;

      logUserActivity({
        actionType: editing.layby_id ? 'layby' : 'sale',
        actionLabel: editing.layby_id ? 'Layby Sale Edited' : 'Sale Edited',
        details: `Receipt ${editing.receipt_number || editing.saleId} • ${itemsPayload.length} line${itemsPayload.length === 1 ? '' : 's'} • Status ${editing.status || 'n/a'}`,
        reference: editing.receipt_number || String(editing.saleId),
        entityType: editing.layby_id ? 'layby' : 'sale',
        entityId: editing.layby_id ? String(editing.layby_id) : String(editing.saleId),
      });

      // After save, refresh to pick up canonical financials from the DB
      setEditing(null);
      setEditItems([]);
      // Trigger a fresh load
      try { const snap = cacheGet(ALLSALES_CACHE_KEY); if (snap) cacheSet(ALLSALES_CACHE_KEY, null, 1); } catch {}
      // Refresh in background without showing the spinner
      loadAll();
    } catch (err) {
      console.error(err);
      alert('Failed to save changes: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="allsales-container">
      <div className="allsales-header">
        <BackToDashboard />
        <h2>All Sales & Laybys</h2>
        <input
          className="allsales-search"
          placeholder="Search by receipt, customer, or amount..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="allsales-edit-btn allsales-action-btn" onClick={handleExportCsv} disabled={!sortedRows.length}>
          Export CSV
        </button>
        <select
          className="allsales-search"
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{ maxWidth: 220 }}
        >
          <option value="date">Sort: Date (newest)</option>
          <option value="location">Sort: Location</option>
        </select>
        <select
          className="allsales-search"
          value={selectedLocation}
          onChange={e => setSelectedLocation(e.target.value)}
          style={{ maxWidth: 220 }}
        >
          <option value="all">All Locations</option>
          {locationOptions.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      </div>

      {loadError && (
        <div className="allsales-loading" style={{ color: '#ff8c8c', paddingTop: 0 }}>
          {loadError}
        </div>
      )}

      {(loading && sales.length === 0) ? (
        <div className="allsales-loading">Loading…</div>
      ) : (
        <div className="allsales-table-wrap">
          <table className="allsales-table">
            <thead>
              <tr>
                <th className="date-col">Date</th>
                <th className="receipt-col">Receipt #</th>
                <th className="customer-col">Customer</th>
                <th className="location-col">Location</th>
                <th className="status-col">Status</th>
                <th className="num-col total-col">Total</th>
                <th className="num-col paid-col">Paid</th>
                <th className="num-col outstanding-col">Outstanding</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customerGroups.map((group) => {
                const customerKey = String(group.customerKey || '');
                const expanded = expandedCustomers.has(customerKey);
                const loadingItems = itemsLoadingCustomerId === customerKey;
                const agg = aggregatesByCustomer[String(group.customerId || '')];
                const rows = [];
                group.rows.forEach((row, rowIdx) => {
                  rows.push(
                    <tr key={row.id}>
                      <td className="date-col">{row.sale_date ? new Date(row.sale_date).toLocaleDateString() : ''}</td>
                      <td className="receipt-col" title={row.receipt}>{row.receipt}</td>
                      <td className="customer-col" title={row.customerName || row.customer_id}>
                        {rowIdx === 0 ? (
                          <button
                            type="button"
                            className="allsales-expand-btn"
                            onClick={() => toggleCustomerExpanded(group)}
                            aria-expanded={expanded}
                            aria-label={expanded ? 'Collapse customer sales' : 'Expand customer sales'}
                          >
                            {loadingItems ? '…' : (expanded ? <FaChevronDown aria-hidden="true" /> : <FaChevronRight aria-hidden="true" />)}
                          </button>
                        ) : null}
                        <span>{row.customerName || row.customer_id}</span>
                      </td>
                      <td className="location-col" title={row.locationName || row.location_id || ''}>{row.locationName || row.location_id || ''}</td>
                      <td className="status-col">{row.computedStatus || row.status}</td>
                      <td className="num-col total-col">{formatCurrency(row.total_amount, row.currency || row.customer?.currency || 'K')}</td>
                      <td className="num-col paid-col">{formatCurrency(row.paid, row.currency || row.customer?.currency || 'K')}</td>
                      <td className="num-col outstanding-col">{formatCurrency(row.outstanding, row.currency || row.customer?.currency || 'K')}</td>
                      <td className="actions-col">
                        <div className="allsales-actions-group">
                          <button
                            type="button"
                            className="allsales-pdf-btn allsales-action-btn"
                            onClick={() => downloadSalePdf(row)}
                            disabled={pdfSaleId === row.id}
                            title="Download sale PDF receipt"
                            aria-label="Download sale PDF receipt"
                          >
                            {pdfSaleId === row.id ? '…' : <FaFilePdf aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            className="allsales-whatsapp-btn allsales-action-btn"
                            onClick={() => resendSaleWhatsApp(row)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              openWhatsAppPreview(row);
                            }}
                            disabled={whatsappSaleId === row.id}
                            title="Resend sale WhatsApp (right-click to preview)"
                            aria-label="Resend sale WhatsApp message"
                          >
                            {whatsappSaleId === row.id ? '…' : <FaWhatsapp aria-hidden="true" />}
                          </button>
                          <button className="allsales-edit-btn allsales-action-btn" onClick={() => openEdit(row)}>Edit</button>
                          <button
                            className="allsales-delete-btn allsales-action-btn"
                            onClick={() => openDeleteConfirm(row)}
                          >Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                  if (expanded) {
                    const saleItems = itemsBySaleId[String(row.id)] || [];
                    if (!saleItems.length) {
                      rows.push(
                        <tr key={`${row.id}-items-empty`} className="allsales-item-row">
                          <td colSpan={9} className="allsales-item-cell">No line items recorded for this sale.</td>
                        </tr>
                      );
                    } else {
                      saleItems.forEach((item, itemIdx) => {
                        const qty = Number(item?.quantity || 0);
                        const price = Number(item?.unit_price || 0);
                        const amount = qty * price;
                        const currency = item?.currency || row.currency || row.customer?.currency || 'K';
                        rows.push(
                          <tr key={`${row.id}-item-${itemIdx}`} className="allsales-item-row">
                            <td className="date-col"></td>
                            <td className="receipt-col"></td>
                            <td className="customer-col allsales-item-cell" colSpan={3}>
                              {qty} × {item.label || 'Product'}
                              {item?.color ? ` (${item.color})` : ''}
                            </td>
                            <td className="num-col total-col">{formatCurrency(price, currency)}</td>
                            <td className="num-col paid-col"></td>
                            <td className="num-col outstanding-col">{formatCurrency(amount, currency)}</td>
                            <td className="actions-col"></td>
                          </tr>
                        );
                      });
                    }
                  }
                });
                if (agg) {
                  rows.push(
                    <tr key={`agg-${group.customerId}`} className="allsales-customer-total-row">
                      <td className="date-col"></td>
                      <td className="receipt-col">—</td>
                      <td className="customer-col" title={`${group.customerName || group.customerId} - Totals`}>{group.customerName || group.customerId} — Totals</td>
                      <td className="location-col">—</td>
                      <td className="status-col">active</td>
                      <td className="num-col total-col">{formatCurrency(agg.total, agg.currency)}</td>
                      <td className="num-col paid-col">{formatCurrency(agg.paid, agg.currency)}</td>
                      <td className="num-col outstanding-col">{formatCurrency(agg.outstanding, agg.currency)}</td>
                      <td className="actions-col"></td>
                    </tr>
                  );
                }
                return rows;
              })}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: '#9aa4b2' }}>No results</td>
                </tr>
              )}
            </tbody>
          </table>
          {/* pagination removed to show all rows */}
        </div>
      )}

      <AllSalesModalPortal
        open={Boolean(editing)}
        onBackdropClick={(e) => { if (e.target.classList.contains('allsales-modal-overlay')) closeEdit(); }}
      >
        {editing && (
          <div className="allsales-modal allsales-modal--edit">
            <h3>Edit Sale #{editing.receipt}</h3>
            <div className="allsales-modal-body">
            <div className="allsales-form">
              <label>
                Customer
                <select value={editing.customer_id} onChange={e => setEditing({ ...editing, customer_id: e.target.value })}>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" value={editing.sale_date || ''} onChange={e => setEditing({ ...editing, sale_date: e.target.value })} />
              </label>
              <label>
                Status
                <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                  <option value="completed">completed</option>
                  <option value="layby">layby</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </label>
              <label>
                Currency
                <input value={editing.currency} onChange={e => setEditing({ ...editing, currency: e.target.value })} />
              </label>
              <label>
                Total Amount
                <input type="number" step="0.01" value={editing.total_amount} onChange={e => setEditing({ ...editing, total_amount: Number(e.target.value) })} disabled title="Total now derived from items minus discount" />
              </label>
              <label>
                Discount
                <input type="number" step="0.01" value={editing.discount} onChange={e => setEditing({ ...editing, discount: Number(e.target.value) })} />
              </label>
              {/* Down Payment is now tracked only via sales_payments; removed from direct editing */}

              {editing.status === 'layby' && (
                <div className="allsales-layby-block">
                  <label>
                    Layby Status
                    <select value={editing.layby_status} onChange={e => setEditing({ ...editing, layby_status: e.target.value })}>
                      <option value="active">active</option>
                      <option value="completed">completed</option>
                    </select>
                  </label>
                  <label>
                    Layby Total Amount
                    <input type="number" step="0.01" value={editing.layby_total_amount} onChange={e => setEditing({ ...editing, layby_total_amount: Number(e.target.value) })} />
                  </label>
                  <label>
                    Notes
                    <input value={editing.layby_notes} onChange={e => setEditing({ ...editing, layby_notes: e.target.value })} />
                  </label>
                </div>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: '8px 0', color: '#00b4d8' }}>Items</h4>
              {itemsLoading ? (
                <div>Loading items…</div>
              ) : (
                <div>
                  <table className="allsales-items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Product ID</th>
                        <th style={{ textAlign: 'left' }}>Name</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Unit Price</th>
                        <th style={{ textAlign: 'left' }}>Color</th>
                        <th style={{ textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((line, i) => {
                        const globalIdx = itemsStartIndex + i;
                        return (
                        <tr key={line._key || globalIdx}>
                          <td>
                            <input value={line.product_id || ''} onChange={e => setEditItems(items => items.map((it, idx) => idx === globalIdx ? { ...it, product_id: e.target.value || null } : it))} placeholder="UUID or empty for custom" />
                          </td>
                          <td>
                            <input value={line.display_name || ''} onChange={e => setEditItems(items => items.map((it, idx) => idx === globalIdx ? { ...it, display_name: e.target.value } : it))} placeholder="Name (for custom lines)" />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input type="number" step="1" min="0" value={Number(line.quantity || 0)} onChange={e => setEditItems(items => items.map((it, idx) => idx === globalIdx ? { ...it, quantity: Number(e.target.value) } : it))} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input type="number" step="0.01" value={Number(line.unit_price || 0)} onChange={e => setEditItems(items => items.map((it, idx) => idx === globalIdx ? { ...it, unit_price: Number(e.target.value) } : it))} />
                          </td>
                          <td>
                            <input value={line.color || ''} onChange={e => setEditItems(items => items.map((it, idx) => idx === globalIdx ? { ...it, color: e.target.value } : it))} placeholder="e.g. Red" />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="allsales-cancel-btn" onClick={() => setEditItems(items => items.filter((_, idx) => idx !== globalIdx))}>Remove</button>
                          </td>
                        </tr>
                        );
                      })}
                      {editItems.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: '#9aa4b2' }}>No items</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="allsales-edit-btn" onClick={() => setShowPicker(true)}>Add Item from Catalog</button>
                    <button className="allsales-edit-btn" onClick={() => setEditItems(items => {
                      const next = [...items, { _key: `tmp-${Date.now()}`, product_id: null, display_name: '', quantity: 1, unit_price: 0, currency: editing.currency, color: '' }];
                      const pc = Math.max(1, Math.ceil(next.length / itemsPageSize));
                      setItemsPage(pc);
                      return next;
                    })}>Add Custom Line</button>
                  </div>
                  <div className="allsales-items-pagination">
                    <button className="allsales-cancel-btn" onClick={() => setItemsPage(p => Math.max(1, p - 1))} disabled={itemsCurrentPage <= 1}>Prev</button>
                    <span className="allsales-page-indicator">Page {itemsCurrentPage} of {itemsPageCount}</span>
                    <button className="allsales-edit-btn" onClick={() => setItemsPage(p => Math.min(itemsPageCount, p + 1))} disabled={itemsCurrentPage >= itemsPageCount}>Next</button>
                  </div>
                </div>
              )}
            </div>
            </div>
            <div className="allsales-modal-actions">
              <button className="allsales-cancel-btn" onClick={closeEdit} disabled={saving}>Cancel</button>
              <button className="allsales-save-btn" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}
      </AllSalesModalPortal>

      <AllSalesModalPortal
        open={showPicker}
        onBackdropClick={(e) => { if (e.target.classList.contains('allsales-modal-overlay')) setShowPicker(false); }}
      >
        {showPicker && (
          <div className="allsales-modal allsales-modal--picker">
            <h3>Select Products or Sets</h3>
            <div className="allsales-modal-body">
              <input
                placeholder="Search by name or SKU..."
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 10 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <h4 style={{ margin: '6px 0' }}>Sets</h4>
                  <div className="catalog-list" style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #123', borderRadius: 6, padding: 6 }}>
                    {(catalogSets || [])
                      .filter(s => {
                        const q = pickerSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (String(s.name||'').toLowerCase().includes(q) || String(s.sku||'').toLowerCase().includes(q));
                      })
                      .slice(0, 200)
                      .map(s => (
                        <div key={`set-${s.id}`} className="catalog-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid #0d2230' }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{s.name}</div>
                            <div style={{ fontSize: 12, color: '#9aa4b2' }}>SKU: {s.sku || '—'}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ minWidth: 110, textAlign: 'right' }}>{(selectPrice(s.promotional_price, s.price) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {editing?.currency || s.currency || 'K'}</div>
                            <button className="allsales-edit-btn" onClick={() => { addSetLines(s); }}>Add</button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <h4 style={{ margin: '6px 0' }}>Products</h4>
                  <div className="catalog-list" style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #123', borderRadius: 6, padding: 6 }}>
                    {(catalogProducts || [])
                      .filter(p => {
                        const q = pickerSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (String(p.name||'').toLowerCase().includes(q) || String(p.sku||'').toLowerCase().includes(q));
                      })
                      .slice(0, 500)
                      .map(p => (
                        <div key={`prod-${p.id}`} className="catalog-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid #0d2230' }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 12, color: '#9aa4b2' }}>SKU: {p.sku || '—'}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ minWidth: 110, textAlign: 'right' }}>{(selectPrice(p.promotional_price, p.price) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {editing?.currency || p.currency || 'K'}</div>
                            <button className="allsales-edit-btn" onClick={() => { addProductLine(p); }}>Add</button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="allsales-modal-actions">
              <button className="allsales-cancel-btn" onClick={() => setShowPicker(false)}>Close</button>
            </div>
          </div>
        )}
      </AllSalesModalPortal>

      <AllSalesModalPortal
        open={deleteModal.open}
        onBackdropClick={(e) => {
          if (e.target.classList.contains('allsales-modal-overlay')) {
            setDeleteModal({ open: false, saleId: null, meta: null, pin: '', loading: false, error: '' });
          }
        }}
      >
        {deleteModal.open && (
          <div className="allsales-modal allsales-modal--confirm">
            <h3>Confirm Sale Deletion</h3>
            <div className="allsales-modal-body">
              <div className="allsales-delete-warning">
                This will permanently delete the sale, remove its payments/items, and restore inventory back to the sale's location.
              </div>
              {deleteModal.loading ? (
                <div>Loading details…</div>
              ) : (
                <div className="allsales-delete-meta">
                  <div>Sale ID/Receipt: {formatDisplayReceipt(deleteModal.meta?.sale || { id: deleteModal.saleId })}</div>
                  <ul>
                    <li>Items: {deleteModal.meta?.itemsCount ?? '-'}</li>
                    <li>Total units restored: {deleteModal.meta?.totalQty ?? '-'}</li>
                    <li>Payments (non-credit): {deleteModal.meta?.paymentsCount ?? 0} totalling {formatCurrency(deleteModal.meta?.paymentsSum || 0, deleteModal.meta?.sale?.currency || 'K')}</li>
                    {deleteModal.meta?.layby?.id && (
                      <li>Layby: #{deleteModal.meta?.layby?.id} (status: {deleteModal.meta?.layby?.status})</li>
                    )}
                  </ul>
                </div>
              )}
              {/* PIN entry removed */}
              {deleteModal.error && <div className="allsales-error-text">{deleteModal.error}</div>}
            </div>
            <div className="allsales-modal-actions">
              <button className="allsales-cancel-btn" onClick={() => setDeleteModal({ open: false, saleId: null, meta: null, pin: '', loading: false, error: '' })} disabled={deleteModal.loading}>Cancel</button>
              <button className="allsales-delete-btn" onClick={confirmDeleteSale} disabled={deleteModal.loading}>{deleteModal.loading ? 'Deleting…' : 'Confirm Delete'}</button>
            </div>
          </div>
        )}
      </AllSalesModalPortal>

      <AllSalesModalPortal
        open={whatsappPreview.open}
        onBackdropClick={() => setWhatsappPreview({
          open: false,
          loading: false,
          title: '',
          message: '',
          attachmentNote: '',
          error: '',
        })}
      >
        {whatsappPreview.open && (
          <div className="allsales-modal allsales-modal--whatsapp-preview" onClick={(e) => e.stopPropagation()}>
            <h3>{whatsappPreview.title || 'WhatsApp preview'}</h3>
            <p className="allsales-whatsapp-preview-hint">
              Right-click preview — text below matches what will be sent. Asterisks mark WhatsApp bold (*like this*).
            </p>
            <div className="allsales-modal-body">
              {whatsappPreview.loading && <div className="allsales-loading">Building preview…</div>}
              {whatsappPreview.error && <div className="allsales-error-text">{whatsappPreview.error}</div>}
              {!whatsappPreview.loading && !whatsappPreview.error && (
                <>
                  <pre className="allsales-whatsapp-preview-text">{whatsappPreview.message || '(No message text)'}</pre>
                  {whatsappPreview.attachmentNote ? (
                    <p className="allsales-whatsapp-preview-attachment">{whatsappPreview.attachmentNote}</p>
                  ) : null}
                </>
              )}
            </div>
            <div className="allsales-modal-actions">
              <button
                type="button"
                className="allsales-cancel-btn"
                onClick={() => setWhatsappPreview({
                  open: false,
                  loading: false,
                  title: '',
                  message: '',
                  attachmentNote: '',
                  error: '',
                })}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </AllSalesModalPortal>
    </div>
  );
}
